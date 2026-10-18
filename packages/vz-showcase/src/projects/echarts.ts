import {makeProject} from '@canvas-commons/core';

import echartsScene from '../scenes/echarts?scene';

export default makeProject({
  name: 'echarts',
  experimentalFeatures: true,
  scenes: [echartsScene],
});
