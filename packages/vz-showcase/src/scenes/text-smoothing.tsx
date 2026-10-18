import {Line, Node, Txt, makeScene2D} from '@canvas-commons/2d';
import {all, createRef, linear, waitFor} from '@canvas-commons/core';
import {Colors, Mono, Sans, caption, intro} from '../shared/ui';

const Modes = [false, true] as const;

export default makeScene2D(function* (view) {
  yield* intro(
    view,
    'text-smoothing',
    'Txt.smooth paints text with sub-pixel precision: Chromium snaps glyphs to whole pixels vertically, so slowly moving text steps.',
  );
  const supported = 'defaultSmooth' in Txt;
  caption(
    view,
    `Text drifting down 6px and scaling by 4% — left smooth={false}, right smooth={true}${supported ? '' : ' (missing on main)'}`,
  );

  const drift = Modes.map(() => createRef<Node>());
  const grow = Modes.map(() => createRef<Txt>());
  const text = (smooth: boolean) => ({
    fontFamily: Sans,
    fontWeight: 600,
    fontSize: 40,
    fill: smooth ? Colors.green : Colors.text,
    ...(supported ? {smooth} : {}),
  });
  view.add(
    <>
      {Modes.map((smooth, i) => (
        <Node x={(i - 0.5) * 460}>
          <Node ref={drift[i]} y={-90}>
            <Txt {...text(smooth)} text="Drifting slowly" />
            <Line
              points={[
                [-170, 30],
                [170, 30],
              ]}
              stroke={Colors.accent}
              lineWidth={1}
            />
          </Node>
          <Txt ref={grow[i]} y={50} {...text(smooth)} text="Scaling slowly" />
          <Txt
            y={170}
            text={`smooth={${smooth}}`}
            fontFamily={Mono}
            fontSize={20}
            fill={smooth ? Colors.green : Colors.muted}
          />
        </Node>
      ))}
    </>,
  );
  yield* waitFor(0.5);
  yield* all(
    ...drift.map(node => node().y(-84, 6, linear)),
    ...grow.map(node => node().scale(1.04, 6, linear)),
  );
  yield* waitFor(0.5);
});
