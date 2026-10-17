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

export function mockScene2D() {
  const logger = new Logger();
  const errors: LogPayload[] = [];
  logger.onLogged.subscribe(payload => {
    if (payload.level === LogLevel.Error) errors.push(payload);
  });
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
    logger,
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
  beforeEach(async () => {
    await scene.reset();
    errors.length = 0;
  });

  return {errors};
}
