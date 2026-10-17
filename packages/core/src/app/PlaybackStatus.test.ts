import {describe, expect, test, vi} from 'vitest';
import type {Scene} from '../scenes';
import {PlaybackManager} from './PlaybackManager';
import {PlaybackStatus} from './PlaybackStatus';

function fakeScene(lastFrame: number): Scene {
  return {
    lastFrame,
    async recalculate(setFrame: (frame: number) => void) {
      setFrame(lastFrame);
    },
    slides: {onChanged: {current: []}},
  } as unknown as Scene;
}

describe('PlaybackStatus', () => {
  test('notifies about recalculated scenes', async () => {
    const playback = new PlaybackManager();
    const status = new PlaybackStatus(playback);
    const scenes = [fakeScene(30), fakeScene(90)];
    playback.setup(scenes);

    const handler = vi.fn(() => ({
      frame: status.frame,
      duration: playback.duration,
    }));
    status.onScenesRecalculated.subscribe(handler, false);
    await playback.recalculate();

    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith(scenes);
    expect(handler).toHaveReturnedWith({frame: 90, duration: 90});
  });
});
