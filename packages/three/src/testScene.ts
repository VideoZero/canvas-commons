/**
 * Test-only scene bootstrap, mirroring `mockScene2D` from the 2d package:
 * nodes can only be constructed while a scene is on the stack.
 */
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
} from '@motion-canvas/core';
import {afterAll, beforeAll, beforeEach} from 'vitest';
import {View2D} from '../../2d/src/lib/components/View2D';
import {Scene2D, makeScene2D} from '../../2d/src/lib/scenes';

/**
 * jsdom has no layout engine, so a layout node would measure `0 × 0`. Report
 * the size a node asked for instead (Layout writes it to the element style),
 * which is what a real browser returns for a layout root with explicit
 * dimensions.
 */
function mockElementLayout() {
  HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
    const width = parseFloat(this.style.width) || 0;
    const height = parseFloat(this.style.height) || 0;
    return {
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: width,
      bottom: height,
      width,
      height,
      toJSON: () => ({}),
    } as DOMRect;
  };
}

export function mockScene2D(): Scene2D {
  mockElementLayout();
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
