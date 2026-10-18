import {Icon, Txt, makeScene2D} from '@canvas-commons/2d';
import {waitFor} from '@canvas-commons/core';
import {
  Colors,
  Mono,
  Sans,
  caption,
  from2d,
  intro,
  logPanel,
} from '../shared/ui';

export default makeScene2D(function* (view) {
  yield* intro(
    view,
    'resource-cache',
    'ResourceCache shares in-flight requests; an Icon that fails to load is fetched and reported once, not every frame.',
    'fix',
  );
  caption(
    view,
    '<Icon icon="mdi:this-icon-does-not-exist"> that cannot be fetched (offline)',
  );
  const {count} = logPanel(view, {y: 175});
  const icon = (
    <Icon
      icon="mdi:this-icon-does-not-exist"
      size={140}
      y={-60}
      color={Colors.accent}
    />
  ) as Icon;
  view.add(icon);
  view.add(
    <>
      <Txt
        y={60}
        fontFamily={Mono}
        fontSize={20}
        fill={from2d('ResourceCache') ? Colors.green : Colors.red}
        text={
          from2d('ResourceCache')
            ? 'ResourceCache: available'
            : 'ResourceCache: not available on canvas-commons main'
        }
      />
      <Txt
        y={95}
        fontFamily={Sans}
        fontSize={20}
        fill={Colors.text}
        text={() => `errors logged so far: ${count()} (expected: 1)`}
      />
    </>,
  );
  yield* icon.rotation(360, 5);
  yield* waitFor(0.5);
});
