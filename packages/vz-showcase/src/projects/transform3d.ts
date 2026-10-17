import {makeProject} from '@canvas-commons/core';

import transform3dScene from '../scenes/transform3d?scene';

export default makeProject({
  name: 'transform3d',
  experimentalFeatures: true,
  scenes: [transform3dScene],
});
