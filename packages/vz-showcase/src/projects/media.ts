import {makeProject} from '@canvas-commons/core';

import mediaScene from '../scenes/media?scene';

export default makeProject({
  name: 'media',
  experimentalFeatures: true,
  scenes: [mediaScene],
});
