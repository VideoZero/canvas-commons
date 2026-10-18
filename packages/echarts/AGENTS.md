# @canvas-commons/echarts

An `EChart` node that renders [Apache ECharts](https://echarts.apache.org)
charts to an offscreen canvas, with chart animations driven by the scene clock.
`echarts` is a peer dependency.

See the [root `AGENTS.md`](../../AGENTS.md) for repo-wide standards.

## Commands

```bash
pnpm echarts:build                                  # tsdown
pnpm --filter @canvas-commons/echarts run lint:pkg
```

## Where things live

```
src/EChart.ts   The node: chart lifecycle, scene clock, coordinate mapping.
src/themes/     Resolved colors of the built-in light and dark themes.
src/vite.ts     Optional Vite plugin that resolves echarts/zrender to sources.
```

## Traps

**zrender's clock is patched.** `followThreadTime` replaces `update` and
`_startLoop` on the chart's zrender `Animation` so clips advance with
`thread.time()` and no `requestAnimationFrame` loop runs. Re-check it when
bumping the `echarts`/`zrender` major version.

**Animations only advance when stepped.** `draw`, `waitForAnimation`,
`dispatchAction` and the coordinate helpers step the animation. Scenes must
`yield* chart().waitForAnimation()` after `setOption` to play a transition.

**`devicePixelRatio` and `chartScale` recreate the chart.** zrender fixes the
pixel ratio at init, so the instance is disposed and the current option is
re-applied without animation.

**Fonts come from the option and theme objects.** `EChart` walks every option it
is given and the theme object for `fontFamily`/`fontWeight`/`fontStyle` and
requests those fonts through 2d's `requestFontLoad`. The first draw skips the
chart while they load, because zrender caches text widths per font string. Fonts
that only a registered theme name declares are not seen.

**Source checkouts need `useDefineForClassFields: false`.** The echarts and
zrender sources declare fields that their prototypes define. `vite.ts` compiles
them with oxc's `setPublicClassFields` and
`removeClassFieldsWithoutInitializer`, both for the dependency optimizer and for
its own `transform` hook during builds.

## Used in the wild

```tsx
const chart = createRef<EChart>();
view.add(
  <EChart
    ref={chart}
    size={[960, 540]}
    theme={darkColors}
    initialOption={{
      xAxis: {data: ['A', 'B', 'C']},
      yAxis: {},
      series: [{type: 'bar', data: [10, 20, 30]}],
    }}
  />,
);
chart().setOption({series: [{data: [30, 10, 20]}]});
yield * chart().waitForAnimation();
```
