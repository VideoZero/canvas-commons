import {makeProject} from '@canvas-commons/core';

import viewChainScene from '../scenes/view-chain?scene';

export default makeProject({
  name: 'view-chain',
  experimentalFeatures: true,
  scenes: [viewChainScene],
});
