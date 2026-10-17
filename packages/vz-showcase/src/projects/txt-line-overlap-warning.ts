import {makeProject} from '@canvas-commons/core';

import txtLineOverlapWarningScene from '../scenes/txt-line-overlap-warning?scene';

export default makeProject({
  name: 'txt-line-overlap-warning',
  experimentalFeatures: true,
  scenes: [txtLineOverlapWarningScene],
});
