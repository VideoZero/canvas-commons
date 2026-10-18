import {makeProject} from '@canvas-commons/core';

import d3GeoScene from '../scenes/d3-geo?scene';

export default makeProject({
  name: 'd3-geo',
  experimentalFeatures: true,
  scenes: [d3GeoScene],
});
