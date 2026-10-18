import {
  Camera,
  Circle,
  Line,
  Rect,
  Spline,
  Txt,
  makeScene2D,
} from '@canvas-commons/2d';
import {
  Vector2,
  all,
  createRef,
  createSignal,
  linear,
  waitFor,
} from '@canvas-commons/core';
import {Colors, Sans, caption, intro} from '../shared/ui';

export default makeScene2D(function* (view) {
  yield* intro(
    view,
    'camera',
    'Camera.followCurve() follows curves in the camera’s scene space instead of drifting as the camera moves.',
    'fix',
  );

  const camera = createRef<Camera>();
  const path = createRef<Spline>();
  const progress = createSignal(0);
  const grid: Vector2[] = [];
  for (let x = -600; x <= 600; x += 150) {
    for (let y = -450; y <= 450; y += 150) grid.push(new Vector2(x, y));
  }

  view.add(
    <Camera ref={camera} zoom={1.6}>
      {grid.map(p => (
        <Rect position={p} size={8} fill={Colors.panelLight} />
      ))}
      <Spline
        ref={path}
        points={[
          [-420, 160],
          [-200, -180],
          [60, 120],
          [260, -160],
          [460, 120],
        ]}
        smoothness={0.6}
        stroke={Colors.accent}
        lineWidth={8}
      />
      <Circle
        size={34}
        fill={Colors.orange}
        position={() => path().getPointAtPercentage(progress()).position}
      />
    </Camera>,
  );
  // Crosshair at the centre of the screen, where followCurve should keep
  // the orange marker.
  view.add(
    <>
      <Line
        points={[
          [-40, 0],
          [40, 0],
        ]}
        stroke={Colors.text}
        lineWidth={3}
      />
      <Line
        points={[
          [0, -40],
          [0, 40],
        ]}
        stroke={Colors.text}
        lineWidth={3}
      />
      <Circle size={60} stroke={Colors.text} lineWidth={3} />
    </>,
  );
  const text = caption(
    view,
    'camera.followCurve(path, 4), zoom 1.6 — orange marker should stay under the crosshair',
    -235,
  );
  text.fill(Colors.text);
  const dist = (
    <Txt
      y={225}
      fontFamily={Sans}
      fontSize={22}
      fill={Colors.yellow}
      text={() => {
        const target = path()
          .getPointAtPercentage(progress())
          .position.transformAsPoint(path().localToWorld());
        const centre = Vector2.zero.transformAsPoint(view.localToWorld());
        const distance = target.sub(centre).magnitude;
        return distance > 1e5
          ? 'marker distance from crosshair: ∞ — the camera drifted away'
          : `marker distance from crosshair: ${distance.toFixed(0)} px`;
      }}
    />
  );
  view.add(dist);

  yield* waitFor(0.5);
  yield* all(camera().followCurve(path(), 4, linear), progress(1, 4, linear));
  yield* waitFor(1);
});
