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
  Vector2,
  useThread,
} from '@motion-canvas/core';
import * as echarts from 'echarts';

type EChartsOption = echarts.EChartsCoreOption;
type EChartsInstance = echarts.ECharts;
type SetOptionOpts = Parameters<EChartsInstance['setOption']>[1];

export interface EChartProps extends RectProps {
  /**
   * Initial ECharts option configuration applied when the chart is created.
   *
   * @remarks
   * Read once at construction. To update the chart after creation, call
   * `chart.setOption(...)` from the scene generator. There is no
   * signal-based reactivity here; mutations are imperative and synchronous.
   */
  initialOption?: EChartsOption;

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
   * The device pixel ratio for the chart canvas.
   */
  devicePixelRatio?: SignalValue<number>;

  /**
   * Scale factor for the chart rendering.
   *
   * @remarks
   * Scales all chart elements (fonts, lines, symbols, etc.) by rendering at
   * a smaller logical size while keeping the canvas resolution the same.
   * For example, `chartScale={1.5}` makes everything 1.5x larger.
   */
  chartScale?: SignalValue<number>;
}

@nodeName('EChart')
export class EChart extends Rect {
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
   * @defaultValue 1
   */
  @initial(1)
  @signal()
  public declare readonly devicePixelRatio: SimpleSignal<number, this>;

  /**
   * Scale factor for chart rendering.
   *
   * @defaultValue 1
   */
  @initial(1)
  @signal()
  public declare readonly chartScale: SimpleSignal<number, this>;

  private readonly initialOption?: EChartsOption;
  private chart: EChartsInstance | null = null;
  private offscreen: HTMLCanvasElement | null = null;
  private lastWidth = 0;
  private lastHeight = 0;
  private lastDpr = 0;
  private lastTheme: string | object | null = null;
  private readonly thread: Thread;

  public constructor(props: EChartProps) {
    super(props);
    this.thread = useThread();
    this.initialOption = props.initialOption;
  }

  /**
   * Get or lazily create the underlying echarts instance.
   */
  @computed()
  public getChartInstance(): EChartsInstance {
    const size = this.computedSize();
    const s = this.chartScale();
    const w = size.x / s;
    const h = size.y / s;
    const dpr = this.devicePixelRatio() * s;

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

      // DPR or scale changed — must recreate the chart instance.
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

    // Apply the initial option synchronously now that the chart exists, so
    // the chart starts in a fully-populated state. Subsequent updates go
    // through `setOption(...)` directly.
    if (this.initialOption) {
      chart.setOption(this.initialOption, {lazyUpdate: false});
    }

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
   * Update the chart's options. Direct passthrough to ECharts' `setOption`.
   *
   * @remarks
   * Synchronous: the chart's internal model is updated immediately, and any
   * animations declared in the option begin on the next scene tick. Pass
   * native ECharts options (e.g. `{notMerge: true, replaceMerge: ['series']}`)
   * via the second argument; defaults to `{lazyUpdate: false}` so each call
   * is fully applied before returning.
   *
   * @example
   * ```ts
   * chart().setOption({series: [{data: [45, 65, 55, 90]}]});
   * yield* chart().waitForAnimation();
   * ```
   */
  public setOption(option: EChartsOption, opts?: SetOptionOpts): void {
    const chart = this.getChartInstance();
    chart.setOption(option, opts ?? {lazyUpdate: false});
  }

  protected override draw(context: CanvasRenderingContext2D) {
    this.drawShape(context);
    const alpha = this.alpha();

    if (alpha > 0) {
      const chart = this.getChartInstance();

      this.applyTheme();

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
   * Generator that yields until all chart animations have finished.
   *
   * @remarks
   * Use after a `setOption(...)` call to wait for the resulting animation
   * to play out before continuing the scene.
   *
   * @example
   * ```ts
   * chart().setOption({series: [{data: [45, 65, 55, 90]}]});
   * yield* chart().waitForAnimation();
   * ```
   */
  public *waitForAnimation(): Generator<void, void, void> {
    this.applyTheme();
    yield;
    this.flushUpdate();
    while (!this.getChartInstance().getZr().animation.isFinished()) {
      yield;
      this.flushUpdate();
    }
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
   * Convert a data-space coordinate to a motion-canvas local position.
   *
   * @remarks
   * Uses ECharts' `convertToPixel` internally and then maps the result
   * from the chart's logical pixel space to the node's local coordinate
   * system (centered origin, scaled by `chartScale`).
   *
   * @param finder - ECharts coordinate system finder, e.g.
   *   `{seriesIndex: 0}`, `{xAxisIndex: 0, yAxisIndex: 0}`, or `'grid'`.
   * @param dataCoord - The data-space coordinate, e.g. `[x, y]`.
   * @returns A {@link Vector2} in this node's local space.
   *
   * @example
   * ```ts
   * // Get the local position of data point (3.14, 0) on the first series
   * const pos = chart().dataToLocal({seriesIndex: 0}, [3.14, 0]);
   * // Use it to position a motion-canvas node
   * circle().position(pos);
   * ```
   */
  public dataToLocal(
    finder: Parameters<EChartsInstance['convertToPixel']>[0],
    dataCoord: number[],
  ): Vector2 {
    const chart = this.getChartInstance();
    this.applyTheme();
    this.flushUpdate();
    const pixel = chart.convertToPixel(finder, dataCoord);
    const s = this.chartScale();
    const size = this.computedSize();
    // ECharts pixel origin is top-left; motion-canvas local origin is center
    return new Vector2(pixel[0] * s - size.x / 2, pixel[1] * s - size.y / 2);
  }

  /**
   * Convert a motion-canvas local position to a data-space coordinate.
   *
   * @remarks
   * The inverse of {@link dataToLocal}. Maps a position in this node's
   * local coordinate system (centered origin) back to ECharts data space
   * using `convertFromPixel`.
   *
   * @param finder - ECharts coordinate system finder, e.g.
   *   `{seriesIndex: 0}`, `{xAxisIndex: 0, yAxisIndex: 0}`, or `'grid'`.
   * @param localPos - A position in this node's local space.
   * @returns The data-space coordinate as `[x, y]`.
   *
   * @example
   * ```ts
   * // Convert a local position back to data coordinates
   * const data = chart().localToData({seriesIndex: 0}, circle().position());
   * ```
   */
  public localToData(
    finder: Parameters<EChartsInstance['convertFromPixel']>[0],
    localPos: Vector2,
  ): number[] {
    const chart = this.getChartInstance();
    this.applyTheme();
    this.flushUpdate();
    const s = this.chartScale();
    const size = this.computedSize();
    // Reverse the dataToLocal transform: local → ECharts pixel
    const pixel: [number, number] = [
      (localPos.x + size.x / 2) / s,
      (localPos.y + size.y / 2) / s,
    ];
    return chart.convertFromPixel(finder, pixel);
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
