import {makeProject} from '@canvas-commons/core';

import textAnimationsScene from '../scenes/text-animations?scene';

export default makeProject({
  name: 'text-animations',
  experimentalFeatures: true,
  scenes: [textAnimationsScene],
});
