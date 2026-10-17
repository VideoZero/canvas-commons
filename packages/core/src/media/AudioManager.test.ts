import {afterEach, describe, expect, test, vi} from 'vitest';
import {Logger} from '../app';
import {AudioManager} from './AudioManager';

function createManager() {
  return new AudioManager(new Logger(), {} as AudioContext);
}

describe('AudioManager', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('plays before the duration of the source is known', async () => {
    const play = vi
      .spyOn(HTMLMediaElement.prototype, 'play')
      .mockResolvedValue(undefined);
    const manager = createManager();
    manager.setSource('sound.mp3');

    await expect(manager.setPaused(false)).resolves.toBe(true);
    expect(play).toHaveBeenCalledOnce();
  });
});
