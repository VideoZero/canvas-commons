import {makeProject} from '@canvas-commons/core';

import cssGradientScene from '../scenes/css-gradient?scene';
import svgRenderingScene from '../scenes/svg-rendering?scene';

export default makeProject({
  name: 'css-gradient',
  experimentalFeatures: true,
  scenes: [svgRenderingScene, cssGradientScene],
});
