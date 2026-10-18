import {Rect, Txt, makeScene2D} from '@canvas-commons/2d';
import {createSignal, useScene, waitFor} from '@canvas-commons/core';
import {Colors, Mono, caption, intro, placeholder} from '../shared/ui';

interface RecalculatedStatus {
  frame: number;
  fps: number;
  onScenesRecalculated?: {
    subscribe(
      handler: (scenes: {lastFrame: number}[]) => void,
      dispatchImmediately?: boolean,
    ): () => void;
  };
}

let Unsubscribe: (() => void) | null = null;

export default makeScene2D(function* (view) {
  yield* intro(
    view,
    'scenes-recalculated',
    'PlaybackStatus.onScenesRecalculated lets scene code react to the final timing of the whole project.',
  );
  caption(
    view,
    'A progress bar for the whole project, sized from onScenesRecalculated',
  );
  const status = useScene().playback as unknown as RecalculatedStatus;
  if (!status.onScenesRecalculated) {
    placeholder(view, 'useScene().playback.onScenesRecalculated');
    yield* waitFor(5);
    return;
  }
  const total = createSignal(0);
  const scenes = createSignal(0);
  Unsubscribe?.();
  Unsubscribe = status.onScenesRecalculated.subscribe(list => {
    total(Math.max(0, ...list.map(scene => scene.lastFrame)));
    scenes(list.length);
  });
  const frame = createSignal(status.frame);
  view.add(
    <>
      <Rect width={760} height={40} radius={20} fill={Colors.panel} y={-20} />
      <Rect
        x={-380}
        y={-20}
        height={40}
        radius={20}
        fill={Colors.green}
        anchor={[-1, 0]}
        width={() => (total() ? (760 * frame()) / total() : 0)}
      />
      <Txt
        y={60}
        fontFamily={Mono}
        fontSize={22}
        fill={Colors.text}
        text={() =>
          total()
            ? `frame ${frame()} of ${total()} (${scenes()} scene${scenes() === 1 ? '' : 's'}, ${(total() / status.fps).toFixed(1)} s)`
            : 'waiting for recalculation…'
        }
      />
    </>,
  );
  for (let i = 0; i < 150; i++) {
    frame(status.frame);
    yield;
  }
});
