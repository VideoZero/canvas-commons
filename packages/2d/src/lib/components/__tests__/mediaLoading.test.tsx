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

  it('loads an image again after it failed to load', async () => {
    const image = new ProbeImg({src: '/missing.png'});
    useScene2D().getView().add(image);
    const failed = image.element();
    failed.dispatchEvent(new Event('error'));

    image.src('/other.png');
    image.element();
    image.src('/missing.png');

    expect(image.element()).not.toBe(failed);
  });

  it('loads a video again after it failed to load', async () => {
    const video = new ProbeVideo({src: '/missing.mp4'});
    useScene2D().getView().add(video);
    const failed = video.element();
    failed.dispatchEvent(new Event('error'));

    video.src('/other.mp4');
    video.element();
    video.src('/missing.mp4');

    expect(video.element()).not.toBe(failed);
  });

  it('settles the wait for a video that fails to load', async () => {
    const video = new ProbeVideo({src: '/broken.mp4'});
    useScene2D().getView().add(video);
    video.element().dispatchEvent(new Event('error'));

    expect(await settle()).toBe('rejected');
  });
});
