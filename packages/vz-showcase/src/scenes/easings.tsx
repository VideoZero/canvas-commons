import {
  Circle,
  Line,
  Node,
  Rect,
  Txt,
  View2D,
  makeScene2D,
} from '@canvas-commons/2d';
import {
  ThreadGenerator,
  TimingFunction,
  all,
  chain,
  createSignal,
  delay,
  easeInOutCubic,
  linear,
  map,
  sequence,
  tween,
  waitFor,
} from '@canvas-commons/core';
import {Colors, Mono, Sans, fromCore, intro, placeholder} from '../shared/ui';

type WiggleType = 'easeOut' | 'easeInOut' | 'anticipate' | 'uniform' | 'random';
interface Trajectory {
  position(seconds: number): {x: number; y: number};
}
interface Easings {
  wiggle: TimingFunction;
  anticipate: TimingFunction;
  slowMo: TimingFunction;
  physicsBounce: TimingFunction;
  squash: TimingFunction;
  createWiggle(options?: {
    wiggles?: number;
    type?: WiggleType;
    seed?: number;
  }): TimingFunction;
  createSlowMo(options?: {
    linearRatio?: number;
    power?: number;
    yoyo?: boolean;
  }): TimingFunction;
  createPhysicsBounce(options?: {strength?: number}): TimingFunction;
  createSquash(options?: {strength?: number; band?: number}): TimingFunction;
  createCubicBezier(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
  ): TimingFunction;
  createExpoScale(fromScale: number, toScale: number): TimingFunction;
  createBallistic2D(options: {
    velocity: number;
    angle: number;
    gravity?: number;
    friction?: number;
  }): Trajectory;
}

const Names: (keyof Easings)[] = [
  'wiggle',
  'anticipate',
  'slowMo',
  'physicsBounce',
  'squash',
  'createWiggle',
  'createSlowMo',
  'createPhysicsBounce',
  'createSquash',
  'createCubicBezier',
  'createExpoScale',
  'createBallistic2D',
];

function load(): Easings | null {
  const found: Record<string, unknown> = {};
  for (const name of Names) {
    const value = fromCore<unknown>(name);
    if (!value) return null;
    found[name] = value;
  }
  return found as unknown as Easings;
}

const Floor = 150;

/** One scenario: title and use on top; `build` adds nodes, returns the animation. */
function* segment(
  view: View2D,
  title: string,
  use: string,
  build: (stage: Node) => ThreadGenerator,
): ThreadGenerator {
  const stage = (<Node opacity={0} />) as Node;
  stage.add(
    <Txt
      y={-222}
      text={title}
      fontFamily={Mono}
      fontSize={26}
      fontWeight={700}
      fill={Colors.text}
    />,
  );
  stage.add(
    <Txt
      y={-187}
      text={use}
      fontFamily={Sans}
      fontSize={19}
      fill={Colors.muted}
    />,
  );
  view.add(stage);
  const animation = build(stage);
  yield* stage.opacity(1, 0.25);
  yield* animation;
  yield* waitFor(0.4);
  yield* stage.opacity(0, 0.25);
  stage.remove();
}

/** The easing call (mono) and what it is for (sans) under an object. */
function tag(x: number, y: number, code: string, note: string, color: string) {
  return (
    <Node x={x} y={y}>
      <Txt
        text={code}
        fontFamily={Mono}
        fontSize={16}
        fontWeight={700}
        fill={color}
      />
      <Txt
        y={22}
        text={note}
        fontFamily={Sans}
        fontSize={16}
        fill={Colors.muted}
      />
    </Node>
  );
}

function floor(y = Floor, from = -440, to = 440) {
  return (
    <Line
      points={[
        [from, y],
        [to, y],
      ]}
      stroke={Colors.panelLight}
      lineWidth={4}
      lineCap="round"
    />
  );
}

/** A small plot of an easing with a dot that follows the progress. */
function plot(fn: TimingFunction, progress: () => number, color: string) {
  const size = 80;
  const point = (t: number): [number, number] => [
    -size / 2 + t * size,
    size / 2 - fn(t) * size,
  ];
  return (
    <Node>
      <Rect
        width={size}
        height={size}
        stroke={Colors.panelLight}
        lineWidth={2}
      />
      <Line
        points={Array.from({length: 61}, (_, i) => point(i / 60))}
        stroke={color}
        lineWidth={3}
      />
      <Circle size={10} fill={Colors.text} position={() => point(progress())} />
    </Node>
  );
}

