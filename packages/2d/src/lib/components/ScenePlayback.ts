import {
  BBox,
  DependencyContext,
  DescriptionOf,
  EditableTimeEvents,
  FullSceneDescription,
  PlaybackManager,
  PlaybackState,
  PlaybackStatus,
  Scene,
  SerializedVector2,
  SharedWebGLContext,
  SignalValue,
  SimpleSignal,
  ValueDispatcher,
  Vector2,
  clamp,
  useLogger,
  useThread,
} from '@canvas-commons/core';
import {computed, initial, nodeName, signal} from '../decorators';
import {DesiredLength} from '../partials';
import type {Scene2D} from '../scenes/Scene2D';
import {useScene2D} from '../scenes/useScene2D';
import {Rect, RectProps} from './Rect';

/**
 * How the frames of a {@link ScenePlayback} are fitted into its bounds.
 *
 * @remarks
 * - `clip` - draw the frame at its natural size, centered and clipped.
 * - `fill` - stretch the frame to the bounds.
 * - `fit` - scale the frame to fit inside the bounds, keeping its aspect ratio.
 * - `cover` - scale the frame to cover the bounds, keeping its aspect ratio.
 */
export type ObjectFit = 'clip' | 'fill' | 'fit' | 'cover';

type SceneSource = DescriptionOf<Scene2D>;

export interface ScenePlaybackProps extends RectProps {
  /**
   * {@inheritDoc ScenePlayback.src}
   */
  src?: SignalValue<SceneSource>;
  /**
   * {@inheritDoc ScenePlayback.alpha}
   */
  alpha?: SignalValue<number>;
  /**
   * {@inheritDoc ScenePlayback.smoothing}
   */
  smoothing?: SignalValue<boolean>;
  /**
   * {@inheritDoc ScenePlayback.loop}
   */
  loop?: SignalValue<boolean>;
  /**
   * {@inheritDoc ScenePlayback.playbackRate}
   */
  playbackRate?: SignalValue<number>;
  /**
   * {@inheritDoc ScenePlayback.fps}
   */
  fps?: SignalValue<number>;
  /**
   * {@inheritDoc ScenePlayback.start}
   */
  start?: SignalValue<number>;
  /**
   * {@inheritDoc ScenePlayback.end}
   */
  end?: SignalValue<number>;
  /**
   * Whether to start playing immediately.
   */
  play?: boolean;
  /**
   * {@inheritDoc ScenePlayback.renderWidth}
   */
  renderWidth?: SignalValue<number | null>;
  /**
   * {@inheritDoc ScenePlayback.renderHeight}
   */
  renderHeight?: SignalValue<number | null>;
  /**
   * {@inheritDoc ScenePlayback.objectFit}
   */
  objectFit?: SignalValue<ObjectFit>;
}

interface InnerPlayback {
  playback: PlaybackManager;
  scene: Scene;
  webgl: SharedWebGLContext;
  context: CanvasRenderingContext2D | null;
}

/**
 * A node that plays another scene.
 *
 * @remarks
 * The inner scene runs its own playback and is rendered onto an offscreen
 * canvas, which is then drawn into the bounds of this node. Its playback is
 * controlled like a {@link Video}: with {@link play}, {@link pause} and
 * {@link seek}.
 *
 * Frames of the inner scene are rendered asynchronously. A frame is drawn as
 * soon as it's ready, until then the previous one is shown.
 *
 * @preview
 * ```tsx editor
 * import {Circle, makeScene2D, ScenePlayback} from '@canvas-commons/2d';
 * import {waitFor} from '@canvas-commons/core';
 *
 * const inner = makeScene2D(function* (view) {
 *   const circle = <Circle size={240} fill={'#e13238'} />;
 *   view.add(circle);
 *   yield* circle.scale(0.5, 1).to(1, 1);
 * });
 *
 * export default makeScene2D(function* (view) {
 *   view.add(
 *     <ScenePlayback src={inner} width={640} radius={16} play loop />,
 *   );
 *   yield* waitFor(4);
 * });
 * ```
 */
@nodeName('ScenePlayback')
export class ScenePlayback extends Rect {
  /**
   * The scene to play, as returned by `makeScene2D`.
   */
  @signal()
  declare public readonly src: SimpleSignal<SceneSource, this>;

  /**
   * The alpha value of the rendered scene.
   *
   * @remarks
   * Unlike opacity, the alpha value affects only the rendered scene, leaving
   * the fill, stroke, and children intact.
   */
  @initial(1)
  @signal()
  declare public readonly alpha: SimpleSignal<number, this>;

  /**
   * Whether the rendered scene should be smoothed when scaled.
   */
  @initial(true)
  @signal()
  declare public readonly smoothing: SimpleSignal<boolean, this>;

  /**
   * Whether the scene should loop upon reaching the end of the playback
   * range.
   */
  @initial(false)
  @signal()
  declare public readonly loop: SimpleSignal<boolean, this>;

