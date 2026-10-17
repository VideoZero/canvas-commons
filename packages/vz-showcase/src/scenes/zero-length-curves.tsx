import {Circle, Line, Txt, makeScene2D} from '@canvas-commons/2d';
import {all, createRef, waitFor} from '@canvas-commons/core';
import {Colors, Sans, caption, intro} from '../shared/ui';

export default makeScene2D(function* (view) {
  yield* intro(
    view,
    'zero-length-curves',
    'A curve whose visible part is empty (end = 0) no longer leaves a dot from its round/square line caps.',
    'fix',
  );
  caption(
    view,
    'Lines and an arc with lineCap="round", lineWidth 28 and end = 0',
  );

  const lines = [0, 1, 2].map(() => createRef<Line>());
  const arc = createRef<Circle>();
  const status = createRef<Txt>();
  view.add(
    <>
      {lines.map((ref, i) => (
        <Line
          ref={ref}
          points={[
            [-380, -120 + i * 110],
            [40, -120 + i * 110 - 40],
          ]}
          stroke={[Colors.accent, Colors.orange, Colors.green][i]}
          lineWidth={28}
          lineCap={i === 2 ? 'square' : 'round'}
          end={0}
        />
      ))}
      <Circle
        ref={arc}
        x={270}
        y={-20}
        size={220}
        stroke={Colors.purple}
        lineWidth={28}
        lineCap="round"
        end={0}
      />
      <Txt
        ref={status}
        y={200}
        fontFamily={Sans}
        fontSize={24}
        fill={Colors.text}
        text="end = 0: nothing should be visible"
      />
    </>,
  );
  yield* waitFor(1.5);
  status().text('end 0 → 1');
  yield* all(...lines.map(l => l().end(1, 1.2)), arc().end(1, 1.2));
  yield* waitFor(0.4);
  status().text('end 1 → 0 (draw off)');
  yield* all(...lines.map(l => l().end(0, 1.2)), arc().end(0, 1.2));
  status().text('end = 0 again: no leftover dots');
  yield* waitFor(1.5);
});
