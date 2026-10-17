import {makeProject} from '@canvas-commons/core';

import scenePlaybackScene from '../scenes/scene-playback?scene';

export default makeProject({
  name: 'scene-playback',
  experimentalFeatures: true,
  scenes: [scenePlaybackScene],
});
