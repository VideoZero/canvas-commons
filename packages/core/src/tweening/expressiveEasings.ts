import {clamp, map} from './interpolationFunctions';
import {TimingFunction} from './timingFunctions';

const BEZIER_SAMPLES = 11;
const NEWTON_ITERATIONS = 4;
const NEWTON_MIN_SLOPE = 0.001;
const SUBDIVISION_PRECISION = 1e-7;
const SUBDIVISION_ITERATIONS = 10;

/**
 * Create a CSS-style `cubic-bezier(x1, y1, x2, y2)` timing function.
 *
 * @remarks
 * The curve runs from (0, 0) to (1, 1) with the two control points given.
 * `x1` and `x2` are clamped to [0, 1] so the curve stays a function of
 * progress; `y1`/`y2` may exceed that range to overshoot.
 *
 * @param x1 - X of the first control point, clamped to [0, 1].
 * @param y1 - Y of the first control point.
 * @param x2 - X of the second control point, clamped to [0, 1].
 * @param y2 - Y of the second control point.
 *
 * @example
 * ```ts
 * const easeOutBackLike = createCubicBezier(0.34, 1.56, 0.64, 1);
 * yield* node.scale(1, 0.6, easeOutBackLike);
 * ```
 */
export function createCubicBezier(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): TimingFunction {
  x1 = clamp(0, 1, x1);
  x2 = clamp(0, 1, x2);

  if (x1 === y1 && x2 === y2) {
    return (value: number, from = 0, to = 1) => map(from, to, value);
  }

  const a = (c1: number, c2: number) => 1 - 3 * c2 + 3 * c1;
  const b = (c1: number, c2: number) => 3 * c2 - 6 * c1;
  const c = (c1: number) => 3 * c1;

  const calc = (t: number, c1: number, c2: number) =>
    ((a(c1, c2) * t + b(c1, c2)) * t + c(c1)) * t;
  const slope = (t: number, c1: number, c2: number) =>
    3 * a(c1, c2) * t * t + 2 * b(c1, c2) * t + c(c1);

  const samples = new Float64Array(BEZIER_SAMPLES);
  for (let i = 0; i < BEZIER_SAMPLES; i++) {
    samples[i] = calc(i / (BEZIER_SAMPLES - 1), x1, x2);
  }

  const solveT = (x: number): number => {
    let intervalStart = 0;
    let currentSample = 1;
    const lastSample = BEZIER_SAMPLES - 1;

    while (currentSample !== lastSample && samples[currentSample] <= x) {
      intervalStart += 1 / lastSample;
      currentSample++;
    }
    currentSample--;

    const dist =
      (x - samples[currentSample]) /
      (samples[currentSample + 1] - samples[currentSample]);
    let guess = intervalStart + dist / lastSample;

    const initialSlope = slope(guess, x1, x2);
    if (initialSlope >= NEWTON_MIN_SLOPE) {
      for (let i = 0; i < NEWTON_ITERATIONS; i++) {
        const currentSlope = slope(guess, x1, x2);
        if (currentSlope === 0) break;
        guess -= (calc(guess, x1, x2) - x) / currentSlope;
      }
      return guess;
    }
    if (initialSlope === 0) {
      return guess;
    }

    let lower = intervalStart;
    let upper = intervalStart + 1 / lastSample;
    let i = 0;
    let t = guess;
    do {
      t = lower + (upper - lower) / 2;
      const error = calc(t, x1, x2) - x;
      if (error > 0) {
        upper = t;
      } else {
        lower = t;
      }
      if (Math.abs(error) <= SUBDIVISION_PRECISION) break;
    } while (++i < SUBDIVISION_ITERATIONS);
    return t;
  };

  return (value: number, from = 0, to = 1) => {
    if (value <= 0) return map(from, to, 0);
    if (value >= 1) return map(from, to, 1);
    return map(from, to, calc(solveT(value), y1, y2));
  };
}

/**
 * Create a timing function that makes a scale (zoom) tween appear to
 * progress at a constant perceptual rate.
 *
 * @remarks
 * Linearly interpolating scale from 1 to 8 looks like it decelerates:
 * the early portion multiplies the size faster than the late portion.
 * This ease compensates so the tween `scale = map(fromScale, toScale, f(t))`
 * follows the exponential curve `fromScale * (toScale / fromScale)^t`.
 * Use it for camera zooms and Ken Burns pushes.
 *
 * @param fromScale - Scale at the start of the tween. Must be positive.
 * @param toScale - Scale at the end of the tween. Must be positive.
 * @param ease - Optional ease applied to time before the correction.
 *
 * @example
 * ```ts
 * yield* camera().zoom(8, 2, createExpoScale(1, 8));
 * ```
 */
