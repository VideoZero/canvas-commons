import {makeProject} from '@canvas-commons/core';

import attributionScene from '../scenes/attribution?scene';

export default makeProject({
  name: 'attribution',
  experimentalFeatures: true,
  scenes: [attributionScene],
});
