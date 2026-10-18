import {Txt, makeScene2D} from '@canvas-commons/2d';
import {Direction, ThreadGenerator, waitFor} from '@canvas-commons/core';
import {
  Colors,
  Mono,
  Sans,
  caption,
  from2d,
  intro,
  placeholder,
} from '../shared/ui';

type TextAnimation = (
  source: Txt,
  options?: Record<string, unknown>,
) => ThreadGenerator;

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
  yield* waitFor(0.3);
});
