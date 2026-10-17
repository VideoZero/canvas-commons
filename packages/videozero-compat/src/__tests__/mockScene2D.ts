import {Scene2D, View2D, makeScene2D, useScene2D} from '@canvas-commons/2d';
import {
  FullSceneDescription,
  LogLevel,
  Logger,
  PlaybackManager,
  PlaybackStatus,
  ReadOnlyTimeEvents,
  ThreadGenerator,
  ThreadGeneratorFactory,
  ValueDispatcher,
  Vector2,
  endPlayback,
  endScene,
  startPlayback,
  startScene,
  threads,
  useLogger,
} from '@canvas-commons/core';
import {afterAll, afterEach, beforeAll, beforeEach, expect} from 'vitest';

/**
 * Set up a scene so that nodes can be created, like `mockScene2D` in the 2d
 * package. Call it inside a `describe()` block.
 */
export function mockScene2D(): Scene2D {
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
  return scene;
}

/** Turn a generator factory into a test function. */
export function generatorTest(factory: ThreadGeneratorFactory<View2D>) {
  return () => {
    const view = useScene2D().getView();
    const tasks = threads(() => factory(view));
    [...tasks];
  };
}

/** The playback manager of the mocked scene. */
export function playbackManager(): PlaybackManager {
  return (useScene2D().playback as unknown as {playback: PlaybackManager})
    .playback;
}

/** Run the scene like a validator does: one generator step per frame. */
export function play(factory: () => ThreadGenerator) {
  const manager = playbackManager();
  manager.frame = 0;
  const tasks = threads(factory);
  while (!tasks.next().done) {
    manager.frame++;
  }
}

/** Fail a test that logs a scene error instead of letting it pass quietly. */
export function failOnSceneErrors(): void {
  const errors: unknown[] = [];
  let unsubscribe: (() => void) | null = null;
  beforeEach(() => {
    errors.length = 0;
    const logger = useLogger();
    if (!(logger instanceof Logger)) return;
    unsubscribe = logger.onLogged.subscribe(payload => {
      if (payload.level === LogLevel.Error) errors.push(payload);
    });
  });
  afterEach(() => {
    unsubscribe?.();
    expect(errors).toEqual([]);
  });
}
