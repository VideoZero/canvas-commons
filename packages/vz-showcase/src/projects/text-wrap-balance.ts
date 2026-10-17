import {makeProject} from '@canvas-commons/core';

import textWrapBalanceScene from '../scenes/text-wrap-balance?scene';

export default makeProject({
  name: 'text-wrap-balance',
  experimentalFeatures: true,
  scenes: [textWrapBalanceScene],
});