export function createExpoScale(
  fromScale: number,
  toScale: number,
  ease?: TimingFunction,
): TimingFunction {
  if (fromScale <= 0 || toScale <= 0) {
    throw new Error('createExpoScale: scales must be positive.');
  }
  const ratio = toScale / fromScale;
  if (ratio === 1) {
    return (value: number, from = 0, to = 1) =>
      map(from, to, ease ? ease(value) : value);
  }

  return (value: number, from = 0, to = 1) => {
    const t = ease ? ease(value) : value;
    return map(from, to, (Math.pow(ratio, t) - 1) / (ratio - 1));
  };
}

export interface SlowMoOptions {
  /**
   * Fraction of the duration spent in the slow middle section.
   *
   * @defaultValue 0.7
   */
  linearRatio?: number;
  /**
   * How much the middle slows down, from 0 (no slowdown) to 1 (freeze).
   *
   * @defaultValue 0.8
   */
  power?: number;
  /**
   * When true the output ramps 0 → 1 on the way in, holds 1 through the
   * middle, and returns to 0 on the way out. Useful for opacity flashes
   * that accompany a slow-motion drive-by. Like a wiggle, it ends where it
   * started, so drive it through `tween()` rather than a signal tween.
   *
   * @defaultValue false
   */
  yoyo?: boolean;
}

/**
 * Create a slow-motion ease: fast in, slow (linear) middle, fast out.
 *
 * @remarks
 * Classic use is text or an object sweeping across the screen: it enters
 * quickly, drifts almost linearly through the readable middle stretch,
 * and exits quickly. The edges are constant-acceleration ramps, so the
 * curve is C¹-continuous.
 *
 * @example
 * ```ts
 * yield* title().x(960, 3, createSlowMo({linearRatio: 0.6}));
 * ```
 *
 * @param options - The shape of the curve.
 */
export function createSlowMo(options: SlowMoOptions = {}): TimingFunction {
  const {linearRatio = 0.7, power = 0.8, yoyo = false} = options;
  const ratio = clamp(0, 0.99, linearRatio);
  const mid = clamp(0.0001, 1, 1 - power);
  const edge = (1 - ratio) / 2;
  // Total distance = edge ramps + linear middle must equal 1.
  const v0 = (1 - ratio * mid) / edge - mid;
  const p1 = edge;
  const p3 = 1 - edge;
  // Distance covered by the entry ramp.
  const rampDist = (edge * (v0 + mid)) / 2;

  const main = (t: number): number => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    if (t < p1) {
      // Speed falls linearly v0 → mid: quadratic position.
      return v0 * t - ((v0 - mid) * t * t) / (2 * edge);
    }
    if (t <= p3) {
      return rampDist + mid * (t - p1);
    }
    const u = t - p3;
    return rampDist + mid * ratio + mid * u + ((v0 - mid) * u * u) / (2 * edge);
  };

  if (!yoyo) {
    return (value: number, from = 0, to = 1) => map(from, to, main(value));
  }

  return (value: number, from = 0, to = 1) => {
    let result;
    if (value < p1) {
      const u = value / p1;
      result = u * u * (3 - 2 * u);
    } else if (value > p3) {
      const u = (1 - value) / edge;
      result = u * u * (3 - 2 * u);
    } else {
      result = 1;
    }
    return map(from, to, result);
  };
}

export type WiggleType =
  'easeOut' | 'easeInOut' | 'anticipate' | 'uniform' | 'random';

export interface WiggleOptions {
  /**
   * Number of half-oscillations (direction changes). Integer values
   * guarantee the wiggle ends exactly at zero.
   *
   * @defaultValue 8
   */
  wiggles?: number;
  /**
   * Shape of the amplitude envelope:
   * - `easeOut` — starts at full strength and settles (impact shake).
   * - `easeInOut` — swells up and settles (turbulence).
   * - `anticipate` — small opposite-direction swing first, biggest swings
   *   late, then settles.
   * - `uniform` — constant strength throughout.
   * - `random` — per-swing random strength (seeded, deterministic).
   *
   * @defaultValue 'easeOut'
   */
  type?: WiggleType;
  /**
   * Seed for the `random` type. Same seed → same wiggle on every build.
   *
   * @defaultValue 1
   */
  seed?: number;
}

