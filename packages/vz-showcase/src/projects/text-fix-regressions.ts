import {makeProject} from '@canvas-commons/core';

import textFixRegressionsScene from '../scenes/text-fix-regressions?scene';

export default makeProject({
  name: 'text-fix-regressions',
  experimentalFeatures: true,
  scenes: [textFixRegressionsScene],
});
