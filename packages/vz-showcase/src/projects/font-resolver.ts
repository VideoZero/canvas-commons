import {makeProject} from '@canvas-commons/core';

import fontResolverScene from '../scenes/font-resolver?scene';

export default makeProject({
  name: 'font-resolver',
  experimentalFeatures: true,
  scenes: [fontResolverScene],
});