/**
 * Deterministic pseudo-random generator (mulberry32).
 */
function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Create a wiggle ease: oscillates around the starting value and returns
 * to it.
 *
 * @remarks
 * Unlike most eases this one starts AND ends at 0 — the tweened value is
 * the wiggle's peak amplitude, not a destination. For example
 * `rotation = map(0, 15, wiggle(t))` shakes the rotation between roughly
 * ±15° and comes back to rest at 0. Peaks are normalized so the strongest
 * swing reaches ±1. Drive it through `tween()`: a signal tween always ends
 * on its target value, so it would not come back to rest.
 *
 * @example
 * ```ts
 * const wiggle = createWiggle({wiggles: 6});
 * yield* tween(1, t => bell().rotation(map(0, 15, wiggle(t))));
 * ```
 *
 * @param options - The number of swings and their envelope.
 */
export function createWiggle(options: WiggleOptions = {}): TimingFunction {
  const {wiggles = 8, type = 'easeOut', seed = 1} = options;
  const count = Math.max(1, Math.round(wiggles));

  let envelope: (t: number) => number;
  let sign = 1;
  switch (type) {
    case 'easeInOut':
      envelope = t => Math.sin(Math.PI * t);
      break;
    case 'anticipate':
      envelope = t => Math.pow(t, 1.5) * (1 - t);
      sign = -1;
      break;
    case 'uniform':
    case 'random':
      envelope = () => 1;
      break;
    case 'easeOut':
    default:
      envelope = t => (1 - t) * (1 - t);
      break;
  }

  // Per-half-cycle amplitudes for the random type; constant otherwise.
  let cycleAmplitude: (index: number) => number = () => 1;
  if (type === 'random') {
    const random = createRandom(seed);
    const amplitudes = Array.from({length: count}, () => 0.3 + random() * 0.7);
    cycleAmplitude = index =>
      amplitudes[clamp(0, count - 1, Math.floor(index))];
  }

  // Normalize so the strongest swing peaks at ±1. The envelope shifts
  // each swing's true peak away from its half-cycle center, so scan
  // densely and then refine around the best sample.
  const magnitude = (t: number) =>
    Math.abs(Math.sin(Math.PI * t * count)) *
    Math.abs(envelope(t)) *
    cycleAmplitude(t * count);
  const steps = count * 100;
  let peak = 0;
  let peakAt = 0.5 / count;
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const amplitude = magnitude(t);
    if (amplitude > peak) {
      peak = amplitude;
      peakAt = t;
    }
  }
  let lower = Math.max(0, peakAt - 1 / steps);
  let upper = Math.min(1, peakAt + 1 / steps);
  for (let i = 0; i < 30; i++) {
    const a = lower + (upper - lower) / 3;
    const b = upper - (upper - lower) / 3;
    if (magnitude(a) < magnitude(b)) {
      lower = a;
    } else {
      upper = b;
    }
  }
  peak = Math.max(peak, magnitude((lower + upper) / 2));
  const scale = peak > 0 ? 1 / peak : 1;

  return (value: number, from = 0, to = 1) => {
    if (value <= 0 || value >= 1) return map(from, to, 0);
    const cycle = value * count;
    const wave = Math.sin(Math.PI * cycle);
    const amplitude = envelope(value) * cycleAmplitude(cycle) * scale;
    return map(from, to, sign * wave * amplitude);
  };
}

export interface BounceOptions {
  /**
   * Fraction of drop height retained after each bounce, in (0, 1).
   * Higher values bounce longer and higher.
   *
   * @defaultValue 0.5
   */
  strength?: number;
  /**
   * Bounces smaller than this fraction of the original height are
   * discarded.
   *
   * @defaultValue 0.005
   */
  cutoff?: number;
}

interface BounceTimeline {
  /** Duration of the initial fall, normalized. */
  fall: number;
  /** Per-bounce arcs: start time, duration, peak height (all normalized). */
  arcs: {start: number; duration: number; height: number}[];
  /** Contact events: time and relative impact strength (first = 1). */
  contacts: {time: number; impact: number}[];
}