/** wiggle: a decaying shake that calls attention and comes back to rest. */
function attention(stage: Node, e: Easings): ThreadGenerator {
  const bell = createSignal(0);
  const badge = createSignal(0);
  const field = createSignal(0);
  const fieldError = createSignal(0);
  const shake = e.createWiggle({wiggles: 6});
  stage.add(
    <>
      <Node x={-210} y={-130} rotation={() => 22 * e.wiggle(bell())}>
        <Circle y={4} size={16} fill={Colors.yellow} />
        <Rect
          y={50}
          width={84}
          height={84}
          radius={[42, 42, 8, 8]}
          fill={Colors.yellow}
        />
        <Rect y={94} width={112} height={14} radius={7} fill={Colors.yellow} />
        <Circle y={110} size={22} fill={Colors.orange} />
        <Circle x={44} y={24} size={38} fill={Colors.red} scale={badge}>
          <Txt
            text="3"
            fontFamily={Sans}
            fontWeight={700}
            fontSize={22}
            fill={Colors.text}
          />
        </Circle>
      </Node>
      {tag(
        -210,
        70,
        'wiggle',
        'new notification: rings, then settles',
        Colors.yellow,
      )}
      <Node x={210} y={-50}>
        <Txt
          x={-130}
          y={-50}
          anchor={[-1, 0]}
          text="password"
          fontFamily={Sans}
          fontSize={17}
          fill={Colors.muted}
        />
        <Rect
          x={() => 16 * shake(field())}
          width={260}
          height={52}
          radius={10}
          fill={Colors.panel}
          stroke={() => (fieldError() > 0.5 ? Colors.red : Colors.panelLight)}
          lineWidth={3}
        >
          <Txt
            text="••••••••"
            fontFamily={Sans}
            fontSize={24}
            fill={Colors.text}
          />
        </Rect>
        <Txt
          y={50}
          text="wrong password"
          fontFamily={Sans}
          fontSize={16}
          fill={Colors.red}
          opacity={fieldError}
        />
      </Node>
      {tag(
        210,
        70,
        'createWiggle({wiggles: 6})',
        'rejected input: a short head-shake',
        Colors.red,
      )}
    </>,
  );
  return all(
    sequence(
      0.1,
      badge(1, 0.3, e.createCubicBezier(0.34, 1.56, 0.64, 1)),
      bell(1, 1.6, linear),
    ),
    delay(1.1, all(fieldError(1, 0.1), field(1, 0.7, linear))),
  );
}

/** The other wiggle envelopes. */
function wiggleTypes(stage: Node, e: Easings): ThreadGenerator {
  const buzz = e.createWiggle({wiggles: 28, type: 'uniform'});
  const turbulence = e.createWiggle({wiggles: 7, type: 'easeInOut'});
  const quake = e.createWiggle({wiggles: 16, type: 'random', seed: 3});
  const t = createSignal(0);
  stage.add(
    <>
      <Rect
        x={() => -300 + 5 * buzz(t())}
        y={-50}
        rotation={() => 4 * buzz(t())}
        width={70}
        height={128}
        radius={14}
        fill={Colors.panelLight}
        stroke={Colors.muted}
        lineWidth={3}
      >
        <Rect width={54} height={96} radius={6} fill={Colors.accent} />
      </Rect>
      {tag(-300, 70, "type: 'uniform'", 'phone buzzing', Colors.accent)}
      <Line
        y={() => -50 + 24 * turbulence(t())}
        rotation={() => 7 * turbulence(t())}
        points={[
          [-60, -26],
          [62, 0],
          [-60, 26],
          [-38, 0],
        ]}
        closed
        fill={Colors.green}
      />
      {tag(
        0,
        70,
        "type: 'easeInOut'",
        'turbulence: swells, then settles',
        Colors.green,
      )}
      <Node x={300} y={-50} rotation={() => 2 * quake(t())}>
        <Node x={() => 12 * quake(t())}>
          <Rect y={15} width={100} height={70} fill={Colors.orange} />
          <Line
            points={[
              [-62, -20],
              [0, -66],
              [62, -20],
            ]}
            closed
            fill={Colors.red}
          />
          <Rect
            x={-22}
            y={20}
            width={22}
            height={22}
            fill={Colors.background}
          />
          <Rect x={24} y={30} width={22} height={40} fill={Colors.background} />
        </Node>
        {floor(50, -100, 100)}
      </Node>
      {tag(
        300,
        70,
        "type: 'random', seed: 3",
        'earthquake / handheld shake',
        Colors.orange,
      )}
    </>,
  );
  return t(1, 2.2, linear);
}

