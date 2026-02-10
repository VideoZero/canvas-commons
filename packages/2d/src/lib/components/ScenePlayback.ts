import {
  BBox,
  DependencyContext,
  EditableTimeEvents,
  Logger,
  PlaybackManager,
  PlaybackState,
  PlaybackStatus,
  SceneDescription,
  SerializedVector2,
  SharedWebGLContext,
  SignalValue,
  SimpleSignal,
  ValueDispatcher,
  Vector2,
  clamp,
  createSceneMetadata,
  useThread,
} from '@motion-canvas/core';
import {computed, initial, nodeName, signal} from '../decorators';
import {DesiredLength} from '../partials';
import {Scene2D} from '../scenes/Scene2D';
import {Rect, RectProps} from './Rect';

export type ObjectFit = 'clip' | 'fill' | 'fit' | 'cover';

export interface ScenePlaybackProps extends RectProps {
  /**
   * The scene description to render, as returned by `makeScene2D()`.
   */
  src?: SignalValue<SceneDescription>;
  /**
   * The alpha value of the rendered scene.
   *
   * @remarks
   * Unlike opacity, the alpha value affects only the rendered scene itself,
   * leaving the fill, stroke, and children intact.
   *
   * @defaultValue 1
   */
  alpha?: SignalValue<number>;
  /**
   * Whether the rendered scene should be smoothed.
   *
   * @defaultValue true
   */
  smoothing?: SignalValue<boolean>;
  /**
   * Whether this scene should loop upon reaching the end.
   *
   * @defaultValue false
   */
  loop?: SignalValue<boolean>;
  /**
   * The rate at which the scene plays, as multiples of the normal speed.
   *
   * @defaultValue 1
   */
  playbackRate?: number;
  /**
   * The frames per second of the inner scene's playback.
   *
   * @defaultValue 60
   */
  fps?: SignalValue<number>;
  /**
   * The start of the playback range in seconds.
   *
   * @remarks
   * Together with {@link end}, defines the portion of the inner scene that
   * will be played. Time is clamped and looped within [start, end].
   *
   * @defaultValue 0
   */
  start?: SignalValue<number>;
  /**
   * The end of the playback range in seconds.
   *
   * @remarks
   * Together with {@link start}, defines the portion of the inner scene that
   * will be played. Set to `Infinity` (the default) to use the full scene
   * duration.
   *
   * @defaultValue Infinity
   */
  end?: SignalValue<number>;
  /**
   * Whether to start playing immediately.
   */
  play?: boolean;
  /**
   * The width of the inner scene's render canvas.
   *
   * @remarks
   * If not set, uses the size from the scene description (if it's a
   * {@link FullSceneDescription}), otherwise defaults to 1920.
   */
  renderWidth?: SignalValue<number | null>;
  /**
   * The height of the inner scene's render canvas.
   *
   * @remarks
   * If not set, uses the size from the scene description (if it's a
   * {@link FullSceneDescription}), otherwise defaults to 1080.
   */
  renderHeight?: SignalValue<number | null>;
  /**
   * How the rendered scene is projected onto the component's display area.
   *
   * @remarks
   * - `clip`: Render at natural 1:1 scale, centered, clipped to component bounds.
   * - `fill`: Stretch to fill component bounds (may distort aspect ratio).
   * - `fit`: Scale to fit inside bounds, maintaining aspect ratio (letterboxed).
   * - `cover`: Scale to cover bounds, maintaining aspect ratio (may crop).
   *
   * @defaultValue 'fill'
   */
  objectFit?: SignalValue<ObjectFit>;
}

/**
 * Run an async function with DependencyContext.promises temporarily isolated.
 *
 * This prevents the inner scene's async operations (which internally call
 * DependencyContext.consumePromises) from deadlocking with the outer scene's
 * promise consumption loop — they share the same global static array.
 */
async function withIsolatedPromises<T>(fn: () => Promise<T>): Promise<T> {
  const DC = DependencyContext as any;
  const saved = DC.promises;
  DC.promises = [];
  try {
    return await fn();
  } finally {
    // Merge back: any promises the outer scene added to our empty array
    // during the await, plus the original saved promises.
    const added = DC.promises;
    DC.promises = [...saved, ...added];
  }
}

@nodeName('ScenePlayback')
export class ScenePlayback extends Rect {
  /**
   * The scene description to render.
   */
  @signal()
  public declare readonly src: SimpleSignal<SceneDescription, this>;

  @initial(1)
  @signal()
  public declare readonly alpha: SimpleSignal<number, this>;

  @initial(true)
  @signal()
  public declare readonly smoothing: SimpleSignal<boolean, this>;

  @initial(false)
  @signal()
  public declare readonly loop: SimpleSignal<boolean, this>;

  @initial(1)
  @signal()
  public declare readonly playbackRate: SimpleSignal<number, this>;

  @initial(60)
  @signal()
  public declare readonly fps: SimpleSignal<number, this>;

  @initial(0)
  @signal()
  protected declare readonly time: SimpleSignal<number, this>;

