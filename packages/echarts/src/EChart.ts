import type {RectProps} from '@canvas-commons/2d';
import {Rect, drawImage, initial, nodeName, signal} from '@canvas-commons/2d';
import type {SignalValue, SimpleSignal, Thread} from '@canvas-commons/core';
import {BBox, Vector2, useThread} from '@canvas-commons/core';
import * as echarts from 'echarts';

type EChartsOption = echarts.EChartsCoreOption;
type EChartsInstance = echarts.ECharts;
type SetOptionOpts = Parameters<EChartsInstance['setOption']>[1];
type PixelFinder = Parameters<EChartsInstance['convertToPixel']>[0];

/**
 * A theme accepted by {@link EChart.theme}.
 *
 * @remarks
 * Either the name of a registered theme, a theme object, or an object with a
 * `theme` property naming a registered theme, such as {@link darkColors}.
 */
export type EChartTheme = string | object;

interface ZrClip {
  next: ZrClip | null;
  step(time: number, delta: number): boolean;
  ondestroy(): void;
}

/* eslint-disable @typescript-eslint/naming-convention -- zrender internals */
/**
 * The private parts of zrender's `Animation` that are replaced so the chart
 * follows the scene clock instead of `requestAnimationFrame` and `Date`.
 */
interface ZrAnimation {
  _running: boolean;
  _time: number;
  _head: ZrClip | null;
  stage: {update?: () => void};
  _startLoop(): void;
  update(notTriggerFrameAndStageUpdate?: boolean): void;
  removeClip(clip: ZrClip): void;
  trigger(event: 'frame', delta: number): void;
  stop(): void;
  isFinished(): boolean;
}
/* eslint-enable @typescript-eslint/naming-convention */

function resolveTheme(theme: EChartTheme): string | object {
  return typeof theme === 'object' &&
    'theme' in theme &&
    typeof theme.theme === 'string'
    ? theme.theme
    : theme;
}

export interface EChartProps extends RectProps {
  /**
   * The ECharts option applied when the chart is created.
   *
   * @remarks
   * Read once. Use {@link EChart.setOption} to update the chart afterwards.
   */
  initialOption?: EChartsOption;

  /**
   * {@inheritDoc EChart.theme}
   */
  theme?: SignalValue<EChartTheme | null>;

  /**
   * {@inheritDoc EChart.alpha}
   */
  alpha?: SignalValue<number>;

  /**
   * {@inheritDoc EChart.smoothing}
   */
  smoothing?: SignalValue<boolean>;

  /**
   * {@inheritDoc EChart.devicePixelRatio}
   */
  devicePixelRatio?: SignalValue<number>;

  /**
   * {@inheritDoc EChart.chartScale}
   */
  chartScale?: SignalValue<number>;
}

/**
 * Renders an {@link https://echarts.apache.org | Apache ECharts} chart.
 *
 * @remarks
 * The chart is drawn to an offscreen canvas and its animations run on the
 * scene's clock, so they are deterministic and render frame by frame. Update
 * the chart imperatively with {@link EChart.setOption} and wait for the
 * resulting transition with {@link EChart.waitForAnimation}.
 *
 * @example
 * ```tsx
 * import {makeScene2D} from '@canvas-commons/2d';
 * import {createRef} from '@canvas-commons/core';
 * import {EChart} from '@canvas-commons/echarts';
 *
 * export default makeScene2D(function* (view) {
 *   const chart = createRef<EChart>();
 *   view.add(
 *     <EChart
 *       ref={chart}
 *       size={[960, 540]}
 *       initialOption={{
 *         xAxis: {data: ['A', 'B', 'C']},
 *         yAxis: {},
 *         series: [{type: 'bar', data: [10, 20, 30]}],
 *       }}
 *     />,
 *   );
 *
 *   yield* chart().waitForAnimation();
 *   chart().setOption({series: [{data: [30, 10, 20]}]});
 *   yield* chart().waitForAnimation();
 * });
 * ```
 */
@nodeName('EChart')
export class EChart extends Rect {
  /**
   * The ECharts theme.
   *
   * @remarks
   * See {@link EChartTheme} for the accepted values. `null` uses the default
   * theme.
   */
  @initial(null)
  @signal()
  declare public readonly theme: SimpleSignal<EChartTheme | null, this>;

  /**
   * The alpha value of this chart.
   *
   * @remarks
   * Unlike opacity, the alpha value affects only the chart itself, leaving the
   * fill, stroke, and children intact.
   */
  @initial(1)
  @signal()
  declare public readonly alpha: SimpleSignal<number, this>;

