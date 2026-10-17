import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest';
import {Logger} from './Logger';
import {Player} from './Player';
import type {Project} from './Project';

class FakeAudioContext {
  public readonly destination = {};
  public createMediaElementSource() {
    return {connect: () => undefined, disconnect: () => undefined};
  }
  public createGain() {
    return {
      gain: {value: 1},
      connect: () => undefined,
      disconnect: () => undefined,
    };
  }
}

class FakeScene {
  public readonly onReloaded = {subscribe: () => undefined};
  public readonly variables = {updateSignals: () => undefined};
  public readonly slides = {isWaiting: () => false};
  public readonly sounds = {getSounds: () => []};
}

function createPlayer(fps: number) {
  const project = {
    logger: new Logger(),
    scenes: [{klass: FakeScene}],
    variables: {},
  } as unknown as Project;
  const player = new Player(project, {fps});
  player.deactivate();

  const playback = player.playback;
  vi.spyOn(playback, 'recalculate').mockImplementation(async () => {
    playback.duration = fps * 10;
  });
  vi.spyOn(playback, 'seek').mockImplementation(async frame => {
    playback.frame = frame;
    return false;
  });
  return player;
}

function run(player: Player) {
  return (player as unknown as {run(): Promise<void>}).run();
}

describe('Player', () => {
  beforeEach(() => {
    vi.stubGlobal('AudioContext', FakeAudioContext);
    vi.stubGlobal('requestAnimationFrame', () => 0);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test.each([10, 30, 60])(
    'starts the audio 50 ms behind a seek at %i fps',
    async fps => {
      const player = createPlayer(fps);
      const setTime = vi.spyOn(player.audio, 'setTime');

      await run(player);
      player.requestSeek(fps * 2);
      await run(player);

      expect(player.playback.frame).toBe(fps * 2);
      expect(setTime).toHaveBeenLastCalledWith(1.95);
    },
  );
});
