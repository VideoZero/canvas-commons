import {BBox, DependencyContext, Vector2, waitFor} from '@canvas-commons/core';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {makeScene2D, useScene2D} from '../../scenes';
import {Rect} from '../Rect';
import {ObjectFit, ScenePlayback, ScenePlaybackProps} from '../ScenePlayback';
import {generatorTest} from './generatorTest';
import {mockScene2D} from './mockScene2D';

const INNER = makeScene2D(function* (view) {
  view.add(<Rect size={100} fill={'red'} />);
  yield* waitFor(4);
});

class TestScenePlayback extends ScenePlayback {
  public constructor(props: ScenePlaybackProps) {
    super(props);
  }

  public async ready() {
    this.collectAsyncResources();
    await vi.waitFor(() => expect(this.sceneDuration()).not.toBeNull());
  }

  public fitted(fit: ObjectFit) {
    this.objectFit(fit);
    const drawImage = vi.fn();
    const context = {drawImage} as unknown as CanvasRenderingContext2D;
    const source = {width: 200, height: 100} as HTMLCanvasElement;
    this.drawFitted(context, source, new BBox(-50, -50, 100, 100));
    return drawImage.mock.calls[0].slice(1);
  }
}

function create(props: Partial<ScenePlaybackProps> = {}) {
  const node = new TestScenePlayback({src: INNER, ...props});
  useScene2D().getView().add(node);
  return node;
}

describe('ScenePlayback', () => {
  mockScene2D();

  afterEach(() => vi.restoreAllMocks());

  it('measures the duration of the inner scene', async () => {
    const node = create();
    expect(node.getDuration()).toBe(0);

    await node.ready();

    expect(node.getDuration()).toBeCloseTo(4, 1);
  });

  it('does not touch the promises of the outer scene', async () => {
    let resolveOuter = () => {};
    const outer = new Promise<void>(resolve => (resolveOuter = resolve));
    DependencyContext.collectPromise(outer);

    const node = create();
    await node.ready();

    expect(DependencyContext.hasPromises()).toBe(true);
    resolveOuter();
    const consumed = await DependencyContext.consumePromises();
    expect(consumed.map(({promise}) => promise)).toContain(outer);
  });

  it('renders frames of the inner scene', async () => {
    const drawn: CanvasImageSource[] = [];
    const fake = (canvas: HTMLCanvasElement) =>
      new Proxy(
        {canvas, getTransform: () => new DOMMatrix()},
        {
          get: (target, key) =>
            key in target
              ? target[key as keyof typeof target]
              : key === 'drawImage'
                ? (image: CanvasImageSource) => drawn.push(image)
                : () => {},
          set: () => true,
        },
      );
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      function (this: HTMLCanvasElement) {
        return fake(this) as unknown as CanvasRenderingContext2D;
      },
    );
    const node = create({renderWidth: 320, renderHeight: 180});
    await node.ready();
    const context = fake(document.createElement('canvas'));

    node.render(context as unknown as CanvasRenderingContext2D);
    await vi.waitFor(() => {
      node.render(context as unknown as CanvasRenderingContext2D);
      expect(drawn).not.toHaveLength(0);
    });

    const frame = drawn[0] as HTMLCanvasElement;
    expect([frame.width, frame.height]).toEqual([320, 180]);
  });

  it('clamps the time to the playback range', async () => {
    const node = create({start: 1, end: 3});
    await node.ready();

    expect(node.getDuration()).toBe(2);
    expect(node.clampTime(0)).toBe(1);
    expect(node.clampTime(2)).toBe(2);
    expect(node.clampTime(10)).toBe(3);
    expect(node.clampTime(NaN)).toBe(1);
  });

  it('wraps the time when looping', async () => {
    const node = create({start: 1, end: 3, loop: true});
    await node.ready();

    expect(node.clampTime(3.5)).toBeCloseTo(1.5);
    expect(node.clampTime(0.5)).toBeCloseTo(2.5);
  });

  it('reports the completion within the playback range', async () => {
    const node = create({start: 1, end: 3});
    await node.ready();

    node.seek(2.5);

    expect(node.getCurrentTime()).toBe(2.5);
    expect(node.completion()).toBeCloseTo(0.75);
  });

  it('stays at the start until the scene is measured', () => {
    const node = create({start: 1});

    expect(node.clampTime(2)).toBe(1);
    expect(node.completion()).toBe(0);
  });

  it('is sized like the inner scene', () => {
    const node = create({renderWidth: 800, renderHeight: 400});

    expect(node.size()).toEqual(new Vector2(800, 400));
  });

  it('keeps the aspect ratio of the inner scene', () => {
    const node = create({renderWidth: 800, renderHeight: 400, width: 400});

    expect(node.size()).toEqual(new Vector2(400, 200));
  });

  it('defaults to a full HD scene', () => {
    expect(create().size()).toEqual(new Vector2(1920, 1080));
  });

  it('advances while playing', async () => {
    const node = create({playbackRate: 2});
    await node.ready();

    generatorTest(function* () {
      node.play();
      yield* waitFor(1);
      expect(node.getCurrentTime()).toBeCloseTo(2);

      node.pause();
      yield* waitFor(1);
      expect(node.getCurrentTime()).toBeCloseTo(2);
      expect(node.isPlaying()).toBe(false);
    })();
  });

  it('fits the frame into its bounds', () => {
    const node = create();

    expect(node.fitted('fill')).toEqual([-50, -50, 100, 100]);
    expect(node.fitted('fit')).toEqual([-50, -25, 100, 50]);
    expect(node.fitted('cover')).toEqual([-100, -50, 200, 100]);
    expect(node.fitted('clip')).toEqual([-100, -50, 200, 100]);
  });
});
