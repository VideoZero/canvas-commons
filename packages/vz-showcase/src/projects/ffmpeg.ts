import {makeProject} from '@canvas-commons/core';

import ffmpegScene from '../scenes/ffmpeg?scene';

export default makeProject({
  name: 'ffmpeg',
  experimentalFeatures: true,
  scenes: [ffmpegScene],
});
