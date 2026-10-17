import {makeProject} from '@canvas-commons/core';

import easingsScene from '../scenes/easings?scene';

export default makeProject({
  name: 'easings',
  experimentalFeatures: true,
  scenes: [easingsScene],
});
