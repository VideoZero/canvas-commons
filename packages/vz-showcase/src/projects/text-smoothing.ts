import {makeProject} from '@canvas-commons/core';

import textSmoothingScene from '../scenes/text-smoothing?scene';

export default makeProject({
  name: 'text-smoothing',
  experimentalFeatures: true,
  scenes: [textSmoothingScene],
});
