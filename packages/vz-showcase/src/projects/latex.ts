import {makeProject} from '@canvas-commons/core';

import latexScene from '../scenes/latex?scene';

export default makeProject({
  name: 'latex',
  experimentalFeatures: true,
  scenes: [latexScene],
});
