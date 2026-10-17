import {Node, makeScene2D} from '@canvas-commons/2d';
import {ThreadGenerator, waitFor} from '@canvas-commons/core';
import {
  Colors,
  NodeClass,
  caption,
  intro,
  loadOptional,
  placeholder,
} from '../shared/ui';

type Chart = Node & {
  waitForAnimation: () => ThreadGenerator;
  setOption: (option: Record<string, unknown>) => void;
};

export default makeScene2D(function* (view) {
  yield* intro(
    view,
    'echarts',
    '@canvas-commons/echarts: an EChart node renders Apache ECharts and plays its animations on the scene clock.',
    'package',
  );
  caption(
    view,
    '<EChart initialOption/> then setOption(…), animated on the scene clock',
    -245,
  );
  const echarts = (yield loadOptional(
    () => import('@canvas-commons/echarts'),
  )) as Record<string, unknown>;
  const EChart = echarts.EChart as NodeClass<Chart> | undefined;
  if (!EChart) {
    placeholder(view, "import {EChart} from '@canvas-commons/echarts'");
    yield* waitFor(6);
    return;
  }
  const chart = new EChart({
    size: [860, 430],
    y: 15,
    theme: 'dark',
    initialOption: {
      backgroundColor: 'transparent',
      xAxis: {
        data: ['core', '2d', 'three', 'd3-geo', 'echarts', 'shiki', 'rig'],
      },
      yAxis: {},
      series: [
        {
          type: 'bar',
          data: [12, 31, 7, 1, 2, 2, 2],
          itemStyle: {color: Colors.accent, borderRadius: [6, 6, 0, 0]},
        },
      ],
      animationDuration: 1500,
      animationDurationUpdate: 1200,
    },
  });
  view.add(chart);
  yield* chart.waitForAnimation();
  yield* waitFor(0.5);
  chart.setOption({
    series: [
      {data: [5, 18, 25, 14, 22, 9, 17], itemStyle: {color: Colors.orange}},
    ],
  });
  yield* chart.waitForAnimation();
  yield* waitFor(0.5);
  chart.setOption({
    series: [
      {
        type: 'line',
        data: [8, 12, 20, 30, 26, 18, 24],
        smooth: true,
        itemStyle: {color: Colors.green},
      },
    ],
  });
  yield* chart.waitForAnimation();
  yield* waitFor(1);
});
