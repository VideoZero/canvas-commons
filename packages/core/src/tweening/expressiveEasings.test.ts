import {describe, expect, test} from 'vitest';
import {
  createBallistic2D,
  createCubicBezier,
  createExpoScale,
  createPhysicsBounce,
  createSlowMo,
  createSquash,
  createWiggle,
} from './expressiveEasings';

function sample(fn: (t: number) => number, count = 1000): number[] {
  return Array.from({length: count + 1}, (_, i) => fn(i / count));
}

describe('createCubicBezier()', () => {
  test('hits both endpoints', () => {
    const ease = createCubicBezier(0.25, 0.1, 0.25, 1);
    expect(ease(0)).toBe(0);
    expect(ease(1)).toBe(1);
  });

  test('is the identity when control points lie on the diagonal', () => {
    const ease = createCubicBezier(0.4, 0.4, 0.7, 0.7);
    for (const t of [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1]) {
      expect(ease(t)).toBeCloseTo(t, 6);
    }
  });

  test('matches a brute-force evaluation of the curve', () => {
    // Independently invert x(t) by dense sampling and compare.
    const [x1, y1, x2, y2] = [0.25, 0.1, 0.25, 1];
    const ease = createCubicBezier(x1, y1, x2, y2);
    const bezier = (t: number, a: number, b: number) =>
      3 * a * t * (1 - t) * (1 - t) + 3 * b * t * t * (1 - t) + t * t * t;

    const steps = 100000;
    let index = 0;
    for (let i = 1; i < 100; i++) {
      const x = i / 100;
      while (index < steps && bezier(index / steps, x1, x2) < x) index++;
      const reference = bezier(index / steps, y1, y2);
      expect(Math.abs(ease(x) - reference)).toBeLessThan(1e-3);
    }
  });

  test('overshoots when a control point exceeds 1', () => {
    const ease = createCubicBezier(0.34, 1.56, 0.64, 1);
    const max = Math.max(...sample(t => ease(t)));
    expect(max).toBeGreaterThan(1.05);
  });

  test('remaps onto a custom range', () => {
    const ease = createCubicBezier(0.4, 0.4, 0.7, 0.7);
    expect(ease(0.5, 10, 20)).toBeCloseTo(15, 6);
  });
});

describe('createExpoScale()', () => {
  test('hits both endpoints', () => {
    const ease = createExpoScale(1, 8);
    expect(ease(0)).toBe(0);
    expect(ease(1)).toBe(1);
  });

  test('produces an exponential scale curve when lerped', () => {
    const from = 1;
    const to = 8;
    const ease = createExpoScale(from, to);
    for (const t of [0.25, 1 / 3, 0.5, 0.75]) {
      const scale = from + (to - from) * ease(t);
      expect(scale).toBeCloseTo(from * Math.pow(to / from, t), 6);
    }
    // Halfway through a 1 → 8 zoom the scale should be 8^0.5 ≈ 2.83,
    // not the linear 4.5.
    expect(from + (to - from) * ease(0.5)).toBeCloseTo(Math.sqrt(8), 6);
  });

  test('works when zooming out', () => {
    const from = 4;
    const to = 0.5;
    const ease = createExpoScale(from, to);
    const scale = from + (to - from) * ease(0.5);
    expect(scale).toBeCloseTo(from * Math.pow(to / from, 0.5), 6);
  });

  test('degrades to identity for equal scales', () => {
    const ease = createExpoScale(2, 2);
    expect(ease(0.3)).toBeCloseTo(0.3, 6);
  });

  test('rejects non-positive scales', () => {
    expect(() => createExpoScale(0, 2)).toThrow();
    expect(() => createExpoScale(1, -3)).toThrow();
  });
});

