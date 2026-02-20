import {
  Rect,
  RectProps,
  computed,
  drawImage,
  initial,
  nodeName,
  signal,
} from '@motion-canvas/2d';
import {
  BBox,
  SignalValue,
  SimpleSignal,
  Thread,
  useThread,
} from '@motion-canvas/core';
import * as echarts from 'echarts';

type EChartsOption = echarts.EChartsCoreOption;
type EChartsInstance = echarts.ECharts;

export interface SetChartOptionOpts {
  notMerge?: boolean;
  silent?: boolean;
  replaceMerge?: string | string[];
}

export interface EChartProps extends RectProps {
  /**
   * The ECharts option configuration for this chart.
   */
  option?: SignalValue<EChartsOption>;

  /**
   * The ECharts theme to use.
   *
   * @remarks
   * Can be a registered theme name string or a theme object.
   */
  theme?: SignalValue<string | object | null>;

  /**
   * The alpha value of this chart.
   *
   * @remarks
   * Unlike opacity, the alpha value affects only the chart itself, leaving the
   * fill, stroke, and children intact.
   */
  alpha?: SignalValue<number>;

  /**
   * Whether the chart canvas should be smoothed when scaled.
   */
  smoothing?: SignalValue<boolean>;

  /**
   * Whether to replace options instead of merging.
   *
   * @remarks
   * When true, `setOption` is called with `notMerge: true`, fully replacing
   * the previous config. Use this when switching between different chart types.
   */
  notMerge?: SignalValue<boolean>;

  /**
   * The device pixel ratio for the chart canvas.
   */
  devicePixelRatio?: SignalValue<number>;
}

@nodeName('EChart')
export class EChart extends Rect {
  /**
   * The ECharts option configuration for this chart.
   */
  @signal()
  public declare readonly option: SimpleSignal<EChartsOption, this>;

  /**
   * The ECharts theme to use.
   */
  @initial(null)
  @signal()
  public declare readonly theme: SimpleSignal<string | object | null, this>;

  /**
   * The alpha value of this chart.
   *
   * @remarks
   * Unlike opacity, the alpha value affects only the chart itself, leaving the
   * fill, stroke, and children intact.
   */
  @initial(1)
  @signal()
  public declare readonly alpha: SimpleSignal<number, this>;

  /**
   * Whether the chart canvas should be smoothed when scaled.
   *
   * @defaultValue true
   */
  @initial(true)
  @signal()
  public declare readonly smoothing: SimpleSignal<boolean, this>;

  /**
   * The device pixel ratio for the chart canvas.
   *
   * @defaultValue 2
   */
  @initial(2)
  @signal()
  public declare readonly devicePixelRatio: SimpleSignal<number, this>;

  /**
   * Whether to replace options instead of merging.
   *
   * @defaultValue false
   */
  @initial(false)
  @signal()
  public declare readonly notMerge: SimpleSignal<boolean, this>;

  private chart: EChartsInstance | null = null;
  private offscreen: HTMLCanvasElement | null = null;
  private lastWidth = 0;
  private lastHeight = 0;
  private lastDpr = 0;
  private lastTheme: string | object | null = null;
  private lastOptions: EChartsOption | null = null;
  private readonly thread: Thread;

  public constructor(props: EChartProps) {
    super(props);
    this.thread = useThread();
  }

  /**
   * Get or lazily create the underlying echarts instance.
   */
  @computed()
  public getChartInstance(): EChartsInstance {
    const size = this.computedSize();
    const w = size.x;
    const h = size.y;
    const dpr = this.devicePixelRatio();

    if (this.chart) {
      if (
        this.lastWidth === w &&
        this.lastHeight === h &&
        this.lastDpr === dpr
      ) {
        return this.chart;
      }

      if (this.lastDpr === dpr) {
        // Size changed — resize in place instead of recreating.
        this.chart.resize({width: w, height: h});
        this.lastWidth = w;
        this.lastHeight = h;
        return this.chart;
      }

      // DPR changed — must recreate the chart instance.
      this.chart.dispose();
      this.chart = null;
      this.offscreen = null;
    }

    const canvas = document.createElement('canvas');
    this.offscreen = canvas;

    const rawTheme = this.theme();
    const themeId =
      rawTheme && typeof rawTheme === 'object' && 'theme' in rawTheme
        ? (rawTheme as any).theme
        : rawTheme;
    const chart = echarts.init(canvas as unknown as HTMLElement, themeId, {
      renderer: 'canvas',
      width: w,
      height: h,
      devicePixelRatio: dpr,
    });

    const zr = chart.getZr();
    const anim = zr.animation as any;
    // Stop the automatic RAF loop that zrender starts in non-SSR mode.
    anim.stop();
    // Patch _startLoop to skip the RAF loop — just mark as running.
    anim._startLoop = function () {
      this._running = true;
    };
    // Patch update to use scene thread time instead of Date.now().
    const thread = this.thread;
    anim._time = thread.time() * 1000;
    anim.update = function (notTriggerFrameAndStageUpdate?: boolean) {
      const time = thread.time() * 1000;
      const delta = time - this._time;
      let clip = this._head;
      while (clip) {
        const nextClip = clip.next;
        if (clip.step(time, delta)) {
          clip.ondestroy();
          this.removeClip(clip);
        }
        clip = nextClip;
      }
      this._time = time;
      if (!notTriggerFrameAndStageUpdate) {
        this.trigger('frame', delta);
        this.stage.update && this.stage.update();
      }
    };
    anim._pausedTime = 0;
    anim.start();
    zr.setSleepAfterStill(0);

    this.chart = chart;
    this.lastWidth = w;
    this.lastHeight = h;
    this.lastDpr = dpr;
    this.lastOptions = null;

    return chart;
  }

