import {makeProject} from '@canvas-commons/core';

import lineAlignChildrenScene from '../scenes/line-align-children?scene';

export default makeProject({
  name: 'line-align-children',
  experimentalFeatures: true,
  scenes: [lineAlignChildrenScene],
});
