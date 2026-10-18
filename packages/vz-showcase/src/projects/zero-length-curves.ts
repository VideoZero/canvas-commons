import {makeProject} from '@canvas-commons/core';

import zeroLengthCurvesScene from '../scenes/zero-length-curves?scene';

export default makeProject({
  name: 'zero-length-curves',
  experimentalFeatures: true,
  scenes: [zeroLengthCurvesScene],
});