/** anticipate: a wind-up before the action. */
function windUp(stage: Node, e: Easings): ThreadGenerator {
  const lean = createSignal(0);
  const hop = createSignal(0);
  const rumble = createSignal(0);
  const lift = createSignal(0);
  const flame = createSignal(0.2);
  const rumbleFn = e.createWiggle({wiggles: 16, type: 'anticipate'});
  const launch = e.createCubicBezier(0.6, 0, 0.9, 0.4);
  stage.add(
    <>
      {floor(Floor, -440, 40)}
      <Rect
        x={-60}
        y={Floor - 30}
        width={120}
        height={60}
        fill={Colors.panelLight}
      />
      <Node
        x={() => -300 + 240 * hop()}
        y={() => Floor - 60 * hop() - 260 * hop() * (1 - hop())}
        rotation={() => -18 * e.anticipate(lean())}
      >
        <Rect
          y={-40}
          width={64}
          height={80}
          radius={[32, 32, 12, 12]}
          fill={Colors.purple}
        />
        <Circle x={-11} y={-52} size={12} fill={Colors.background} />
        <Circle x={13} y={-52} size={12} fill={Colors.background} />
      </Node>
      {tag(-250, 190, 'anticipate', 'lean back, sway, then hop', Colors.purple)}
      <Rect
        x={270}
        y={Floor + 6}
        width={160}
        height={12}
        fill={Colors.panelLight}
      />
      <Node
        x={() => 270 + 6 * rumbleFn(rumble())}
        y={() => Floor - 560 * launch(lift())}
      >
        <Line
          y={-6}
          points={[
            [-16, 0],
            [0, 70],
            [16, 0],
          ]}
          closed
          fill={Colors.orange}
          scale={() => [1, flame()]}
        />
        <Line
          points={[
            [-22, -10],
            [-42, 0],
            [-22, -46],
          ]}
          closed
          fill={Colors.red}
        />
        <Line
          points={[
            [22, -10],
            [42, 0],
            [22, -46],
          ]}
          closed
          fill={Colors.red}
        />
        <Rect
          y={-62}
          width={46}
          height={124}
          radius={[23, 23, 6, 6]}
          fill={Colors.text}
        />
        <Circle y={-80} size={18} fill={Colors.accent} />
      </Node>
      {tag(
        250,
        190,
        "createWiggle({type: 'anticipate'})",
        'growing rumble, then liftoff',
        Colors.orange,
      )}
    </>,
  );
  return all(
    chain(lean(1, 1.3, linear), hop(1, 0.6, linear)),
    rumble(1, 1.8, linear),
    flame(0.7, 1.8, easeInOutCubic),
    delay(1.6, all(lift(1, 0.9, linear), flame(1.3, 0.3))),
  );
}

