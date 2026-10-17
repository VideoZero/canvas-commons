import {describe, expect, test} from 'vitest';
import {soundFadeBreakpoints, soundFadeGain} from './soundFade';

describe('soundFadeGain', () => {
  test('is unity without fades', () => {
    expect(soundFadeGain({}, 0, 10)).toBe(1);
  });

  test('ramps in from silence', () => {
    expect(soundFadeGain({fadeIn: 2}, 0, 10)).toBe(0);
    expect(soundFadeGain({fadeIn: 2}, 1, 10)).toBe(0.5);
    expect(soundFadeGain({fadeIn: 2}, 3, 10)).toBe(1);
  });

  test('ramps out to silence', () => {
    expect(soundFadeGain({fadeOut: 2}, 7, 10)).toBe(1);
    expect(soundFadeGain({fadeOut: 2}, 9, 10)).toBe(0.5);
    expect(soundFadeGain({fadeOut: 2}, 10, 10)).toBe(0);
  });

  test('skips the fade-out when the length is unknown', () => {
    expect(soundFadeGain({fadeOut: 2}, 9)).toBe(1);
  });

  test('takes the lower of overlapping fades', () => {
    expect(soundFadeGain({fadeIn: 4, fadeOut: 4}, 1, 4)).toBe(0.25);
    expect(soundFadeGain({fadeIn: 4, fadeOut: 4}, 3, 4)).toBe(0.25);
  });
});

describe('soundFadeBreakpoints', () => {
  test('lists the corners of the fade', () => {
    expect(soundFadeBreakpoints({fadeIn: 1, fadeOut: 2}, 0, 10)).toEqual([
      0, 1, 8, 10,
    ]);
  });

  test('includes the peak of overlapping fades', () => {
    expect(soundFadeBreakpoints({fadeIn: 1, fadeOut: 3}, 0, 2)).toEqual([
      0, 0.5, 1, 2,
    ]);
  });

  test('starts at the given time', () => {
    expect(soundFadeBreakpoints({fadeIn: 1, fadeOut: 2}, 4, 10)).toEqual([
      4, 8, 10,
    ]);
  });

  test('reproduces the gain with linear ramps', () => {
    const fade = {fadeIn: 3, fadeOut: 2};
    const points = soundFadeBreakpoints(fade, 0.5, 4);
    for (let time = 0.5; time <= 4; time += 0.25) {
      const next = points.findIndex(point => point >= time);
      const from = points[Math.max(0, next - 1)];
      const to = points[next];
      const start = soundFadeGain(fade, from, 4);
      const end = soundFadeGain(fade, to, 4);
      const ramp =
        to === from
          ? end
          : start + ((end - start) * (time - from)) / (to - from);
      expect(ramp).toBeCloseTo(soundFadeGain(fade, time, 4));
    }
  });
});
