import {Circle, Line, Txt, makeScene2D} from '@canvas-commons/2d';
import {
  TimingFunction,
  all,
  createSignal,
  linear,
  waitFor,
} from '@canvas-commons/core';
import {
  Colors,
  Mono,
  caption,
  fromCore,
  intro,
  placeholder,
} from '../shared/ui';

const Presets = ['wiggle', 'anticipate', 'slowMo', 'physicsBounce', 'squash'];
const Fills = [
  Colors.accent,
  Colors.orange,
  Colors.green,
  Colors.purple,
  Colors.yellow,
];

export default makeScene2D(function* (view) {
  yield* intro(
    view,
    'easings',
    'Expressive timing functions: wiggle, anticipate, slowMo, physicsBounce, squash and their create*() factories.',
  );
  caption(
    view,
    'Each dot travels its track with one of the new timing functions (2.5 s)',
  );
  const functions = Presets.map(name => fromCore<TimingFunction>(name));
  if (functions.every(f => !f)) {
    placeholder(
      view,
      Presets.join(', ') +
        '\ncreateWiggle, createSlowMo, createPhysicsBounce, createSquash …',
    );
    yield* waitFor(6);
    return;
  }
  const t = createSignal(0);
  for (const [i, name] of Presets.entries()) {
    const fn = functions[i] ?? linear;
    const y = -150 + i * 75;
    view.add(
      <>
        <Txt
          x={-330}
          y={y}
          text={name}
          fontFamily={Mono}
          fontSize={20}
          fill={Colors.text}
        />
        <Line
          points={[
            [-200, y],
            [360, y],
          ]}
          stroke={Colors.panelLight}
          lineWidth={4}
          lineCap="round"
        />
        <Circle
          y={y}
          size={34}
          fill={Fills[i]}
          x={() => -200 + 560 * fn(t())}
        />
      </>,
    );
  }
  yield* waitFor(0.5);
  yield* t(1, 2.5, linear);
  yield* waitFor(0.5);
  yield* all(t(0, 2.5, linear));
  yield* waitFor(0.5);
});