function computeBounceTimeline(options: BounceOptions = {}): BounceTimeline {
  const strength = clamp(0.001, 0.99, options.strength ?? 0.5);
  const cutoff = options.cutoff ?? 0.005;
  // Velocity retention per contact; height retention is its square.
  const q = Math.sqrt(strength);

  // Unnormalized: g = 2 so the initial unit fall takes 1 time unit and
  // ends with speed 2. A bounce arc with takeoff speed v lasts v.
  let time = 1;
  const rawArcs: {start: number; duration: number; height: number}[] = [];
  let height = strength;
  let speed = 2 * q;
  while (height >= cutoff && rawArcs.length < 12) {
    rawArcs.push({start: time, duration: speed, height});
    time += speed;
    height *= strength;
    speed *= q;
  }

  const total = time;
  const arcs = rawArcs.map(arc => ({
    start: arc.start / total,
    duration: arc.duration / total,
    height: arc.height,
  }));
  const contacts = [
    {time: 1 / total, impact: 1},
    ...arcs.map((arc, i) => ({
      time: arc.start + arc.duration,
      impact: Math.pow(q, i + 1),
    })),
  ];

  return {fall: 1 / total, arcs, contacts};
}

/**
 * Create a physically-derived bounce ease.
 *
 * @remarks
 * Models a body falling onto the target value and rebounding with energy
 * loss, so consecutive bounces shrink and quicken realistically. Unlike
 * {@link createEaseOutBounce} the bounciness is tunable, and
 * {@link createSquash} produces a squash-and-stretch companion whose
 * pulses line up with this ease's contacts exactly.
 *
 * @example
 * ```ts
 * yield* ball().y(400, 1.5, createPhysicsBounce({strength: 0.6}));
 * ```
 *
 * @param options - The bounciness of the body.
 */
export function createPhysicsBounce(
  options: BounceOptions = {},
): TimingFunction {
  const {fall, arcs} = computeBounceTimeline(options);

  return (value: number, from = 0, to = 1) => {
    if (value <= 0) return map(from, to, 0);
    if (value >= 1) return map(from, to, 1);
    let height = 0;
    if (value < fall) {
      const u = value / fall;
      height = 1 - u * u;
    } else {
      for (const arc of arcs) {
        if (value >= arc.start && value < arc.start + arc.duration) {
          const u = (2 * (value - arc.start)) / arc.duration - 1;
          height = arc.height * (1 - u * u);
          break;
        }
      }
    }
    return map(from, to, 1 - height);
  };
}

export interface SquashOptions extends BounceOptions {
  /**
   * Height band above the ground — as a fraction of the drop height —
   * inside which the body deforms. Squash ramps from 0 at the top of
   * the band to full at ground contact.
   *
   * @defaultValue 0.12
   */
  band?: number;
}

/**
 * Create the squash companion for {@link createPhysicsBounce}.
 *
 * @remarks
 * Returns 0 except around the ground contacts of the matching bounce
 * (same options → same trajectory). The pulse is driven by the body's
 * height, not by time: it engages only inside a small band above the
 * ground, so deformation exactly brackets each contact and can never
 * appear in mid-air, however fast the arc. Peaks reach the contact's
 * relative impact strength (first contact = 1), and the final contact
 * tapers to 0 so the ease settles without a pop. Drive scale with it for
 * squash-and-stretch:
 * `scaleY = map(1, 0.6, squash(t))`, `scaleX = map(1, 1.4, squash(t))`.
 *
 * @example
 * ```ts
 * const options = {strength: 0.6};
 * const squash = createSquash(options);
 * yield* all(
 *   ball().y(400, 1.5, createPhysicsBounce(options)),
 *   tween(1.5, t => ball().scale([map(1, 1.4, squash(t)), map(1, 0.6, squash(t))])),
 * );
 * ```
 *
 * @param options - The bounciness of the body and the squash band.
 */
