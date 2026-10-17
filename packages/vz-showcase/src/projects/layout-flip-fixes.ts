import {makeProject} from '@canvas-commons/core';

import layoutFlipFixesScene from '../scenes/layout-flip-fixes?scene';

export default makeProject({
  name: 'layout-flip-fixes',
  experimentalFeatures: true,
  scenes: [layoutFlipFixesScene],
});
