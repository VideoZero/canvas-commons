import {Scene2D, makeScene2D} from '@canvas-commons/2d';
import type {
  FullSceneDescription,
  ThreadGenerator,
  ThreadGeneratorFactory,
} from '@canvas-commons/core';
import {
  DependencyContext,
  PlaybackManager,
  PlaybackStatus,
  ReadOnlyTimeEvents,
  ValueDispatcher,
  Vector2,
  endPlayback,
  endScene,
  startPlayback,
  startScene,
  threads,
  useScene,
  useTime,
} from '@canvas-commons/core';
import 'geometry-polyfill';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {EChart} from './EChart';
import {darkColors, lightColors} from './themes';

type View = ReturnType<Scene2D['getView']>;

const BarColor = '#ff0000';

function fakeContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const state: Record<string | symbol, unknown> = {
    canvas,
    measureText: (text: string) => ({width: text.length * 6}),
    createLinearGradient: () => ({addColorStop() {}}),
    createRadialGradient: () => ({addColorStop() {}}),
    createPattern: () => ({}),
    getLineDash: () => [],
    getTransform: () => new DOMMatrix(),
    isPointInPath: () => false,
  };
  return new Proxy(state, {
    get: (target, key) =>
      key in target
        ? target[key]
        : () => {
            /* paint calls are not recorded */
          },
    set: (target, key, value) => {
      target[key] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}

class FakePath2D {
  public constructor() {
    return new Proxy(this, {
      get: () => () => {
        /* paths are not recorded */
      },
    });
  }
}

function mockScene() {
  const playback = new PlaybackManager();
  const status = new PlaybackStatus(playback);
  const description = {
    ...makeScene2D(function* () {
      // do nothing
    }),
    name: 'test',
    size: new Vector2(1920, 1080),
    resolutionScale: 1,
    timeEventsClass: ReadOnlyTimeEvents,
    playback: status,
  } as unknown as FullSceneDescription<ThreadGeneratorFactory<View>>;
  description.onReplaced = new ValueDispatcher(description);
  const scene = new Scene2D(description);
  const original = HTMLCanvasElement.prototype.getContext;
  const contexts = new WeakMap<HTMLCanvasElement, CanvasRenderingContext2D>();

  beforeAll(() => {
    globalThis.Path2D ??= FakePath2D as unknown as typeof Path2D;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
    ) {
      let context = contexts.get(this);
      if (!context) {
        context = fakeContext(this);
        contexts.set(this, context);
      }
      return context;
    } as unknown as typeof HTMLCanvasElement.prototype.getContext;
    startScene(scene);
    startPlayback(status);
  });
  afterAll(() => {
    endPlayback(status);
    endScene(scene);
    HTMLCanvasElement.prototype.getContext = original;
  });
  beforeEach(() => scene.reset());
}

function generatorTest(factory: (view: View) => ThreadGenerator) {
  return () => {
    const scene = useScene();
    if (!(scene instanceof Scene2D)) {
      throw new Error('Expected a 2D scene.');
    }
    const view = scene.getView();
    [...threads(() => factory(view))];
  };
}

function barChart(data: number[]) {
  return {
    animationDurationUpdate: 500,
    animationEasingUpdate: 'linear',
    xAxis: {type: 'category', data: data.map((_, i) => `${i}`)},
    yAxis: {type: 'value', min: 0, max: 100},
    series: [{type: 'bar', data, itemStyle: {color: BarColor}}],
  } as const;
}

function barHeights(chart: EChart): number[] {
  return chart
    .getChartInstance()
    .getZr()
    .storage.getDisplayList(true)
    .filter(element => element.style.fill === BarColor)
    .map(element => {
      const shape: unknown = Reflect.get(element, 'shape');
      const height =
        typeof shape === 'object' && shape !== null
          ? Reflect.get(shape, 'height')
          : undefined;
      return Math.abs(Number(height));
    });
}

function* frames(
  chart: EChart,
  task: Generator<void, void, void>,
): Generator<void, number[], void> {
  const context = fakeContext(document.createElement('canvas'));
  const heights: number[] = [];
  while (!task.next().done) {
    chart.render(context);
    heights.push(barHeights(chart)[0]);
    yield;
  }
  return heights;
}

describe('EChart', () => {
  mockScene();

  it(
    'applies the initial option',
    generatorTest(function* (view) {
      const chart = new EChart({
        size: [400, 300],
        initialOption: barChart([50]),
      });
      view.add(chart);

      const series = chart.getChartInstance().getOption().series;
      expect(series).toMatchObject([{data: [50]}]);
      yield;
    }),
  );

  it(
    'animates on the scene clock and draws the first frame',
    generatorTest(function* (view) {
      const chart = new EChart({
        size: [400, 300],
        initialOption: barChart([20]),
      });
      view.add(chart);
      yield* chart.waitForAnimation();
      const start = barHeights(chart)[0];

      chart.setOption({series: [{data: [80]}]});
      const startTime = useTime();
      const heights = yield* frames(chart, chart.waitForAnimation());
      const elapsed = useTime() - startTime;

      expect(heights[0]).toBe(start);
      expect(heights.length).toBeGreaterThan(2);
      expect(heights).toEqual([...heights].sort((a, b) => a - b));
      expect(heights.at(-1)).toBeLessThan(start * 4);
      expect(barHeights(chart)[0]).toBeCloseTo(start * 4);
      expect(elapsed).toBeGreaterThanOrEqual(0.5);
      expect(elapsed).toBeLessThan(0.6);
    }),
  );

  it(
    'waits at least one frame even without an animation',
    generatorTest(function* (view) {
      const chart = new EChart({
        size: [400, 300],
        initialOption: {...barChart([20]), animation: false},
      });
      view.add(chart);
      yield* chart.waitForAnimation();

      chart.setOption({series: [{data: [80]}]});
      const startTime = useTime();
      yield* chart.waitForAnimation();

      expect(useTime()).toBeGreaterThan(startTime);
    }),
  );

  it(
    'waits for animations of lazy updates',
    generatorTest(function* (view) {
      const chart = new EChart({
        size: [400, 300],
        initialOption: barChart([20]),
      });
      view.add(chart);
      yield* chart.waitForAnimation();

      chart.setOption({series: [{data: [80]}]}, {lazyUpdate: true});
      const startTime = useTime();
      yield* chart.waitForAnimation();

      expect(useTime() - startTime).toBeGreaterThanOrEqual(0.5);
    }),
  );

  it(
    'replaces the option when asked to',
    generatorTest(function* (view) {
      const chart = new EChart({
        size: [400, 300],
        initialOption: barChart([20]),
      });
      view.add(chart);

      chart.setOption(
        {series: [{type: 'line', data: [1, 2]}]},
        {replaceMerge: ['series']},
      );
      expect(chart.getChartInstance().getOption().series).toMatchObject([
        {type: 'line', data: [1, 2]},
      ]);
      yield;
    }),
  );

  it(
    'maps data coordinates to local space and back',
    generatorTest(function* (view) {
      const chart = new EChart({
        size: [400, 300],
        chartScale: 2,
        initialOption: {
          grid: {left: 0, right: 0, top: 0, bottom: 0, outerBoundsMode: 'none'},
          xAxis: {type: 'value', min: 0, max: 10},
          yAxis: {type: 'value', min: 0, max: 10},
          series: [{type: 'line', data: [[0, 0]]}],
        },
      });
      view.add(chart);

      const corner = chart.dataToLocal({seriesIndex: 0}, [0, 0]);
      expect(corner.x).toBeCloseTo(-200);
      expect(corner.y).toBeCloseTo(150);
      const center = chart.dataToLocal({seriesIndex: 0}, [5, 5]);
      expect(center.x).toBeCloseTo(0);
      expect(center.y).toBeCloseTo(0);

      const data = chart.localToData({seriesIndex: 0}, new Vector2(100, -75));
      expect(data[0]).toBeCloseTo(7.5);
      expect(data[1]).toBeCloseTo(7.5);
      yield;
    }),
  );

  it(
    'keeps the option when the chart is recreated',
    generatorTest(function* (view) {
      const chart = new EChart({
        size: [400, 300],
        initialOption: barChart([20]),
      });
      view.add(chart);
      chart.setOption({series: [{data: [60]}]});
      yield* chart.waitForAnimation();
      const before = chart.getChartInstance();

      chart.devicePixelRatio(2);
      const after = chart.getChartInstance();
      expect(after).not.toBe(before);
      expect(after.getOption().series).toMatchObject([{data: [60]}]);
      expect(after.getZr().animation.isFinished()).toBe(true);
      yield;
    }),
  );

  it(
    'switches and resets themes',
    generatorTest(function* (view) {
      const chart = new EChart({
        size: [400, 300],
        theme: darkColors,
        initialOption: barChart([20]),
      });
      view.add(chart);
      const background = () =>
        chart.getChartInstance().getOption().backgroundColor;

      expect(background()).toBe(darkColors.backgroundColor);
      chart.theme(null);
      expect(background()).not.toBe(darkColors.backgroundColor);
      chart.theme(lightColors);
      expect(background()).not.toBe(darkColors.backgroundColor);
      chart.theme('dark');
      expect(background()).toBe(darkColors.backgroundColor);
      yield;
    }),
  );

  describe('fonts', () => {
    const loaded = new Set<string>();
    const fonts = {
      check: vi.fn((font: string) => loaded.has(font)),
      load: vi.fn(async (font: string) => {
        loaded.add(font);
        return [];
      }),
      addEventListener: vi.fn(),
    };

    beforeEach(() => {
      Object.defineProperty(document, 'fonts', {
        value: fonts,
        configurable: true,
      });
    });
    afterEach(async () => {
      await DependencyContext.consumePromises();
      Reflect.deleteProperty(document, 'fonts');
      vi.clearAllMocks();
    });

    function requested() {
      return fonts.load.mock.calls.map(([font]) => font);
    }

    it(
      'requests the fonts of the option and the theme',
      generatorTest(function* (view) {
        const chart = new EChart({
          size: [400, 300],
          theme: {textStyle: {fontFamily: 'Theme Face'}},
          initialOption: {
            ...barChart([20]),
            title: {
              text: 'Title',
              textStyle: {fontFamily: 'Title Face', fontWeight: 700},
            },
            xAxis: {
              type: 'category',
              data: ['a'],
              axisLabel: {fontStyle: 'italic', fontSize: 20},
            },
          },
        });
        view.add(chart);

        chart.render(fakeContext(document.createElement('canvas')));

        expect(requested()).toEqual(
          expect.arrayContaining([
            'normal normal 12px Theme Face',
            'normal 700 12px Title Face',
            'italic normal 20px Theme Face',
          ]),
        );
        expect(DependencyContext.hasPromises()).toBe(true);
        yield;
      }),
    );

    it(
      'lays out the chart once its fonts have loaded',
      generatorTest(function* (view) {
        const chart = new EChart({
          size: [400, 300],
          initialOption: {...barChart([20]), textStyle: {fontFamily: 'Late'}},
        });
        view.add(chart);
        const instance = vi.spyOn(chart, 'getChartInstance');
        const context = fakeContext(document.createElement('canvas'));

        chart.render(context);
        expect(requested()).toEqual(['normal normal 12px Late']);
        expect(instance).not.toHaveBeenCalled();

        loaded.add('normal normal 12px Late');
        chart.render(context);
        expect(instance).toHaveBeenCalled();
        yield;
      }),
    );

    it(
      'requests the fonts of later options',
      generatorTest(function* (view) {
        const chart = new EChart({
          size: [400, 300],
          initialOption: barChart([20]),
        });
        view.add(chart);
        chart.setOption({
          yAxis: {axisLabel: {fontFamily: 'Update Face', fontWeight: 'bold'}},
        });

        chart.render(fakeContext(document.createElement('canvas')));

        expect(requested()).toEqual(['normal bold 12px Update Face']);
        yield;
      }),
    );

    it('requests its fonts when the node is awaited', async () => {
      const charts: EChart[] = [];
      generatorTest(function* (view) {
        const chart = new EChart({
          size: [400, 300],
          initialOption: {
            ...barChart([20]),
            legend: {textStyle: {fontFamily: 'Awaited Face'}},
          },
        });
        view.add(chart);
        charts.push(chart);
        yield;
      })();
      expect(requested()).toEqual([]);

      await Promise.all(charts.map(chart => chart.toPromise()));

      expect(requested()).toEqual(['normal normal 12px Awaited Face']);
    });
  });
});
