import {makeProject} from '@canvas-commons/core';

import cameraScene from '../scenes/camera?scene';

export default makeProject({
  name: 'camera',
  experimentalFeatures: true,
  scenes: [cameraScene],
});