  /**
   * Apply the current theme signal value to the chart if it changed.
   */
  @computed()
  private applyTheme(): void {
    const chart = this.getChartInstance();
    const theme = this.theme();
    if (theme !== this.lastTheme) {
      this.lastTheme = theme;
      if (theme != null) {
        const themeId =
          typeof theme === 'object' && 'theme' in theme
            ? (theme as any).theme
            : theme;
        (chart as any).setTheme(themeId);
      }
    }
  }

  /**
   * Apply the current options signal value to the chart if it changed.
   */
  @computed()
  private applyOptions(): void {
    const chart = this.getChartInstance();
    const opts = this.option();
    if (opts && opts !== this.lastOptions) {
      this.lastOptions = opts;
      chart.setOption(opts, {notMerge: this.notMerge(), lazyUpdate: true});
    }
  }

  protected override draw(context: CanvasRenderingContext2D) {
    this.drawShape(context);
    const alpha = this.alpha();

    if (alpha > 0) {
      const chart = this.getChartInstance();

      this.applyTheme();
      this.applyOptions();

      const zr = chart.getZr();
      zr.animation.update();
      zr.refreshImmediately();

      if (this.offscreen) {
        const box = BBox.fromSizeCentered(this.computedSize());
        context.save();
        context.clip(this.getPath());
        if (alpha < 1) {
          context.globalAlpha *= alpha;
        }
        context.imageSmoothingEnabled = this.smoothing();
        drawImage(context, this.offscreen, box);
        context.restore();
      }
    }

    if (this.clip()) {
      context.clip(this.getPath());
    }

    this.drawChildren(context);
  }

  /**
   * Generator that yields until all echarts animations have completed.
   *
   * @remarks
   * Flushes pending lazy updates on the first call so animation clips are
   * created even when `draw()` hasn't run yet (e.g. during scene
   * recalculation). On each subsequent yield it steps the animation forward
   * so clips progress and eventually finish.
   *
   * @example
   * ```ts
   * yield* chart().animationCompleted();
   * ```
   */
  public *animationCompleted(): Generator<void, void, void> {
    // Apply pending signal changes and flush so echarts processes
    // the lazy update and creates animation clips.
    this.applyTheme();
    this.applyOptions();

    yield;
    this.flushUpdate();

    while (!this.getChartInstance().getZr().animation.isFinished()) {
      yield;
      this.flushUpdate();
    }
  }

  /**
   * Highlight series/data.
   */
  public highlight(seriesIndex: number, dataIndex?: number) {
    this.dispatchAction({
      type: 'highlight',
      seriesIndex,
      dataIndex,
    });
  }

  /**
   * Downplay (un-highlight) series/data.
   */
  public downplay(seriesIndex: number, dataIndex?: number) {
    this.dispatchAction({
      type: 'downplay',
      seriesIndex,
      dataIndex,
    });
  }

  /**
   * Dispatch an arbitrary ECharts action.
   *
   * @remarks
   * Flushes any pending lazy updates before dispatching so the echarts
   * model and scheduler pipeline are fully initialized.
   */
  public dispatchAction(payload: {type: string; [key: string]: unknown}) {
    if (this.chart) {
      this.applyTheme();
      this.applyOptions();
      this.flushUpdate();
      this.chart.dispatchAction(payload);
    }
  }

  /**
   * Flush pending lazy updates by advancing the zrender animation cycle.
   *
   * @remarks
   * Triggers a single `animation.update()` which fires the `'frame'` event.
   * This causes echarts' `_onframe` to process any `PENDING_UPDATE` (from
   * `setOption({lazyUpdate: true})`) and steps all active animation clips.
   */
  private flushUpdate() {
    // Ensure pending signal changes are applied before flushing.
    if (!this.chart) return;
    this.chart.getZr().animation.update();
  }

  /**
   * Dispose the chart instance and clean up resources.
   */
  public override dispose() {
    if (this.chart) {
      this.chart.dispose();
      this.chart = null;
      this.offscreen = null;
    }
    super.dispose();
  }
}
