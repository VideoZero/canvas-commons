import {Line, Rect, Txt, makeScene2D} from '@canvas-commons/2d';
import {
  Vector2,
  createSignal,
  linear,
  useScene,
  waitFor,
} from '@canvas-commons/core';
import {
  Colors,
  Mono,
  Sans,
  caption,
  fromCore,
  intro,
  placeholder,
} from '../shared/ui';

type FadeGain = (
  fade: {fadeIn?: number; fadeOut?: number},
  elapsed: number,
  length: number,
) => number;

export default makeScene2D(function* (view) {
  yield* intro(
    view,
    'audio',
    'sound(audio).fade(in, out), Sounds.addAt(), fixed 50 ms seek lead-in, audio with unknown duration plays.',
  );
  caption(
    view,
    'Gain of sound(clip).fade(1.5, 2.5) on a 10 s clip (the video has no audio)',
  );
  const fadeGain = fromCore<FadeGain>('soundFadeGain');
  const sounds = useScene().sounds as unknown as Record<string, unknown>;
  view.add(
    <Txt
      y={215}
      fontFamily={Mono}
      fontSize={18}
      fill={Colors.muted}
      text={`soundFadeGain: ${fadeGain ? 'yes' : 'no'} · sounds.addAt: ${typeof sounds.addAt === 'function' ? 'yes' : 'no'}`}
    />,
  );
  if (!fadeGain) {
    placeholder(
      view,
      'sound(audio).fade(fadeIn, fadeOut), sounds.addAt(settings, time)',
    );
    yield* waitFor(5);
    return;
  }
  const length = 10;
  const width = 760;
  const height = 240;
  const toPoint = (t: number) =>
    new Vector2(
      -width / 2 + (t / length) * width,
      height / 2 - fadeGain({fadeIn: 1.5, fadeOut: 2.5}, t, length) * height,
    );
  const points = Array.from({length: 201}, (_, i) =>
    toPoint((i / 200) * length),
  );
  const playhead = createSignal(0);
  view.add(
    <Rect y={0} width={width} height={height} fill={Colors.panel} radius={8}>
      <Line points={points} stroke={Colors.green} lineWidth={5} />
      <Line
        points={() => [
          [toPoint(playhead()).x, -height / 2],
          [toPoint(playhead()).x, height / 2],
        ]}
        stroke={Colors.yellow}
        lineWidth={2}
      />
      <Txt
        y={-height / 2 - 24}
        fontFamily={Sans}
        fontSize={20}
        fill={Colors.text}
        text={() =>
          `t = ${playhead().toFixed(1)} s · gain × ${fadeGain({fadeIn: 1.5, fadeOut: 2.5}, playhead(), length).toFixed(2)}`
        }
      />
    </Rect>,
  );
  yield* playhead(length, 5, linear);
  yield* waitFor(0.5);
});
