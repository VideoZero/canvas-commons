import {makeProject} from '@canvas-commons/core';

import audioScene from '../scenes/audio?scene';

export default makeProject({
  name: 'audio',
  experimentalFeatures: true,
  scenes: [audioScene],
});
