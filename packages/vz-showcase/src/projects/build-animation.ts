import {makeProject} from '@canvas-commons/core';

import buildAnimationScene from '../scenes/build-animation?scene';
import svgRenderingScene from '../scenes/svg-rendering?scene';
import zeroLengthCurvesScene from '../scenes/zero-length-curves?scene';

export default makeProject({
  name: 'build-animation',
  experimentalFeatures: true,
  scenes: [zeroLengthCurvesScene, svgRenderingScene, buildAnimationScene],
});