export function createSquash(options: SquashOptions = {}): TimingFunction {
  const band = Math.max(1e-4, options.band ?? 0.12);
  const {fall, arcs, contacts} = computeBounceTimeline(options);

  return (value: number, from = 0, to = 1) => {
    if (value <= 0 || value >= 1) return map(from, to, 0);

    // Height and the impact strength of the nearest contact.
    let height = 0;
    let impact = 0;
    if (value < fall) {
      const u = value / fall;
      height = 1 - u * u;
      // The body settles at the timeline's final contact, so the last
      // landing carries no squash — otherwise the ease would end with a
      // one-frame pop back to zero.
      impact = arcs.length > 0 ? 1 : 1 - u;
    } else {
      impact = 0;
      for (let i = 0; i < arcs.length; i++) {
        const arc = arcs[i];
        if (value >= arc.start && value < arc.start + arc.duration) {
          const u = (2 * (value - arc.start)) / arc.duration - 1;
          height = arc.height * (1 - u * u);
          // Blend from the takeoff contact to the landing contact across
          // the arc; the endpoints keep their exact impact strengths and
          // sub-band arcs (whose apex squash never reaches zero) stay
          // continuous instead of snapping at the apex.
          const takeoff = contacts[i]?.impact ?? 0;
          const landing =
            i === arcs.length - 1 ? 0 : (contacts[i + 1]?.impact ?? 0);
          impact = takeoff + ((landing - takeoff) * (u + 1)) / 2;
          break;
        }
      }
    }

    const proximity = Math.max(0, 1 - height / band);
    return map(from, to, impact * proximity);
  };
}

export interface BallisticOptions {
  /**
   * Launch speed in pixels per second.
   */
  velocity: number;
  /**
   * Launch angle in degrees; 0 points right (+x), -90 points up in screen
   * coordinates (y grows downward).
   */
  angle: number;
  /**
   * Downward acceleration in pixels per second squared.
   *
   * @defaultValue 980
   */
  gravity?: number;
  /**
   * Fraction of velocity lost to drag per second, in [0, 1).
   *
   * @defaultValue 0
   */
  friction?: number;
}

export interface BallisticTrajectory {
  /**
   * Offset from the launch point after the given time, in pixels.
   */
  position(seconds: number): {x: number; y: number};
  /**
   * Velocity after the given time, in pixels per second.
   */
  velocity(seconds: number): {x: number; y: number};
}

/**
 * Create a closed-form ballistic trajectory: launch velocity, gravity,
 * and optional air drag.
 *
 * @remarks
 * Because the trajectory is a pure function of time (not integrated per
 * tick) it can be sampled at any frame in any order — ideal for
 * deterministic rendering. Combine with a tween:
 * `tween(2, t => node.position(start.add(traj.position(t * 2))))`,
 * or fan several out with different angles for debris and confetti.
 *
 * @example
 * ```ts
 * const start = spark().position();
 * const path = createBallistic2D({velocity: 800, angle: -60});
 * yield* tween(2, t => spark().position(start.add(path.position(t * 2))));
 * ```
 *
 * @param options - The launch speed and angle, gravity, and drag.
 */
export function createBallistic2D(
  options: BallisticOptions,
): BallisticTrajectory {
  const {velocity, angle, gravity = 980, friction = 0} = options;
  const radians = (angle * Math.PI) / 180;
  const vx = Math.cos(radians) * velocity;
  const vy = Math.sin(radians) * velocity;
  const drag = clamp(0, 0.999, friction);
  const k = drag > 0 ? -Math.log(1 - drag) : 0;

  if (k < 1e-6) {
    return {
      position: seconds => ({
        x: vx * seconds,
        y: vy * seconds + (gravity * seconds * seconds) / 2,
      }),
      velocity: seconds => ({
        x: vx,
        y: vy + gravity * seconds,
      }),
    };
  }

  // dv/dt = g - k·v  →  v(t) = v∞ + (v0 - v∞)·e^(-kt), v∞ = g/k.
  const terminal = gravity / k;
  return {
    position: seconds => {
      const decay = 1 - Math.exp(-k * seconds);
      return {
        x: (vx / k) * decay,
        y: terminal * seconds + ((vy - terminal) / k) * decay,
      };
    },
    velocity: seconds => {
      const decay = Math.exp(-k * seconds);
      return {
        x: vx * decay,
        y: terminal + (vy - terminal) * decay,
      };
    },
  };
}

/**
 * A decaying shake with eight swings. See {@link createWiggle}.
 */
export const wiggle: TimingFunction = createWiggle();
/**
 * A small wind-up before three growing swings. See {@link createWiggle}.
 */
export const anticipate: TimingFunction = createWiggle({
  wiggles: 3,
  type: 'anticipate',
});
/**
 * Fast in, slow middle, fast out. See {@link createSlowMo}.
 */
export const slowMo: TimingFunction = createSlowMo();
/**
 * A physically-derived bounce. See {@link createPhysicsBounce}.
 */
export const physicsBounce: TimingFunction = createPhysicsBounce();
/**
 * The squash companion of {@link physicsBounce}. See {@link createSquash}.
 */
export const squash: TimingFunction = createSquash();
