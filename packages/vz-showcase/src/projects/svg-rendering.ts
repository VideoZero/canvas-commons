import {makeProject} from '@canvas-commons/core';

import svgRenderingScene from '../scenes/svg-rendering?scene';

export default makeProject({
  name: 'svg-rendering',
  experimentalFeatures: true,
  scenes: [svgRenderingScene],
});
