import {makeProject} from '@canvas-commons/core';

import attributionScene from '../scenes/attribution?scene';
import audioScene from '../scenes/audio?scene';
import buildAnimationScene from '../scenes/build-animation?scene';
import cameraScene from '../scenes/camera?scene';
import cssGradientScene from '../scenes/css-gradient?scene';
import d3GeoScene from '../scenes/d3-geo?scene';
import easingsScene from '../scenes/easings?scene';
import echartsScene from '../scenes/echarts?scene';
import entranceWarningScene from '../scenes/entrance-warning?scene';
import ffmpegScene from '../scenes/ffmpeg?scene';
import fontResolverScene from '../scenes/font-resolver?scene';
import latexScene from '../scenes/latex?scene';
import layoutFlipFixesScene from '../scenes/layout-flip-fixes?scene';
import layoutReorderScene from '../scenes/layout-reorder?scene';
import lineAlignChildrenScene from '../scenes/line-align-children?scene';
import mediaScene from '../scenes/media?scene';
import resourceCacheScene from '../scenes/resource-cache?scene';
import rigScene from '../scenes/rig?scene';
import scenePlaybackScene from '../scenes/scene-playback?scene';
import scenesRecalculatedScene from '../scenes/scenes-recalculated?scene';
import shadersScene from '../scenes/shaders?scene';
import shikiScene from '../scenes/shiki?scene';
import svgRenderingScene from '../scenes/svg-rendering?scene';
import textAnimationsScene from '../scenes/text-animations?scene';
import textCenterScene from '../scenes/text-center?scene';
import textFixRegressionsScene from '../scenes/text-fix-regressions?scene';
import textWrapBalanceScene from '../scenes/text-wrap-balance?scene';
import threeScene from '../scenes/three?scene';
import transform3dScene from '../scenes/transform3d?scene';
import txtLineOverlapWarningScene from '../scenes/txt-line-overlap-warning?scene';
import viewChainScene from '../scenes/view-chain?scene';
import zeroLengthCurvesScene from '../scenes/zero-length-curves?scene';

export default makeProject({
  name: 'all',
  experimentalFeatures: true,
  scenes: [
    attributionScene,
    audioScene,
    buildAnimationScene,
    cameraScene,
    cssGradientScene,
    d3GeoScene,
    easingsScene,
    echartsScene,
    entranceWarningScene,
    ffmpegScene,
    fontResolverScene,
    latexScene,
    layoutFlipFixesScene,
    layoutReorderScene,
    lineAlignChildrenScene,
    mediaScene,
    resourceCacheScene,
    rigScene,
    scenePlaybackScene,
    scenesRecalculatedScene,
    shadersScene,
    shikiScene,
    svgRenderingScene,
    textAnimationsScene,
    textCenterScene,
    textFixRegressionsScene,
    textWrapBalanceScene,
    threeScene,
    transform3dScene,
    txtLineOverlapWarningScene,
    viewChainScene,
    zeroLengthCurvesScene,
  ],
});
