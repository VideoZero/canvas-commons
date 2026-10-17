import {makeProject} from '@canvas-commons/core';

import entranceWarningScene from '../scenes/entrance-warning?scene';

export default makeProject({
  name: 'entrance-warning',
  experimentalFeatures: true,
  scenes: [entranceWarningScene],
});