  /**
   * The speed of the playback, as a multiple of the normal speed.
   */
  @initial(1)
  @signal()
  declare public readonly playbackRate: SimpleSignal<number, this>;

  /**
   * The frame rate of the inner scene.
   *
   * @remarks
   * Read once, when the inner scene is created.
   */
  @initial(60)
  @signal()
  declare public readonly fps: SimpleSignal<number, this>;

  /**
   * The start of the playback range, in seconds.
   */
  @initial(0)
  @signal()
  declare public readonly start: SimpleSignal<number, this>;

  /**
   * The end of the playback range, in seconds.
   *
   * @remarks
   * `Infinity` plays the scene until its end.
   */
  @initial(Infinity)
  @signal()
  declare public readonly end: SimpleSignal<number, this>;

  /**
   * The width of the inner scene, in pixels.
   *
   * @remarks
   * `null` uses the size of the scene description, if it has one, or `1920`.
   * Read once, when the inner scene is created.
   */
  @initial(null)
  @signal()
  declare public readonly renderWidth: SimpleSignal<number | null, this>;

  /**
   * The height of the inner scene, in pixels.
   *
   * @remarks
   * `null` uses the size of the scene description, if it has one, or `1080`.
   * Read once, when the inner scene is created.
   */
  @initial(null)
  @signal()
  declare public readonly renderHeight: SimpleSignal<number | null, this>;

  /**
   * How the rendered scene is fitted into the bounds of this node.
   */
  @initial('fill')
  @signal()
  declare public readonly objectFit: SimpleSignal<ObjectFit, this>;

  @initial(0)
  @signal()
  declare protected readonly time: SimpleSignal<number, this>;

  @initial(false)
  @signal()
  declare protected readonly playing: SimpleSignal<boolean, this>;

  /**
   * The duration of the inner scene in seconds, or `null` until the scene has
   * been recalculated.
   */
  @initial(null)
  @signal()
  declare protected readonly sceneDuration: SimpleSignal<number | null, this>;

  @initial(0)
  @signal()
  declare private readonly frameVersion: SimpleSignal<number, this>;

  private inner: InnerPlayback | null = null;
  private initStarted = false;
  private renderingFrame = false;
  private lastRenderedFrame = -1;

  public constructor({play, ...props}: ScenePlaybackProps) {
    super(props);
    this.time(this.start());
    if (play) {
      this.play();
    }
  }

  public isPlaying(): boolean {
    return this.playing();
  }

  public getCurrentTime(): number {
    return this.clampTime(this.time());
  }

  /**
   * Get the duration of the playback range in seconds.
   *
   * @remarks
   * Returns `0` until the inner scene has been recalculated.
   */
  public getDuration(): number {
    const [start, end] = this.range();
    return Math.max(0, end - start);
  }

  @computed()
  public override completion(): number {
    const [start, end] = this.range();
    if (end <= start) {
      return 0;
    }
    return (this.clampTime(this.time()) - start) / (end - start);
  }

  public play() {
    const time = useThread().time;
    const threadStart = time();
    const offset = this.time();
    const rate = this.playbackRate();
    this.playing(true);
    this.time(() => this.clampTime(offset + (time() - threadStart) * rate));
  }

  public pause() {
    this.playing(false);
    this.time.save();
  }

  public seek(time: number) {
    const playing = this.playing();
    this.time(this.clampTime(time));
    if (playing) {
      this.play();
    } else {
      this.pause();
    }
  }

  /**
   * Clamp the given time to the playback range, wrapping it when looping.
   *
   * @param time - The time in seconds.
   */
  public clampTime(time: number): number {
    const [start, end] = this.range();
    if (this.sceneDuration() === null || !isFinite(time)) {
      return start;
    }
    if (end <= start) {
      return start;
    }
    if (this.loop()) {
      const length = end - start;
      time = start + ((((time - start) % length) + length) % length);
    }
    return clamp(start, end, time);
  }

  public override dispose() {
    if (this.inner) {
      this.inner.webgl.dispose();
      this.inner = null;
    }
    super.dispose();
  }

  /**
   * The size of the inner scene.
   */
  @computed()
  protected renderSize(): Vector2 {
    const src = this.src();
    const size =
      src && 'size' in src && src.size instanceof Vector2
        ? src.size
        : new Vector2(1920, 1080);
    return new Vector2(
      this.renderWidth() ?? size.width,
      this.renderHeight() ?? size.height,
    );
  }

  protected range(): [number, number] {
    const start = this.start();
    return [start, Math.min(this.end(), this.sceneDuration() ?? start)];
  }

  protected override desiredSize(): SerializedVector2<DesiredLength> {
    const custom = super.desiredSize();
    if (custom.x === null && custom.y === null) {
      const size = this.renderSize();
      return {x: size.width, y: size.height};
    }
    return custom;
  }