  @initial(0)
  @signal()
  public declare readonly start: SimpleSignal<number, this>;

  @initial(Infinity)
  @signal()
  public declare readonly end: SimpleSignal<number, this>;

  @initial(false)
  @signal()
  protected declare readonly playing: SimpleSignal<boolean, this>;

  @initial(null)
  @signal()
  public declare readonly renderWidth: SimpleSignal<number | null, this>;

  @initial(null)
  @signal()
  public declare readonly renderHeight: SimpleSignal<number | null, this>;

  @initial('fill')
  @signal()
  public declare readonly objectFit: SimpleSignal<ObjectFit, this>;

  /**
   * Reactive signal that flips to true once the inner scene has been
   * recalculated and is ready to render frames. Reading this inside a
   * `@computed` creates a dependency so the computed re-evaluates when
   * initialization finishes.
   */
  @initial(false)
  @signal()
  private declare readonly innerReady: SimpleSignal<boolean, this>;

  /**
   * Monotonically increasing counter bumped each time a new offscreen frame
   * has been rendered. Reading it inside `@computed` creates a dependency.
   */
  @initial(0)
  @signal()
  private declare readonly frameVersion: SimpleSignal<number, this>;

  private innerPlayback: PlaybackManager | null = null;
  private innerPlaybackStatus: PlaybackStatus | null = null;
  private innerLogger: Logger | null = null;
  private innerSharedWebGLContext: SharedWebGLContext | null = null;
  private innerScene: Scene2D | null = null;
  private offscreenCanvas: HTMLCanvasElement | null = null;
  private offscreenContext: CanvasRenderingContext2D | null = null;
  private sceneDuration = 0;
  private lastRenderedFrame = -1;
  private initStarted = false;
  private renderingFrame = false;

