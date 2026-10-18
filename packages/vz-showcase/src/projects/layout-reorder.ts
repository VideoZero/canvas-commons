import {makeProject} from '@canvas-commons/core';

import layoutReorderScene from '../scenes/layout-reorder?scene';

export default makeProject({
  name: 'layout-reorder',
  experimentalFeatures: true,
  scenes: [layoutReorderScene],
});
