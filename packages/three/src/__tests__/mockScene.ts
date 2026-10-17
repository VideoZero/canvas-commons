import {Scene2D, View2D, makeScene2D} from '@canvas-commons/2d';
import {
  FullSceneDescription,
  LogLevel,
  LogPayload,
  Logger,
  PlaybackManager,
  PlaybackStatus,
  ReadOnlyTimeEvents,
  ThreadGeneratorFactory,
  ValueDispatcher,
  Vector2,
  endPlayback,
  endScene,
  startPlayback,
  startScene,
} from '@canvas-commons/core';
import {afterAll, beforeAll, beforeEach} from 'vitest';

/**
 * Set up a scene so that nodes can be constructed, like `mockScene2D` in the
 * 2d package, with a logger whose output tests can inspect.
 */
export function mockScene(): Scene2D {
  const playback = new PlaybackManager();
  const status = new PlaybackStatus(playback);
  const description = {
    ...makeScene2D(function* () {
      // do nothing
    }),
    name: 'test',
    logger: new Logger(),
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
  return scene;
}

/**
 * Collect what the scene logs from now on, split by level.
 */
export function captureLogs(scene: Scene2D) {
  const errors: LogPayload[] = [];
  const warnings: LogPayload[] = [];
  scene.logger.onLogged.subscribe(payload => {
    if (payload.level === LogLevel.Error) {
      errors.push(payload);
    } else if (payload.level === LogLevel.Warn) {
      warnings.push(payload);
    }
  });
  return {errors, warnings};
}
