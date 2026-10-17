import {makeProject} from '@canvas-commons/core';

import resourceCacheScene from '../scenes/resource-cache?scene';

export default makeProject({
  name: 'resource-cache',
  experimentalFeatures: true,
  scenes: [resourceCacheScene],
});