  protected override applyFlex() {
    super.applyFlex();
    const size = this.renderSize();
    this.yogaNode.setAspectRatio(this.ratio() ?? size.width / size.height);
  }

  protected override collectAsyncResources() {
    super.collectAsyncResources();
    this.startInit();
  }

  protected override draw(context: CanvasRenderingContext2D) {
    this.drawShape(context);
    this.startInit();

    const alpha = this.alpha();
    const frame = alpha > 0 ? this.renderedFrame() : null;
    if (frame) {
      const box = BBox.fromSizeCentered(this.computedSize());
      context.save();
      context.clip(this.getPath());
      if (alpha < 1) {
        context.globalAlpha *= alpha;
      }
      context.imageSmoothingEnabled = this.smoothing();
      this.drawFitted(context, frame.canvas, box);
      context.restore();
    }

    if (this.clip()) {
      context.clip(this.getPath());
    }

    this.drawChildren(context);
  }

  @computed()
  private renderedFrame(): CanvasRenderingContext2D | null {
    if (this.sceneDuration() === null || !this.inner) {
      return null;
    }
    this.frameVersion();

    const frame = Math.round(
      this.clampTime(this.time()) * this.inner.playback.fps,
    );
    if (frame !== this.lastRenderedFrame) {
      this.requestFrame(this.inner, frame);
    }

    return this.lastRenderedFrame >= 0 ? this.inner.context : null;
  }

  private createInner(): InnerPlayback | null {
    const description = this.src();
    if (!description) {
      return null;
    }

    const outer = useScene2D();
    const playback = new PlaybackManager();
    playback.fps = this.fps();
    playback.state = PlaybackState.Playing;
    const webgl = new SharedWebGLContext(outer.logger);

    type Full = FullSceneDescription<SceneSource['config']>;
    let onReplaced: ValueDispatcher<Full> | null = null;
    const full = {
      ...description,
      name: `${outer.name}/${this.key}`,
      size: this.renderSize(),
      resolutionScale: 1,
      variables: outer.variables,
      playback: new PlaybackStatus(playback),
      logger: outer.logger,
      timeEventsClass: EditableTimeEvents,
      sharedWebGLContext: webgl,
      experimentalFeatures: outer.experimentalFeatures,
      get onReplaced(): ValueDispatcher<Full> {
        onReplaced ??= new ValueDispatcher<Full>(full);
        return onReplaced;
      },
    };

    const scene = new description.klass(full);
    playback.setup([scene]);
    return {playback, scene, webgl, context: null};
  }

  private startInit() {
    if (this.initStarted) {
      return;
    }
    this.initStarted = true;

    const inner = this.createInner();
    if (!inner) {
      return;
    }
    this.inner = inner;
    const logger = useLogger();

    DependencyContext.isolatePromises(() => inner.playback.recalculate())
      .then(() => {
        if (this.inner === inner) {
          this.sceneDuration(inner.playback.duration / inner.playback.fps);
        }
      })
      .catch(error => {
        logger.error({
          message: 'Failed to recalculate the scene of a ScenePlayback.',
          remarks: `${error}`,
          inspect: this.key,
        });
      });
  }

  private requestFrame(inner: InnerPlayback, frame: number) {
    if (this.renderingFrame) {
      return;
    }
    this.renderingFrame = true;
    const logger = useLogger();
    const size = this.renderSize();

    DependencyContext.isolatePromises(async () => {
      if (!inner.context) {
        inner.context = document.createElement('canvas').getContext('2d');
      }
      const context = inner.context;
      if (!context) {
        throw new Error('Could not create a canvas for the scene.');
      }
      context.canvas.width = size.width;
      context.canvas.height = size.height;

      await inner.playback.seek(frame);
      context.clearRect(0, 0, size.width, size.height);
      await inner.scene.render(context);
    })
      .then(() => {
        this.lastRenderedFrame = frame;
        this.frameVersion(this.frameVersion() + 1);
      })
      .catch(error => {
        logger.error({
          message: 'Failed to render the scene of a ScenePlayback.',
          remarks: `${error}`,
          inspect: this.key,
        });
      })
      .finally(() => {
        this.renderingFrame = false;
      });
  }

  protected drawFitted(
    context: CanvasRenderingContext2D,
    source: HTMLCanvasElement,
    box: BBox,
  ) {
    const {width, height} = source;
    const fit = this.objectFit();
    if (fit === 'fill') {
      context.drawImage(source, box.x, box.y, box.width, box.height);
      return;
    }

    const scale =
      fit === 'fit'
        ? Math.min(box.width / width, box.height / height)
        : fit === 'cover'
          ? Math.max(box.width / width, box.height / height)
          : 1;
    const fitted = BBox.fromSizeCentered(
      new Vector2(width * scale, height * scale),
    );
    context.drawImage(
      source,
      box.center.x + fitted.x,
      box.center.y + fitted.y,
      fitted.width,
      fitted.height,
    );
  }
}