/** createCubicBezier: overshoot and back easing for UI motion. */
function overshoot(stage: Node, e: Easings): ThreadGenerator {
  const pop = e.createCubicBezier(0.34, 1.56, 0.64, 1);
  const dash = e.createCubicBezier(0.68, -0.55, 0.27, 1.55);
  const a = createSignal(0);
  const b = createSignal(0);
  stage.add(
    <>
      <Rect
        x={-220}
        y={-70}
        width={200}
        height={90}
        radius={14}
        fill={Colors.green}
        scale={() => pop(a())}
      >
        <Txt
          text="Saved ✓"
          fontFamily={Sans}
          fontWeight={700}
          fontSize={28}
          fill={Colors.background}
        />
      </Rect>
      {tag(
        -220,
        25,
        'createCubicBezier(0.34, 1.56, 0.64, 1)',
        'pop-in: overshoots, then settles',
        Colors.green,
      )}
      <Node x={-220} y={150}>
        {plot(pop, a, Colors.green)}
      </Node>
      {floor(-30, 60, 440)}
      <Node x={() => 110 + 230 * dash(b())} y={-30}>
        <Rect y={-24} width={84} height={30} radius={8} fill={Colors.accent} />
        <Rect
          x={-6}
          y={-46}
          width={44}
          height={20}
          radius={6}
          fill={Colors.accent}
        />
        <Circle x={-24} y={-8} size={20} fill={Colors.text} />
        <Circle x={24} y={-8} size={20} fill={Colors.text} />
      </Node>
      {tag(
        250,
        25,
        'createCubicBezier(0.68, -0.55, 0.27, 1.55)',
        'pull back, dash, overshoot the stop',
        Colors.accent,
      )}
      <Node x={250} y={150}>
        {plot(dash, b, Colors.accent)}
      </Node>
    </>,
  );
  return all(a(1, 0.9, linear), delay(0.6, b(1, 1.6, linear)));
}

/** slowMo: a dramatic pass, fast in, readable slow middle, fast out. */
function dramaticPass(stage: Node, e: Easings): ThreadGenerator {
  const fade = e.createSlowMo({yoyo: true});
  const t = createSignal(0);
  const x = (v: number) => map(-760, 760, e.slowMo(v));
  const speed = (v: number) => (x(Math.min(1, v + 0.01)) - x(v)) * 2.2;
  stage.add(
    <>
      {[-34, -10, 14, 38].map(dy => (
        <Line
          points={() => [
            [x(t()) - 230 - speed(t()) * (1 + Math.abs(dy) / 40), dy - 50],
            [x(t()) - 230, dy - 50],
          ]}
          stroke={Colors.yellow}
          lineWidth={3}
          lineCap="round"
          opacity={() => 0.6 * fade(t())}
        />
      ))}
      <Txt
        x={() => x(t())}
        y={-50}
        text="SLOW MOTION"
        fontFamily={Sans}
        fontWeight={800}
        fontSize={64}
        fill={Colors.yellow}
        opacity={() => fade(t())}
      />
      {tag(
        0,
        40,
        'x: slowMo   opacity: createSlowMo({yoyo: true})',
        'title drive-by: whips in, drifts through the middle, whips out',
        Colors.yellow,
      )}
      {floor(140, -360, 400)}
      <Circle
        x={() => map(-360, 400, e.slowMo(t()))}
        y={140}
        size={22}
        fill={Colors.yellow}
      />
      <Txt
        x={-380}
        y={140}
        anchor={[1, 0]}
        text="slowMo"
        fontFamily={Mono}
        fontSize={15}
        fill={Colors.yellow}
      />
      {floor(190, -360, 400)}
      <Circle
        x={() => map(-360, 400, t())}
        y={190}
        size={22}
        fill={Colors.muted}
      />
      <Txt
        x={-380}
        y={190}
        anchor={[1, 0]}
        text="linear"
        fontFamily={Mono}
        fontSize={15}
        fill={Colors.muted}
      />
    </>,
  );
  return t(1, 3, linear);
}