  /**
   * Whether the chart should be smoothed when scaled.
   */
  @initial(true)
  @signal()
  declare public readonly smoothing: SimpleSignal<boolean, this>;

  /**
   * The device pixel ratio of the chart canvas.
   *
   * @remarks
   * Changing it recreates the chart; running chart animations jump to their
   * end.
   */
  @initial(1)
  @signal()
  declare public readonly devicePixelRatio: SimpleSignal<number, this>;

  /**
   * The scale at which chart elements are rendered.
   *
   * @remarks
   * Fonts, lines and symbols are scaled by this factor while the chart keeps
   * filling the node, so `chartScale={1.5}` makes everything 1.5 times larger.
   * Changing it recreates the chart; running chart animations jump to their
   * end.
   */
  @initial(1)
  @signal()
  declare public readonly chartScale: SimpleSignal<number, this>;

  private readonly initialOption: EChartsOption | undefined;
  private readonly thread: Thread;
  private chart: EChartsInstance | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private lastWidth = 0;
  private lastHeight = 0;
  private lastDpr = 0;
  private lastTheme: EChartTheme | null = null;

  public constructor(props: EChartProps) {
    super(props);
    this.thread = useThread();
    this.initialOption = props.initialOption;
  }

  /**
   * Get the underlying ECharts instance, creating or resizing it as needed.
   *
   * @example
   * ```ts
   * chart().getChartInstance().on('finished', () => console.log('done'));
   * ```
   */
  public getChartInstance(): EChartsInstance {
    const size = this.computedSize();
    const scale = this.chartScale();
    const width = size.x / scale;
    const height = size.y / scale;
    const dpr = this.devicePixelRatio() * scale;

    let previousOption: EChartsOption | null = null;
    if (this.chart) {
      if (this.lastDpr === dpr) {
        if (this.lastWidth !== width || this.lastHeight !== height) {
          this.chart.resize({width, height});
          this.lastWidth = width;
          this.lastHeight = height;
        }
        this.applyTheme(this.chart);
        return this.chart;
      }

      previousOption = this.chart.getOption();
      this.chart.dispose();
    }

    const canvas = document.createElement('canvas');
    const theme = this.theme();
    const chart = echarts.init(
      canvas,
      theme === null ? undefined : resolveTheme(theme),
      {renderer: 'canvas', width, height, devicePixelRatio: dpr},
    );
    this.followThreadTime(chart);

    this.chart = chart;
    this.canvas = canvas;
    this.lastWidth = width;
    this.lastHeight = height;
    this.lastDpr = dpr;
    this.lastTheme = theme;

    if (previousOption) {
      chart.setOption(
        {...previousOption, animation: false},
        {lazyUpdate: false},
      );
      chart.setOption(
        {animation: previousOption.animation ?? true},
        {lazyUpdate: false},
      );
    } else if (this.initialOption) {
      chart.setOption(this.initialOption, {lazyUpdate: false});
    }

    return chart;
  }

  /**
   * Update the chart's option.
   *
   * @remarks
   * A direct passthrough to ECharts' `setOption`. The option is applied
   * immediately and the resulting animations start on the next frame. `opts`
   * defaults to `{lazyUpdate: false}`; pass ECharts options such as
   * `{notMerge: true}` or `{replaceMerge: ['series']}` to replace parts of the
   * previous option.
   *
   * @param option - The ECharts option.
   * @param opts - ECharts' `setOption` options.
   *
   * @example
   * ```ts
   * chart().setOption({series: [{data: [45, 65, 55, 90]}]});
   * yield* chart().waitForAnimation();
   * ```
   */
  public setOption(option: EChartsOption, opts?: SetOptionOpts): void {
    this.getChartInstance().setOption(option, opts ?? {lazyUpdate: false});
  }

  /**
   * Wait until all chart animations have finished.
   *
   * @remarks
   * Always waits at least one frame so that the first frame of an animation
   * started by {@link EChart.setOption} is rendered.
   *
   * @example
   * ```ts
   * chart().setOption({series: [{data: [45, 65, 55, 90]}]});
   * yield* chart().waitForAnimation();
   * ```
   */
  public *waitForAnimation(): Generator<void, void, void> {
    let chart: EChartsInstance;
    do {
      yield;
      chart = this.getChartInstance();
      this.flushUpdate(chart);
    } while (!chart.getZr().animation.isFinished());
  }

