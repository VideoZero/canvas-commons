import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {useScene2D} from '../../scenes';
import {Video} from '../Video';
import {mockScene2D} from './mockScene2D';

describe('Video', () => {
  mockScene2D();

  beforeEach(() => {
    vi.spyOn(HTMLMediaElement.prototype, 'readyState', 'get').mockReturnValue(
      4,
    );
  });

  afterEach(() => vi.restoreAllMocks());

  it('clamps the time to zero before the duration is known', () => {
    const video = new Video({src: 'video.mp4', loop: true});
    useScene2D().getView().add(video);

    expect(video.clampTime(3)).toBe(0);
  });

  it('clamps a non-finite time to zero', () => {
    vi.spyOn(HTMLMediaElement.prototype, 'duration', 'get').mockReturnValue(10);
    const video = new Video({src: 'video.mp4'});
    useScene2D().getView().add(video);

    expect(video.clampTime(NaN)).toBe(0);
    expect(video.clampTime(12)).toBe(10);
  });

  it('wraps the time of a looping video', () => {
    vi.spyOn(HTMLMediaElement.prototype, 'duration', 'get').mockReturnValue(10);
    const video = new Video({src: 'video.mp4', loop: true});
    useScene2D().getView().add(video);

    expect(video.clampTime(12)).toBe(2);
  });
});
