/**
 * Test-only scene bootstrap, mirroring `mockScene2D` from the 2d package:
 * nodes can only be constructed while a scene is on the stack.
 */
import {
  FullSceneDescription,
  PlaybackManager,
  PlaybackStatus,
  ThreadGeneratorFactory,
  ValueDispatcher,
  Vector2,
  endPlayback,
  endScene,
  startPlayback,
  startScene,
} from '@motion-canvas/core';
import {ReadOnlyTimeEvents} from '@motion-canvas/core/lib/scenes/timeEvents';
import {afterAll, beforeAll, beforeEach} from 'vitest';
import {Scene2D, makeScene2D} from '../../2d/src/lib/scenes';
import {View2D} from '../../2d/src/lib/components/View2D';

export function mockScene2D() {
  const playback = new PlaybackManager();
  const status = new PlaybackStatus(playback);
  const description = {
    ...makeScene2D(function* () {
      // do nothing
    }),
    name: 'test',
    size: new Vector2(1920, 1080),
    resolutionScale: 1,
    timeEventsClass: ReadOnlyTimeEvents,
    playback: status,
  } as unknown as FullSceneDescription<ThreadGeneratorFactory<View2D>>;
  description.onReplaced = new ValueDispatcher(description);
  const scene = new Scene2D(description);

  beforeAll(() => {
    startScene(scene);
    startPlayback(status);
  });
  afterAll(() => {
    endPlayback(status);
    endScene(scene);
  });
  beforeEach(() => scene.reset());
}
