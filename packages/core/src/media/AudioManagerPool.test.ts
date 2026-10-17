import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest';
import {Logger} from '../app';
import type {Sound} from '../scenes';
import {AudioManagerPool} from './AudioManagerPool';
import type {AudioResourceManager} from './AudioResourceManager';

const GAINS: {value: number}[] = [];

class FakeAudioContext {
  public readonly destination = {};
  public createMediaElementSource() {
    return {connect: () => undefined, disconnect: () => undefined};
  }
  public createGain() {
    const gain = {value: 1};
    GAINS.push(gain);
    return {
      gain,
      connect: () => undefined,
      disconnect: () => undefined,
    };
  }
}

function createPool(sounds: Sound[], duration: number) {
  const resources = {peekDuration: () => duration};
  const pool = new AudioManagerPool(
    new Logger(),
    resources as unknown as AudioResourceManager,
  );
  pool.setupPool(sounds);
  return pool;
}

describe('AudioManagerPool', () => {
  beforeEach(() => {
    GAINS.length = 0;
    vi.stubGlobal('AudioContext', FakeAudioContext);
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockReturnValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test('applies the fade of a sound at the current time', () => {
    const pool = createPool(
      [
        {
          audio: 'a.mp3',
          offset: 1,
          realPlaybackRate: 1,
          gain: -20,
          fadeIn: 2,
          fadeOut: 4,
        },
      ],
      10,
    );

    pool.prepare(2);
    expect(GAINS).toHaveLength(1);
    expect(GAINS[0].value).toBeCloseTo(0.1 * 0.5);

    pool.prepare(5);
    expect(GAINS[0].value).toBeCloseTo(0.1);

    pool.prepare(10);
    expect(GAINS[0].value).toBeCloseTo(0.1 * 0.25);
  });
});