/** physicsBounce + squash: dropping balls of different bounciness. */
function drops(stage: Node, e: Easings): ThreadGenerator {
  const balls = [
    {
      x: -290,
      color: Colors.purple,
      bounce: e.createPhysicsBounce({strength: 0.2}),
      squash: e.createSquash({strength: 0.2}),
      code: '{strength: 0.2}',
      note: 'heavy ball: lands with a thud',
    },
    {
      x: 0,
      color: Colors.orange,
      bounce: e.physicsBounce,
      squash: e.squash,
      code: 'physicsBounce + squash',
      note: 'rubber ball (strength 0.5)',
    },
    {
      x: 290,
      color: Colors.green,
      bounce: e.createPhysicsBounce({strength: 0.75}),
      squash: e.createSquash({strength: 0.75}),
      code: '{strength: 0.75}',
      note: 'super ball: keeps bouncing',
    },
  ];
  const t = createSignal(0);
  const top = -90;
  stage.add(floor(Floor));
  for (const ball of balls) {
    const y = () => map(top, Floor, ball.bounce(t()));
    const s = () => ball.squash(t());
    stage.add(
      <>
        <Circle
          x={ball.x}
          y={Floor + 4}
          width={() => map(24, 100, (y() - top) / (Floor - top))}
          height={10}
          fill={'#00000080'}
        />
        <Circle
          x={ball.x}
          y={y}
          anchor={[0, 1]}
          size={68}
          fill={ball.color}
          scale={() => [map(1, 1.45, s()), map(1, 0.55, s())]}
        />
        {tag(ball.x, Floor + 34, ball.code, ball.note, ball.color)}
      </>,
    );
  }
  return t(1, 2.8, linear);
}

/** createBallistic2D: projectiles, drag and debris. */
function projectiles(stage: Node, e: Easings): ThreadGenerator {
  const origin = {x: -380, y: Floor - 24};
  const angle = -50;
  const shots = [
    {friction: 0, color: Colors.accent, label: 'friction: 0'},
    {friction: 0.5, color: Colors.orange, label: 'friction: 0.5'},
  ].map(shot => {
    const path = e.createBallistic2D({
      velocity: 760,
      angle,
      friction: shot.friction,
    });
    let landing = 0.05;
    while (landing < 5 && path.position(landing).y < 2) landing += 0.002;
    return {...shot, path, landing};
  });
  stage.add(floor(Floor));
  stage.add(
    <Node x={origin.x} y={origin.y}>
      <Rect
        rotation={angle}
        anchor={[-1, 0]}
        width={70}
        height={26}
        radius={6}
        fill={Colors.muted}
      />
      <Circle y={10} size={44} fill={Colors.panelLight} />
    </Node>,
  );
  const hit = shots[0].path.position(shots[0].landing);
  const crate = (
    <Rect
      x={origin.x + hit.x}
      y={Floor - 22}
      width={44}
      height={44}
      radius={4}
      fill={Colors.yellow}
    />
  ) as Rect;
  stage.add(crate);
  const runs: ThreadGenerator[] = [];
  shots.forEach((shot, i) => {
    const trail = createSignal<[number, number][]>([]);
    const ball = (
      <Circle
        size={20}
        fill={shot.color}
        opacity={0}
        x={origin.x}
        y={origin.y}
      />
    ) as Circle;
    const end = shot.path.position(shot.landing);
    stage.add(
      <>
        <Line
          points={trail}
          stroke={shot.color}
          lineWidth={3}
          lineDash={[8, 8]}
        />
        <Txt
          x={origin.x + end.x}
          y={Floor + 26}
          text={shot.label}
          fontFamily={Mono}
          fontSize={15}
          fill={shot.color}
        />
      </>,
    );
    stage.add(ball);
    runs.push(
      delay(
        i * 1.1,
        all(
          ball.opacity(1, 0.05),
          tween(shot.landing, v => {
            const p = shot.path.position(v * shot.landing);
            const point: [number, number] = [origin.x + p.x, origin.y + p.y];
            ball.position(point);
            trail([...trail(), point]);
          }),
        ),
      ),
    );
  });
  const palette = [Colors.yellow, Colors.red, Colors.green, Colors.accent];
  const debris = Array.from({length: 14}, (_, i) => {
    const path = e.createBallistic2D({
      velocity: 380 + ((i * 53) % 220),
      angle: -160 + (140 * i) / 13,
      friction: 0.3,
    });
    const piece = (
      <Rect
        x={crate.x()}
        y={crate.y()}
        width={12}
        height={8}
        fill={palette[i % 4]}
        opacity={0}
      />
    ) as Rect;
    stage.add(piece);
    return {path, piece};
  });
  const burst = tween(1.2, v => {
    const seconds = v * 1.2;
    for (const {path, piece} of debris) {
      const p = path.position(seconds);
      piece.position([crate.x() + p.x, Math.min(crate.y() + p.y, Floor - 4)]);
      piece.rotation(seconds * 720);
      piece.opacity(v < 0.7 ? 1 : map(1, 0, (v - 0.7) / 0.3));
    }
  });
  stage.add(
    <>
      {tag(
        -250,
        -120,
        'createBallistic2D({velocity: 760, angle: -50})',
        'cannonball, with and without drag',
        Colors.accent,
      )}
      {tag(
        250,
        -120,
        '14 × createBallistic2D(…)',
        'debris fanned out on impact',
        Colors.yellow,
      )}
    </>,
  );
  return all(
    ...runs,
    delay(shots[0].landing, all(crate.opacity(0, 0.05), burst)),
  );
}

