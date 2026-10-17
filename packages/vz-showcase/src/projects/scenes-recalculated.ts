import {makeProject} from '@canvas-commons/core';

import scenesRecalculatedScene from '../scenes/scenes-recalculated?scene';

export default makeProject({
  name: 'scenes-recalculated',
  experimentalFeatures: true,
  scenes: [scenesRecalculatedScene],
});
