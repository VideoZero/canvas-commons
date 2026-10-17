import {makeProject} from '@canvas-commons/core';

import textCenterScene from '../scenes/text-center?scene';

export default makeProject({
  name: 'text-center',
  experimentalFeatures: true,
  scenes: [textCenterScene],
});
