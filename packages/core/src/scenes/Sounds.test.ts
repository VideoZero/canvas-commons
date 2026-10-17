import {describe, expect, test} from 'vitest';
import {EventDispatcher} from '../events';
import type {Scene} from './Scene';
import {Sounds} from './Sounds';

function createSounds(time: number) {
  const scene = {
    playback: {time},
    onReset: new EventDispatcher<void>().subscribable,
    onReloaded: new EventDispatcher<void>().subscribable,
    onRecalculated: new EventDispatcher<void>().subscribable,
  };
  return new Sounds(scene as unknown as Scene);
}

describe('Sounds', () => {
  test('add places a sound relative to the current time', () => {
    const sounds = createSounds(2);
    sounds.add({audio: 'a.mp3'}, 0.5);

    expect(sounds.getSounds()).toEqual([
      {audio: 'a.mp3', offset: 2.5, realPlaybackRate: 1},
    ]);
  });

  test('addAt places a sound at an absolute time', () => {
    const sounds = createSounds(2);
    sounds.addAt({audio: 'a.mp3', playbackRate: 2}, 0.5);

    expect(sounds.getSounds()).toEqual([
      {audio: 'a.mp3', offset: 0.5, playbackRate: 2, realPlaybackRate: 2},
    ]);
  });
});
