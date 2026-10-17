import {Circle, Rect, Txt, makeScene2D} from '@canvas-commons/2d';
import {all, createRef, easeInOutCubic, waitFor} from '@canvas-commons/core';
import {
  Colors,
  NodeClass,
  Sans,
  caption,
  from2d,
  intro,
  placeholder,
} from '../shared/ui';

const InnerScene = makeScene2D(function* (view) {
  view.fill('#202838');
  const rect = createRef<Rect>();
  const circle = createRef<Circle>();
  view.add(
    <>
      <Txt
        text="inner scene"
        y={-300}
        fontFamily={Sans}
        fontSize={60}
        fill={Colors.muted}
      />
      <Rect ref={rect} size={200} radius={20} fill={Colors.red} />
      <Circle ref={circle} size={120} fill={Colors.yellow} x={250} />
    </>,
  );
  yield* all(
    rect().rotation(360, 2, easeInOutCubic),
    circle().position.y(-150, 1, easeInOutCubic).to(150, 1, easeInOutCubic),
  );
  yield* all(
    rect().scale(1.5, 1, easeInOutCubic).to(1, 1, easeInOutCubic),
    circle().position.x(-250, 2, easeInOutCubic),
  );
  yield* waitFor(0.5);
});

export default makeScene2D(function* (view) {
  yield* intro(
    view,
    'scene-playback',
    'ScenePlayback plays another scene inside the current one, as a node with fit, loop, rate and range.',
  );
  caption(
    view,
    'Two <ScenePlayback src={innerScene}> nodes: playbackRate 1 and 2, looping',
  );
  const ScenePlayback = from2d<NodeClass>('ScenePlayback');
  if (!ScenePlayback) {
    placeholder(
      view,
      '<ScenePlayback src={scene} play loop playbackRate objectFit>',
    );
    yield* waitFor(6);
    return;
  }
  for (const [i, rate] of [1, 2].entries()) {
    view.add(
      new ScenePlayback({
        src: InnerScene,
        x: (i - 0.5) * 420,
        y: -10,
        width: 380,
        height: 380,
        renderWidth: 760,
        renderHeight: 760,
        radius: 20,
        clip: true,
        play: true,
        loop: true,
        playbackRate: rate,
        stroke: Colors.panelLight,
        lineWidth: 4,
      }),
    );
    view.add(
      <Txt
        x={(i - 0.5) * 420}
        y={210}
        text={`playbackRate={${rate}}`}
        fontFamily={Sans}
        fontSize={20}
        fill={Colors.muted}
      />,
    );
  }
  yield* waitFor(7);
});