  /**
   * Dispatch an ECharts action.
   *
   * @param payload - The action payload.
   *
   * @example
   * ```ts
   * chart().dispatchAction({type: 'highlight', seriesIndex: 0, dataIndex: 2});
   * yield* chart().waitForAnimation();
   * ```
   */
  public dispatchAction(payload: {type: string; [key: string]: unknown}) {
    const chart = this.getChartInstance();
    this.flushUpdate(chart);
    chart.dispatchAction(payload);
  }

  /**
   * Convert a coordinate in data space to the local space of this node.
   *
   * @param finder - The ECharts coordinate system finder, for example
   *   `{seriesIndex: 0}` or `{xAxisIndex: 0, yAxisIndex: 0}`.
   * @param dataCoord - The coordinate in data space.
   *
   * @example
   * ```ts
   * circle().position(chart().dataToLocal({seriesIndex: 0}, [3, 20]));
   * ```
   */
  public dataToLocal(finder: PixelFinder, dataCoord: number[]): Vector2 {
    const chart = this.getChartInstance();
    this.flushUpdate(chart);
    const [x, y] = chart.convertToPixel(finder, dataCoord);
    const scale = this.chartScale();
    const size = this.computedSize();
    return new Vector2(x * scale - size.x / 2, y * scale - size.y / 2);
  }

  /**
   * Convert a position in the local space of this node to data space.
   *
   * @remarks
   * The inverse of {@link EChart.dataToLocal}.
   *
   * @param finder - The ECharts coordinate system finder, for example
   *   `{seriesIndex: 0}` or `{xAxisIndex: 0, yAxisIndex: 0}`.
   * @param localPosition - The position in local space.
   *
   * @example
   * ```ts
   * const [x, y] = chart().localToData({seriesIndex: 0}, circle().position());
   * ```
   */
  public localToData(finder: PixelFinder, localPosition: Vector2): number[] {
    const chart = this.getChartInstance();
    this.flushUpdate(chart);
    const scale = this.chartScale();
    const size = this.computedSize();
    return chart.convertFromPixel(finder, [
      (localPosition.x + size.x / 2) / scale,
      (localPosition.y + size.y / 2) / scale,
    ]);
  }

  public override dispose() {
    this.chart?.dispose();
    this.chart = null;
    this.canvas = null;
    super.dispose();
  }

  protected override draw(context: CanvasRenderingContext2D) {
    this.drawShape(context);
    const alpha = this.alpha();
    if (alpha > 0) {
      const chart = this.getChartInstance();
      this.flushUpdate(chart);
      chart.getZr().refreshImmediately();

      if (this.canvas) {
        const box = BBox.fromSizeCentered(this.computedSize());
        context.save();
        context.clip(this.getPath());
        if (alpha < 1) {
          context.globalAlpha *= alpha;
        }
        context.imageSmoothingEnabled = this.smoothing();
        drawImage(context, this.canvas, box);
        context.restore();
      }
    }

    if (this.clip()) {
      context.clip(this.getPath());
    }

    this.drawChildren(context);
  }

  private applyTheme(chart: EChartsInstance) {
    const theme = this.theme();
    if (theme !== this.lastTheme) {
      this.lastTheme = theme;
      chart.setTheme(theme === null ? {} : resolveTheme(theme));
    }
  }

  /**
   * Step the chart's animations to the current time and process pending
   * updates.
   */
  private flushUpdate(chart: EChartsInstance) {
    chart.getZr().animation.update();
  }

  private followThreadTime(chart: EChartsInstance) {
    // zrender's Animation keeps its clock and loop in private members.
    const animation = chart.getZr().animation as unknown as ZrAnimation;
    const thread = this.thread;
    animation.stop();
    animation._startLoop = function () {
      this._running = true;
    };
    animation.update = function (notTriggerFrameAndStageUpdate) {
      const time = thread.time() * 1000;
      const delta = time - this._time;
      let clip = this._head;
      while (clip) {
        const next = clip.next;
        if (clip.step(time, delta)) {
          clip.ondestroy();
          this.removeClip(clip);
        }
        clip = next;
      }
      this._time = time;
      if (!notTriggerFrameAndStageUpdate) {
        this.trigger('frame', delta);
        this.stage.update?.();
      }
    };
    animation._startLoop();
    animation._time = thread.time() * 1000;
    chart.getZr().setSleepAfterStill(0);
  }
}
