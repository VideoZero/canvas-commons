import {Rect, Txt, makeScene2D} from '@canvas-commons/2d';
import {Direction, ThreadGenerator, all, waitFor} from '@canvas-commons/core';
import roboto from '../assets/roboto-400.woff2';
import {
  Colors,
  Mono,
  Sans,
  caption,
  from2d,
  intro,
  loadFont,
  placeholder,
} from '../shared/ui';

type TextAnimation = (
  source: Txt,
  options?: Record<string, unknown>,
) => ThreadGenerator;

type TextSplitHandle = {restore: () => void};

const Demos: [string, string, Record<string, unknown>, string][] = [
  [
    'textTypewriter',
    'Typed one grapheme at a time',
    {stagger: 0.04},
    '{stagger: 0.04}',
  ],
  [
    'textFadeIn',
    'Characters rise into place',
    {direction: Direction.Top},
    '{direction: Direction.Top}',
  ],
  [
    'textScaleIn',
    'Words pop in with a twist',
    {by: 'word', rotation: 30, stagger: 0.12},
    "{by: 'word', rotation: 30}",
  ],
  [
    'textRevealIn',
    'Each line is revealed\nfrom behind a clip',
    {by: 'line', direction: Direction.Bottom, stagger: 0.2},
    "{by: 'line', direction: Direction.Bottom}",
  ],
  ['textTrackingIn', 'TRACKING IN', {spread: 0.6}, '{spread: 0.6}'],
];

export default makeScene2D(function* (view) {
  yield* intro(
    view,
    'text-animations',
    'splitText() and text animations: typewriter, fade/scale/reveal/tracking in and out, by grapheme, word or line.',
  );
  caption(view, 'Each line below is a single Txt animated by a text animation');

  const name = (
    <Txt y={170} fontFamily={Mono} fontSize={22} fill={Colors.accent} />
  ) as Txt;
  view.add(name);

  if (!from2d('splitText')) {
    placeholder(
      view,
      'splitText, textTypewriter, textFadeIn, textScaleIn, textRevealIn, textTrackingIn …',
      {y: 20},
    );
    yield* waitFor(6);
    return;
  }

  const fadeOut = from2d<TextAnimation>('textFadeOut');
  for (const [fn, text, options, shown] of Demos) {
    const animation = from2d<TextAnimation>(fn);
    if (!animation) continue;
    const txt = (
      <Txt
        y={-20}
        text={text}
        opacity={0}
        textAlign="center"
        fontFamily={Sans}
        fontWeight={800}
        fontSize={52}
        fill={Colors.text}
      />
    ) as Txt;
    view.add(txt);
    name.text(`yield* ${fn}(txt, ${shown})`);
    yield* animation(txt, options);
    yield* waitFor(0.5);
    if (fadeOut) yield* fadeOut(txt, {duration: 0.3, stagger: 0.01});
    txt.remove();
  }

  // Ligatures (fi, fl, ffl) and kerning are shaped differently when the
  // pieces are drawn on their own, so swapping them back to the source at
  // the end of an entrance made the glyphs jump. Entrances now leave the
  // text split; restoring it is an explicit step.
  const getTextSplit =
    from2d<(source: Txt) => TextSplitHandle | null>('getTextSplit');
  const fadeIn = from2d<TextAnimation>('textFadeIn');
  if (getTextSplit && fadeIn) {
    yield loadFont('Roboto Showcase', roboto, '400');
    const closeUp = (
      <Txt
        y={-10}
        text="office flow"
        opacity={0}
        fontFamily="Roboto Showcase"
        fontSize={150}
        fill={Colors.text}
      />
    ) as Txt;
    const state = (
      <Txt y={110} fontFamily={Sans} fontSize={26} fill={Colors.green} />
    ) as Txt;
    const marker = (
      <Rect
        y={-10}
        width={760}
        height={190}
        radius={16}
        stroke={Colors.panelLight}
        lineWidth={2}
        opacity={0}
      />
    ) as Rect;
    view.add([marker, closeUp, state]);
    name.text('yield* textFadeIn(txt) — ligature close-up (Roboto 150px)');
    yield* all(marker.opacity(1, 0.3), fadeIn(closeUp, {duration: 0.6}));
    state.text('entrance ended: still split, the last frame stays as it is');
    yield* waitFor(1.6);
    getTextSplit(closeUp)?.restore();
    name.text('getTextSplit(txt)?.restore()');
    state.fill(Colors.orange);
    state.text('restored by hand: the source draws its fi / fl ligatures');
    yield* waitFor(1.6);
    yield* all(
      marker.opacity(0, 0.3),
      state.opacity(0, 0.3),
      // A plain fade: an exit would split the restored text again.
      closeUp.opacity(0, 0.3),
    );
  }
  yield* waitFor(0.3);
});
