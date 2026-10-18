import {Line, Rect, Txt, makeScene2D} from '@canvas-commons/2d';
import {createRef, waitFor} from '@canvas-commons/core';
import fraunces from '../assets/fraunces-600.woff2';
import {Colors, Mono, Sans, caption, intro, loadFont} from '../shared/ui';

const Modes = ['line', 'cap', 'ink'] as const;

export default makeScene2D(function* (view) {
  yield* intro(
    view,
    'text-center',
    'Txt.textCenter centers the cap height or the ink of a text in its line box instead of the font box.',
  );
  yield loadFont('Fraunces Showcase', fraunces);
  caption(
    view,
    'Same text in three pills with alignItems="center" — the dashed line is the pill centre',
  );

  const pills = Modes.map(() => createRef<Txt>());
  view.add(
    <>
      {Modes.map((mode, i) => (
        <Rect x={(i - 1) * 300} y={-10}>
          <Rect
            layout
            alignItems="center"
            height={130}
            padding={[0, 34]}
            radius={65}
            fill={Colors.panel}
            stroke={Colors.panelLight}
            lineWidth={2}
          >
            <Txt
              ref={pills[i]}
              text="Hxg"
              fontFamily="Fraunces Showcase"
              fontWeight={600}
              fontSize={88}
              fill={Colors.text}
              {...{textCenter: mode}}
            />
          </Rect>
          <Line
            points={[
              [-130, 0],
              [130, 0],
            ]}
            stroke={Colors.accent}
            lineWidth={2}
            lineDash={[6, 6]}
          />
          <Txt
            y={100}
            text={`textCenter="${mode}"`}
            fontFamily={Mono}
            fontSize={18}
            fill={Colors.muted}
          />
        </Rect>
      ))}
    </>,
  );
  const support = 'textCenter' in pills[0]();
  view.add(
    <Txt
      y={170}
      fontFamily={Sans}
      fontSize={22}
      fill={support ? Colors.green : Colors.red}
      text={
        support
          ? '"cap" puts the capitals on the centre line; "ink" centres the drawn glyphs'
          : 'textCenter is not available on canvas-commons main — all three sit the same'
      }
    />,
  );
  yield* waitFor(0.5);
  for (const pill of pills) {
    yield* pill().fill(Colors.yellow, 0.4).to(Colors.text, 0.4);
  }
  yield* waitFor(3);
});
