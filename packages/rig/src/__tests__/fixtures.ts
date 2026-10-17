import {syntheticChar} from '../svg';

export const StickFigure = syntheticChar(
  {
    root: [0, 0],
    neck: [0, -100],
    headCenter: [0, -130],
    leftShoulder: [-20, -95],
    leftElbow: [-30, -50],
    leftWrist: [-35, -5],
    rightShoulder: [20, -95],
    rightElbow: [30, -50],
    rightWrist: [35, -5],
    leftHip: [-12, 0],
    leftKnee: [-12, 60],
    leftAnkle: [-12, 120],
    leftToe: [8, 120],
    rightHip: [12, 0],
    rightKnee: [12, 60],
    rightAnkle: [12, 120],
    rightToe: [32, 120],
  },
  [-100, -160, 200, 300],
);