describe('createSlowMo()', () => {
  test('hits both endpoints and stays monotonic', () => {
    const ease = createSlowMo();
    const values = sample(t => ease(t));
    expect(values[0]).toBe(0);
    expect(values[values.length - 1]).toBe(1);
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeGreaterThanOrEqual(values[i - 1]);
    }
  });

  test('moves at the configured slow speed through the middle', () => {
    // Defaults: linearRatio 0.7 → middle spans [0.15, 0.85];
    // power 0.8 → relative speed 0.2.
    const ease = createSlowMo();
    const covered = ease(0.65) - ease(0.35);
    expect(covered).toBeCloseTo(0.3 * 0.2, 6);
  });

  test('is continuous across segment joints', () => {
    const ease = createSlowMo({linearRatio: 0.5, power: 0.9});
    const values = sample(t => ease(t), 10000);
    for (let i = 1; i < values.length; i++) {
      expect(Math.abs(values[i] - values[i - 1])).toBeLessThan(0.002);
    }
  });

  test('yoyo mode rises, holds, and returns', () => {
    const ease = createSlowMo({yoyo: true});
    expect(ease(0)).toBe(0);
    expect(ease(0.5)).toBe(1);
    expect(ease(0.2)).toBe(1);
    expect(ease(0.8)).toBe(1);
    expect(ease(1)).toBe(0);
    expect(ease(0.05)).toBeGreaterThan(0);
    expect(ease(0.05)).toBeLessThan(1);
  });
});

describe('createWiggle()', () => {
  test('starts and ends at rest', () => {
    for (const type of [
      'easeOut',
      'easeInOut',
      'anticipate',
      'uniform',
      'random',
    ] as const) {
      const ease = createWiggle({type});
      expect(ease(0)).toBe(0);
      expect(ease(1)).toBe(0);
    }
  });

  test('normalizes the strongest swing to ±1', () => {
    for (const type of ['easeOut', 'easeInOut', 'uniform'] as const) {
      const ease = createWiggle({type});
      const peak = Math.max(...sample(t => Math.abs(ease(t)), 10000));
      expect(peak).toBeGreaterThan(0.98);
      expect(peak).toBeLessThanOrEqual(1.000001);
    }
  });

  test('produces the requested number of swings', () => {
    const wiggles = 6;
    const ease = createWiggle({wiggles, type: 'uniform'});
    const values = sample(t => ease(t), 10000).filter(v => v !== 0);
    let flips = 0;
    for (let i = 1; i < values.length; i++) {
      if (Math.sign(values[i]) !== Math.sign(values[i - 1])) flips++;
    }
    expect(flips).toBe(wiggles - 1);
  });

  test('anticipate starts with an opposite-direction swing', () => {
    const ease = createWiggle({type: 'anticipate'});
    expect(ease(0.02)).toBeLessThan(0);
  });

  test('random type is deterministic per seed', () => {
    const a = createWiggle({type: 'random', seed: 5});
    const b = createWiggle({type: 'random', seed: 5});
    const c = createWiggle({type: 'random', seed: 6});
    const points = [0.1, 0.33, 0.5, 0.77, 0.9];
    for (const t of points) {
      expect(a(t)).toBe(b(t));
    }
    expect(points.some(t => a(t) !== c(t))).toBe(true);
  });
});

