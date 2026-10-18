import {makeProject} from '@canvas-commons/core';

import rigScene from '../scenes/rig?scene';

export default makeProject({
  name: 'rig',
  experimentalFeatures: true,
  scenes: [rigScene],
});
