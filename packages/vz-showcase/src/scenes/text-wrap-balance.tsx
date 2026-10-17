import {Rect, Txt, makeScene2D} from '@canvas-commons/2d';
import {all, createRef, waitFor} from '@canvas-commons/core';
import {Colors, Mono, Sans, caption, intro} from '../shared/ui';

const Text =
  'Balanced wrapping keeps the lines of a heading about the same width';

export default makeScene2D(function* (view) {
  yield* intro(
    view,
    'text-wrap-balance',
    "textWrap: 'balance' wraps text into lines of about the same width, like CSS text-wrap: balance.",
  );
  caption(
    view,
    'Same text and width — left textWrap={true}, right textWrap="balance"',
  );

  const texts = [createRef<Txt>(), createRef<Txt>()];
  const boxes = [true, 'balance'] as const;
  view.add(
    <>
      {boxes.map((wrap, i) => (
        <Rect x={(i - 0.5) * 440} y={-20}>
          <Rect
            layout
            stroke={Colors.panelLight}
            lineWidth={2}
            lineDash={[6, 6]}
          >
            <Txt
              ref={texts[i]}
              text={Text}
              width={380}
              textWrap={wrap as boolean}
              fontFamily={Sans}
              fontWeight={700}
              fontSize={34}
              lineHeight={'125%'}
              fill={i ? Colors.green : Colors.text}
            />
          </Rect>
          <Txt
            y={150}
            text={`textWrap=${JSON.stringify(wrap)}`}
            fontFamily={Mono}
            fontSize={18}
            fill={Colors.muted}
          />
        </Rect>
      ))}
    </>,
  );
  yield* waitFor(1);
  yield* all(...texts.map(t => t().width(300, 1.5).to(420, 1.5).to(380, 1)));
  yield* waitFor(1);
});