describe('createPhysicsBounce()', () => {
  test('hits both endpoints and stays within range', () => {
    const ease = createPhysicsBounce();
    const values = sample(t => ease(t), 10000);
    expect(values[0]).toBe(0);
    expect(values[values.length - 1]).toBe(1);
    for (const value of values) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  test('returns to the target on every contact', () => {
    const ease = createPhysicsBounce({strength: 0.6});
    const values = sample(t => ease(t), 10000);
    // Count entries into the near-target band — each is one contact.
    // The band is wider than one sampling step so brief contacts count.
    let contacts = 0;
    let inBand = false;
    for (const value of values) {
      const near = value > 0.995;
      if (near && !inBand) contacts++;
      inBand = near;
    }
    expect(contacts).toBeGreaterThanOrEqual(4);
  });

  test('stronger bounces rebound higher', () => {
    const soft = createPhysicsBounce({strength: 0.2});
    const bouncy = createPhysicsBounce({strength: 0.8});
    const reboundDepth = (ease: (t: number) => number) => {
      const values = sample(t => ease(t), 10000);
      // Deepest dip after the first contact.
      const firstContact = values.findIndex(v => v > 0.99);
      return 1 - Math.min(...values.slice(firstContact));
    };
    expect(reboundDepth(bouncy)).toBeGreaterThan(reboundDepth(soft));
    expect(reboundDepth(bouncy)).toBeCloseTo(0.8, 1);
    expect(reboundDepth(soft)).toBeCloseTo(0.2, 1);
  });
});

describe('createSquash()', () => {
  test('rests at zero outside contacts', () => {
    const ease = createSquash();
    expect(ease(0)).toBe(0);
    expect(ease(1)).toBe(0);
    expect(ease(0.02)).toBe(0);
  });

  test('first pulse peaks at full strength', () => {
    const ease = createSquash();
    const peak = Math.max(...sample(t => ease(t), 10000));
    expect(peak).toBeGreaterThan(0.99);
    expect(peak).toBeLessThanOrEqual(1.000001);
  });

  test('is continuous — no visible step between adjacent samples', () => {
    // Late arcs peak below the band; the impact factor must blend across
    // the arc instead of snapping to the next contact at the apex.
    const ease = createSquash();
    const values = sample(t => ease(t), 10000);
    for (let i = 1; i < values.length; i++) {
      expect(Math.abs(values[i] - values[i - 1])).toBeLessThan(0.02);
    }
  });

  test('tolerates a degenerate band without producing NaN', () => {
    const ease = createSquash({band: 0});
    const values = sample(t => ease(t), 2000);
    for (const value of values) {
      expect(Number.isNaN(value)).toBe(false);
    }
  });

  test('pulses peak at the bounce contacts and stay near the ground', () => {
    const options = {strength: 0.55};
    const bounce = createPhysicsBounce(options);
    const squash = createSquash(options);
    const steps = 10000;
    const bounceValues = sample(t => bounce(t), steps);
    const squashValues = sample(t => squash(t), steps);

    const firstContact =
      bounceValues.findIndex(value => value > 0.999) / steps;
    const squashPeak =
      squashValues.indexOf(Math.max(...squashValues)) / steps;
    expect(Math.abs(squashPeak - firstContact)).toBeLessThan(0.005);
    // No mid-air deformation: zero whenever the body is above the band.
    for (let i = 0; i <= steps; i++) {
      if (bounceValues[i] < 1 - 0.12) {
        expect(squashValues[i]).toBe(0);
      }
    }
  });
});

describe('createBallistic2D()', () => {
  test('matches the frictionless parabola exactly', () => {
    const trajectory = createBallistic2D({
      velocity: 500,
      angle: -60,
      gravity: 980,
    });
    const radians = (-60 * Math.PI) / 180;
    const vx = 500 * Math.cos(radians);
    const vy = 500 * Math.sin(radians);
    for (const t of [0, 0.25, 0.5, 1, 2]) {
      const {x, y} = trajectory.position(t);
      expect(x).toBeCloseTo(vx * t, 6);
      expect(y).toBeCloseTo(vy * t + (980 * t * t) / 2, 6);
    }
  });

  test('velocity is the derivative of position', () => {
    const cases = [
      {velocity: 400, angle: -45, gravity: 980, friction: 0},
      {velocity: 400, angle: -45, gravity: 980, friction: 0.3},
    ];
    const dt = 1e-5;
    for (const options of cases) {
      const trajectory = createBallistic2D(options);
      for (const t of [0.1, 0.5, 1.5]) {
        const before = trajectory.position(t - dt);
        const after = trajectory.position(t + dt);
        const velocity = trajectory.velocity(t);
        expect((after.x - before.x) / (2 * dt)).toBeCloseTo(velocity.x, 2);
        expect((after.y - before.y) / (2 * dt)).toBeCloseTo(velocity.y, 2);
      }
    }
  });

  test('friction shortens the range', () => {
    const free = createBallistic2D({velocity: 500, angle: -45});
    const dragged = createBallistic2D({
      velocity: 500,
      angle: -45,
      friction: 0.4,
    });
    expect(dragged.position(2).x).toBeLessThan(free.position(2).x);
  });

  test('small friction converges to the frictionless solution', () => {
    const free = createBallistic2D({velocity: 500, angle: -30});
    const nearly = createBallistic2D({
      velocity: 500,
      angle: -30,
      friction: 1e-4,
    });
    const a = free.position(1);
    const b = nearly.position(1);
    expect(b.x).toBeCloseTo(a.x, 0);
    expect(b.y).toBeCloseTo(a.y, 0);
  });

  test('straight-up launch has no horizontal drift', () => {
    const trajectory = createBallistic2D({velocity: 300, angle: -90});
    expect(trajectory.position(0.5).x).toBeCloseTo(0, 6);
    expect(trajectory.position(0.5).y).toBeCloseTo(
      -300 * 0.5 + (980 * 0.25) / 2,
      6,
    );
  });
});
