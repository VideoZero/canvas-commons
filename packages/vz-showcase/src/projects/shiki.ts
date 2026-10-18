import {makeProject} from '@canvas-commons/core';

import shikiScene from '../scenes/shiki?scene';

export default makeProject({
  name: 'shiki',
  experimentalFeatures: true,
  scenes: [shikiScene],
});
