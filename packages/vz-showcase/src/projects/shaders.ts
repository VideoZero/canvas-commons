import {makeProject} from '@canvas-commons/core';

import shadersScene from '../scenes/shaders?scene';

export default makeProject({
  name: 'shaders',
  experimentalFeatures: true,
  scenes: [shadersScene],
});
