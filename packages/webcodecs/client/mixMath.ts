import type {SoundFade} from '@canvas-commons/core';
import {
  decibelsToAmplitude,
  soundFadeBreakpoints,
  soundFadeGain,
} from '@canvas-commons/core';

/** Decibels to a linear amplitude factor. */
export function dbToGain(db: number): number {
  return decibelsToAmplitude(db);
}

/**
 * Seconds to seek into the source before playback.
 *
 * @remarks
 * For a negative offset (the sound started before the render window) skip
 * `|offset| * realPlaybackRate` source-seconds so output time 0 lines up.
 */
export function sourceOffset(
  start: number | undefined,
  offset: number,
  realPlaybackRate: number,
): number {
  let trimmed = start ?? 0;
  if (offset < 0) {
    trimmed -= offset * realPlaybackRate;
  }
  return trimmed;
}

/**
 * Shift a project-global offset (seconds) into the render's output timeline,
 * which starts at `rangeStart`.
 *
 * @remarks
 * Sound and master offsets are measured from the start of the project, but a
 * partial render starts at `rangeStart`. A sound that began before the range
 * gets a negative offset, which {@link startWhen} and {@link sourceOffset} then
 * resolve to a seek into the source.
 */
export function outputOffset(offset: number, rangeStart: number): number {
  return offset - rangeStart;
}

/** Output start time in seconds; negative offsets start at 0. */
export function startWhen(offset: number): number {
  return offset > 0 ? offset : 0;
}

/**
 * Source-seconds to play. `end` is in source time; `srcOffset` already folds in
 * the negative-offset seek. Never negative.
 */
export function playDuration(
  end: number | undefined,
  srcOffset: number,
  bufferDuration: number,
): number {
  const limit =
    end !== undefined ? end - srcOffset : bufferDuration - srcOffset;
  return Math.max(0, limit);
}

/** Total mixed length in samples, capped to the video duration. */
export function totalLengthSamples(
  durationFrames: number,
  fps: number,
  sampleRate: number,
): number {
  return Math.max(1, Math.ceil((durationFrames / fps) * sampleRate));
}

export interface GainPoint {
  /** Output seconds since the source started playing. */
  time: number;
  gain: number;
}

/**
 * Gain values to ramp between linearly to apply the fades of a sound.
 *
 * @remarks
 * `from` is how far into the sound, in output seconds, playback starts; it's
 * non-zero for a sound that began before the render window.
 *
 * @returns An empty list when the sound has no fades.
 */
export function fadeAutomation(
  fade: SoundFade,
  gain: number,
  from: number,
  length: number,
): GainPoint[] {
  if (!fade.fadeIn && !fade.fadeOut) {
    return [];
  }
  return soundFadeBreakpoints(fade, from, length).map(point => ({
    time: point - from,
    gain: gain * soundFadeGain(fade, point, length),
  }));
}
