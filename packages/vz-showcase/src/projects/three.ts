import {makeProject} from '@canvas-commons/core';

import threeScene from '../scenes/three?scene';
import viewChainScene from '../scenes/view-chain?scene';

export default makeProject({
  name: 'three',
  experimentalFeatures: true,
  scenes: [viewChainScene, threeScene],
});
