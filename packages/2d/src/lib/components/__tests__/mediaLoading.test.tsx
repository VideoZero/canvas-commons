import {DependencyContext} from '@canvas-commons/core';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {useScene2D} from '../../scenes';
import {Img} from '../Img';
import {Video} from '../Video';
import {mockScene2D} from './mockScene2D';

class ProbeImg extends Img {
  public element() {
    return this.image();
  }
}

class ProbeVideo extends Video {
  public element() {
    return this.video();
  }
}

const COLLECTED: Promise<unknown>[] = [];

function settle() {
  return Promise.race([
    Promise.all(COLLECTED).then(
      () => 'resolved',
      () => 'rejected',
    ),
    new Promise(resolve => setTimeout(() => resolve('pending'), 50)),
  ]);
}

describe('media loading', () => {
  mockScene2D();

  beforeEach(() => {
    COLLECTED.length = 0;
    vi.spyOn(DependencyContext, 'collectPromise').mockImplementation(
      (promise: Promise<unknown>) => {
        promise.catch(() => undefined);
        COLLECTED.push(promise);
        return {promise, value: null};
      },
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('loads an image again once the assets change', () => {
    const image = new ProbeImg({src: '/missing.png'});
    useScene2D().getView().add(image);
    const failed = image.element();
    failed.dispatchEvent(new Event('error'));

    image.src('/other.png');
    image.element();
    image.src('/missing.png');
    expect(image.element()).toBe(failed);

    useScene2D().getView().assetHash('changed-image');
    expect(image.element()).not.toBe(failed);
  });

  it('loads a video again once the assets change', () => {
    const video = new ProbeVideo({src: '/missing.mp4'});
    useScene2D().getView().add(video);
    const failed = video.element();
    failed.dispatchEvent(new Event('error'));

    video.src('/other.mp4');
    video.element();
    video.src('/missing.mp4');
    expect(video.element()).toBe(failed);

    useScene2D().getView().assetHash('changed-video');
    expect(video.element()).not.toBe(failed);
  });

  it('plays on with an image that fails to load', async () => {
    const warn = vi.spyOn(console, 'warn').mockReturnValue(undefined);
    vi.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(
      false,
    );
    const image = new ProbeImg({src: '/broken.png'});
    useScene2D().getView().add(image);
    image.element().dispatchEvent(new Event('error'));

    expect(await settle()).toBe('resolved');
    expect(warn).toHaveBeenCalledOnce();
  });

  it('plays on with a video that fails to load', async () => {
    const warn = vi.spyOn(console, 'warn').mockReturnValue(undefined);
    const video = new ProbeVideo({src: '/broken.mp4'});
    useScene2D().getView().add(video);
    video.element().dispatchEvent(new Event('error'));

    expect(await settle()).toBe('resolved');
    expect(warn).toHaveBeenCalledOnce();
  });

  it('draws an image that failed to load blank', () => {
    const image = new ProbeImg({src: '/broken.png', size: 100});
    useScene2D().getView().add(image);
    const drawImage = vi.fn();
    const context = new Proxy(
      {drawImage},
      {
        get: (target: Record<string, unknown>, property: string) =>
          property in target ? target[property] : () => undefined,
        set: () => true,
      },
    ) as unknown as CanvasRenderingContext2D;

    image.render(context);

    expect(drawImage).not.toHaveBeenCalled();
  });

  it('lists the videos that failed to load until they load', () => {
    const video = new ProbeVideo({src: '/pending.mp4'});
    useScene2D().getView().add(video);
    const element = video.element();

    element.dispatchEvent(new Event('error'));
    expect(Video.unavailable).toContain(element.src);

    element.dispatchEvent(new Event('loadedmetadata'));
    expect(Video.unavailable).not.toContain(element.src);
  });

  it('loads media anonymously so frames can be exported', () => {
    const image = new ProbeImg({src: '/photo.png'});
    const video = new ProbeVideo({src: '/clip.mp4'});
    useScene2D().getView().add([image, video]);

    expect(image.element().crossOrigin).toBe('anonymous');
    expect(video.element().crossOrigin).toBe('anonymous');
  });
});

describe('media that fails to load over many frames', () => {
  mockScene2D();

  const broken = new WeakSet<HTMLImageElement | HTMLVideoElement>();
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockReturnValue(undefined);
    vi.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockImplementation(
      function (this: HTMLImageElement) {
        return broken.has(this);
      },
    );
  });

  afterEach(async () => {
    await DependencyContext.consumePromises();
    vi.restoreAllMocks();
  });

  async function playFrames(
    element: () => HTMLImageElement | HTMLVideoElement,
  ) {
    const created = new Set<HTMLImageElement | HTMLVideoElement>();
    for (let frame = 0; frame < 30; frame++) {
      const current = element();
      created.add(current);
      if (!broken.has(current)) {
        broken.add(current);
        current.dispatchEvent(new Event('error'));
      }
      await DependencyContext.consumePromises();
      element();
      expect(DependencyContext.hasPromises()).toBe(false);
    }
    return created;
  }

  it('requests and reports a missing image once', async () => {
    const image = new ProbeImg({src: '/frames-missing.png'});
    useScene2D().getView().add(image);

    const created = await playFrames(() => image.element());

    expect(created.size).toBe(1);
    expect(warn).toHaveBeenCalledOnce();
  });

  it('requests and reports a missing video once', async () => {
    const video = new ProbeVideo({src: '/frames-missing.mp4'});
    useScene2D().getView().add(video);

    const created = await playFrames(() => video.element());

    expect(created.size).toBe(1);
    expect(warn).toHaveBeenCalledOnce();
  });
});