/** createExpoScale: a camera zoom at a constant perceived speed. */
function zoom(stage: Node, e: Easings): ThreadGenerator {
  const radii = Array.from({length: 18}, (_, i) =>
    Math.pow(Math.SQRT2, 17 - i),
  );
  const panels = [
    {
      x: -215,
      fn: linear,
      color: Colors.muted,
      code: 'scale(24, 2.6, linear)',
      note: 'rushes in, then seems to crawl',
    },
    {
      x: 215,
      fn: e.createExpoScale(1, 24),
      color: Colors.accent,
      code: 'scale(24, 2.6, createExpoScale(1, 24))',
      note: 'rings pass at a constant rate',
    },
  ];
  const t = createSignal(0);
  for (const panel of panels) {
    const scale = () => map(1, 24, panel.fn(t()));
    stage.add(
      <>
        <Rect
          x={panel.x}
          y={-20}
          width={390}
          height={250}
          radius={10}
          clip
          fill={Colors.panel}
          stroke={panel.color}
          lineWidth={3}
        >
          <Node scale={scale}>
            {radii.map((r, i) => (
              <Circle
                size={r * 2}
                fill={i % 2 ? Colors.panelLight : '#2f4a73'}
              />
            ))}
          </Node>
          <Txt
            x={-180}
            y={-105}
            anchor={[-1, 0]}
            text={() => `×${scale().toFixed(1)}`}
            fontFamily={Mono}
            fontSize={18}
            fill={Colors.text}
          />
        </Rect>
        {tag(panel.x, 135, panel.code, panel.note, panel.color)}
      </>,
    );
  }
  return t(1, 2.6, linear);
}

export default makeScene2D(function* (view) {
  yield* intro(
    view,
    'easings',
    'Expressive easings in the scenarios they are made for: wiggle, anticipate, cubic-bezier, slowMo, physicsBounce + squash, ballistic, expoScale.',
  );
  const e = load();
  if (!e) {
    placeholder(
      view,
      'wiggle, anticipate, slowMo, physicsBounce, squash\ncreateWiggle, createCubicBezier, createSlowMo, createPhysicsBounce, createSquash, createBallistic2D, createExpoScale',
    );
    yield* waitFor(6);
    return;
  }
  yield* segment(
    view,
    'wiggle',
    'Call attention: shake around the rest value, settle back',
    s => attention(s, e),
  );
  yield* segment(
    view,
    'createWiggle({type})',
    'The envelope picks the story',
    s => wiggleTypes(s, e),
  );
  yield* segment(view, 'anticipate', 'Wind up before the action', s =>
    windUp(s, e),
  );
  yield* segment(
    view,
    'createCubicBezier(x1, y1, x2, y2)',
    'CSS curves: y outside [0, 1] gives overshoot and pull-back',
    s => overshoot(s, e),
  );
  yield* segment(
    view,
    'slowMo',
    'A dramatic pass: fast in, slow readable middle, fast out',
    s => dramaticPass(s, e),
  );
  yield* segment(
    view,
    'physicsBounce + squash',
    'Drops and landings: createPhysicsBounce(o) + createSquash(o) share contacts',
    s => drops(s, e),
  );
  yield* segment(
    view,
    'createBallistic2D',
    'Projectiles and debris: gravity + drag, closed-form at any frame',
    s => projectiles(s, e),
  );
  yield* segment(
    view,
    'createExpoScale(from, to)',
    'Camera zooms: the same zoom factor every second',
    s => zoom(s, e),
  );
});
