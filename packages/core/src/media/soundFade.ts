import type {SoundSettings} from '../scenes';

export type SoundFade = Pick<SoundSettings, 'fadeIn' | 'fadeOut'>;

/**
 * Get the fade multiplier of a sound at the given point in time.
 *
 * @example
 * ```ts
 * // halfway through a one-second fade-in
 * soundFadeGain({fadeIn: 1}, 0.5, 10); // 0.5
 * ```
 *
 * @param fade - The fade-in and fade-out durations in seconds.
 * @param elapsed - The time in seconds since the sound started.
 * @param length - The length of the sound in seconds. When unknown, the
 *                 fade-out is skipped.
 *
 * @returns A multiplier between 0 and 1 to apply to the gain of the sound.
 */
export function soundFadeGain(
  fade: SoundFade,
  elapsed: number,
  length = Infinity,
): number {
  const fadeIn = fade.fadeIn ?? 0;
  const fadeOut = fade.fadeOut ?? 0;
  let gain = 1;
  if (fadeIn > 0) {
    gain = Math.min(gain, elapsed / fadeIn);
  }
  if (fadeOut > 0) {
    gain = Math.min(gain, (length - elapsed) / fadeOut);
  }
  return Math.max(0, Math.min(1, gain));
}

/**
 * Get the points in time at which the fade of a sound changes its slope.
 *
 * @remarks
 * The fade is linear between any two consecutive points, so ramping the gain
 * from one point to the next reproduces {@link soundFadeGain} exactly.
 *
 * @example
 * ```ts
 * soundFadeBreakpoints({fadeIn: 1, fadeOut: 2}, 0, 10); // [0, 1, 8, 10]
 * ```
 *
 * @param fade - The fade-in and fade-out durations in seconds.
 * @param from - The time in seconds since the sound started from which to
 *               list the points.
 * @param length - The length of the sound in seconds.
 *
 * @returns The sorted times in seconds since the sound started, including
 *          `from` and `length`.
 */
export function soundFadeBreakpoints(
  fade: SoundFade,
  from: number,
  length: number,
): number[] {
  const fadeIn = fade.fadeIn ?? 0;
  const fadeOut = fade.fadeOut ?? 0;
  const points = [from, length];
  if (fadeIn > 0) {
    points.push(fadeIn);
  }
  if (fadeOut > 0) {
    points.push(length - fadeOut);
  }
  if (fadeIn > 0 && fadeOut > 0 && fadeIn + fadeOut > length) {
    points.push((length * fadeIn) / (fadeIn + fadeOut));
  }
  return [
    ...new Set(points.filter(point => point >= from && point <= length)),
  ].sort((a, b) => a - b);
}