  public constructor({play, ...props}: ScenePlaybackProps) {
    super(props);
    // Initialize time to the start of the playback range.
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

  public getDuration(): number {
    const lo = this.start();
    const hi = Math.min(this.end(), this.sceneDuration);
    return Math.max(0, hi - lo);
  }

  @computed()
  public override completion(): number {
    const lo = this.start();
    const hi = Math.min(this.end(), this.sceneDuration);
    const range = hi - lo;
    if (range <= 0) return 0;
    return (this.clampTime(this.time()) - lo) / range;
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
    const wasPlaying = this.playing();
    this.time(this.clampTime(time));
    if (wasPlaying) {
      this.play();
    } else {
      this.pause();
    }
  }

  public clampTime(time: number): number {
    const duration = this.sceneDuration;
    if (duration <= 0) return 0;
    const lo = this.start();
    const hi = Math.min(this.end(), duration);
    if (hi <= lo) return lo;
    if (this.loop()) {
      const range = hi - lo;
      time = lo + ((((time - lo) % range) + range) % range);
    }
    return clamp(lo, hi, time);
  }

  protected override desiredSize(): SerializedVector2<DesiredLength> {
    const custom = super.desiredSize();
    if (custom.x === null && custom.y === null) {
      const descSize = (this.src() as any)?.size;
      return {
        x: this.renderWidth() ?? descSize?.x ?? 1920,
        y: this.renderHeight() ?? descSize?.y ?? 1080,
      };
    }
    return custom;
  }

  private ensureInnerScene(): Scene2D | null {
    if (this.innerScene) return this.innerScene;

    const description = this.src();
    if (!description) return null;

    // Create inner playback infrastructure
    this.innerPlayback = new PlaybackManager();
    this.innerPlayback.fps = this.fps();
    this.innerPlayback.state = PlaybackState.Playing;
    this.innerPlaybackStatus = new PlaybackStatus(this.innerPlayback);
    this.innerLogger = new Logger();
    this.innerSharedWebGLContext = new SharedWebGLContext(this.innerLogger);

    const descSize = (description as any).size;
    const renderWidth = this.renderWidth() ?? descSize?.x ?? 1920;
    const renderHeight = this.renderHeight() ?? descSize?.y ?? 1080;

    // Create offscreen canvas
    this.offscreenCanvas = document.createElement('canvas');
    this.offscreenCanvas.width = renderWidth;
    this.offscreenCanvas.height = renderHeight;
    this.offscreenContext = this.offscreenCanvas.getContext('2d')!;

    const meta = description.meta ?? createSceneMetadata();

    const onReplaced = new ValueDispatcher<any>(null!);

    const fullDescription = {
      ...description,
      name: `ScenePlayback-${this.key}`,
      size: new Vector2(renderWidth, renderHeight),
      resolutionScale: 1,
      variables: null! as any,
      playback: this.innerPlaybackStatus,
      logger: this.innerLogger,
      onReplaced,
      timeEventsClass: EditableTimeEvents,
      sharedWebGLContext: this.innerSharedWebGLContext,
      experimentalFeatures: true,
      meta,
    };

    const scene = new description.klass(fullDescription) as Scene2D;
    this.innerScene = scene;
    this.innerPlayback.setup([scene]);

    return scene;
  }

  /**
   * Kick off recalculation of the inner scene to determine its duration.
   * Runs with isolated DependencyContext to avoid deadlocking the outer
   * scene's promise-consumption loop.
   */
  private startInit() {
    if (this.initStarted) return;
    this.initStarted = true;

    const scene = this.ensureInnerScene();
    if (!scene) return;

    withIsolatedPromises(async () => {
      const playback = this.innerPlayback!;
      await playback.recalculate();
      this.sceneDuration = playback.duration / playback.fps;
      // Flip the reactive signal — any @computed reading it will re-evaluate.
      this.innerReady(true);
    }).catch(e => {
      console.error('[ScenePlayback] recalculate failed:', e);
    });
  }

  /**
   * Seek the inner scene to `targetFrame` and render it onto the offscreen
   * canvas. Also isolated from the outer DependencyContext.
   */
  private requestFrame(targetFrame: number) {
    if (this.renderingFrame) return;
    this.renderingFrame = true;

    const scene = this.innerScene!;
    withIsolatedPromises(async () => {
      const playback = this.innerPlayback!;
      await playback.seek(targetFrame);

      const ctx = this.offscreenContext!;
      ctx.clearRect(
        0,
        0,
        this.offscreenCanvas!.width,
        this.offscreenCanvas!.height,
      );
      await scene.render(ctx);

      this.lastRenderedFrame = targetFrame;
      this.renderingFrame = false;
      // Bump the reactive counter so the @computed in renderedFrame re-runs.
      this.frameVersion(this.frameVersion() + 1);
    }).catch(e => {
      this.renderingFrame = false;
      console.error('[ScenePlayback] render failed:', e);
    });
  }

  @computed()
  private renderedFrame(): CanvasRenderingContext2D | null {
    // Reading innerReady creates a reactive dependency.
    if (!this.innerReady()) return null;

    // Reading frameVersion creates a dependency — when a new frame finishes
    // rendering asynchronously, this computed will be invalidated.
    this.frameVersion();

    const currentTime = this.clampTime(this.time());
    const fps = this.innerPlayback!.fps;
    const targetFrame = Math.round(currentTime * fps);

    if (targetFrame !== this.lastRenderedFrame) {
      this.requestFrame(targetFrame);
    }

    // Return the offscreen context even if the frame hasn't been rendered
    // yet — it'll contain either the last rendered content or be blank.
    // On the next re-evaluation (triggered by frameVersion bump) it will
    // have the correct content.
    return this.lastRenderedFrame >= 0 ? this.offscreenContext : null;
  }

  protected override draw(context: CanvasRenderingContext2D) {
    this.drawShape(context);

    // Trigger initialization on first draw
    this.startInit();

    const alpha = this.alpha();
    if (alpha > 0) {
      const offCtx = this.renderedFrame();
      if (offCtx && this.offscreenCanvas) {
        const box = BBox.fromSizeCentered(this.computedSize());
        context.save();
        context.clip(this.getPath());
        if (alpha < 1) {
          context.globalAlpha *= alpha;
        }
        context.imageSmoothingEnabled = this.smoothing();
        this.drawWithObjectFit(context, this.offscreenCanvas, box);
        context.restore();
      }
    }

    if (this.clip()) {
      context.clip(this.getPath());
    }

    this.drawChildren(context);
  }

  private drawWithObjectFit(
    context: CanvasRenderingContext2D,
    source: HTMLCanvasElement,
    destBox: BBox,
  ) {
    const srcW = source.width;
    const srcH = source.height;
    const dstW = destBox.width;
    const dstH = destBox.height;
    const fit = this.objectFit();

    switch (fit) {
      case 'fill': {
        context.drawImage(
          source,
          0,
          0,
          srcW,
          srcH,
          destBox.x,
          destBox.y,
          dstW,
          dstH,
        );
        break;
      }
      case 'fit': {
        const scale = Math.min(dstW / srcW, dstH / srcH);
        const w = srcW * scale;
        const h = srcH * scale;
        const x = destBox.x + (dstW - w) / 2;
        const y = destBox.y + (dstH - h) / 2;
        context.drawImage(source, 0, 0, srcW, srcH, x, y, w, h);
        break;
      }
      case 'cover': {
        const scale = Math.max(dstW / srcW, dstH / srcH);
        const w = srcW * scale;
        const h = srcH * scale;
        const x = destBox.x + (dstW - w) / 2;
        const y = destBox.y + (dstH - h) / 2;
        context.drawImage(source, 0, 0, srcW, srcH, x, y, w, h);
        break;
      }
      case 'clip':
      default: {
        // 1:1 scale, centered, clipped by the existing clip path
        const x = destBox.x + (dstW - srcW) / 2;
        const y = destBox.y + (dstH - srcH) / 2;
        context.drawImage(source, x, y);
        break;
      }
    }
  }

  protected override collectAsyncResources() {
    super.collectAsyncResources();
    this.startInit();
  }
}
