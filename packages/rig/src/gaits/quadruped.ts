import type {SkeletonTemplate} from '../skeleton/types';

/**
 * A four-legged skeleton: pelvis root, spine to chest, neck and head, tail,
 * and four legs. Toes and ears are optional.
 *
 * @example
 * ```ts
 * const rig = new Rig(parseCharacterSvg(dogSvg), QUADRUPED);
 * ```
 */
export const QUADRUPED: SkeletonTemplate = {
  id: 'quadruped',
  root: 'hipCenter',
  parents: {
    hipCenter: null,
    chest: 'hipCenter',
    neck: 'chest',
    headCenter: 'neck',
    tail: 'hipCenter',
    frontLeftHip: 'chest',
    frontLeftKnee: 'frontLeftHip',
    frontLeftAnkle: 'frontLeftKnee',
    frontRightHip: 'chest',
    frontRightKnee: 'frontRightHip',
    frontRightAnkle: 'frontRightKnee',
    backLeftHip: 'hipCenter',
    backLeftKnee: 'backLeftHip',
    backLeftAnkle: 'backLeftKnee',
    backRightHip: 'hipCenter',
    backRightKnee: 'backRightHip',
    backRightAnkle: 'backRightKnee',
    // Optional flat feet — present only if the character defines toe points.
    frontLeftToe: 'frontLeftAnkle',
    frontRightToe: 'frontRightAnkle',
    backLeftToe: 'backLeftAnkle',
    backRightToe: 'backRightAnkle',
    // Optional decorations — present only if the character defines them.
    leftEarBase: 'headCenter',
    leftEarTip: 'leftEarBase',
    rightEarBase: 'headCenter',
    rightEarTip: 'rightEarBase',
  },
  bones: [
    {name: 'spine', pivot: 'hipCenter', end: 'chest', kind: 'line', width: 10},
    {name: 'neck', pivot: 'chest', end: 'neck', kind: 'line', width: 8},
    {
      name: 'head',
      pivot: 'neck',
      end: 'headCenter',
      kind: 'circle',
      radius: 22,
    },
    {name: 'tail', pivot: 'hipCenter', end: 'tail', kind: 'line', width: 6},
    {
      name: 'leftEar',
      pivot: 'leftEarBase',
      end: 'leftEarTip',
      kind: 'line',
      width: 5,
    },
    {
      name: 'rightEar',
      pivot: 'rightEarBase',
      end: 'rightEarTip',
      kind: 'line',
      width: 5,
    },
    {
      name: 'flUpper',
      pivot: 'frontLeftHip',
      end: 'frontLeftKnee',
      kind: 'line',
      width: 7,
    },
    {
      name: 'flLower',
      pivot: 'frontLeftKnee',
      end: 'frontLeftAnkle',
      kind: 'line',
      width: 7,
    },
    {
      name: 'frUpper',
      pivot: 'frontRightHip',
      end: 'frontRightKnee',
      kind: 'line',
      width: 7,
    },
    {
      name: 'frLower',
      pivot: 'frontRightKnee',
      end: 'frontRightAnkle',
      kind: 'line',
      width: 7,
    },
    {
      name: 'blUpper',
      pivot: 'backLeftHip',
      end: 'backLeftKnee',
      kind: 'line',
      width: 7,
    },
    {
      name: 'blLower',
      pivot: 'backLeftKnee',
      end: 'backLeftAnkle',
      kind: 'line',
      width: 7,
    },
    {
      name: 'brUpper',
      pivot: 'backRightHip',
      end: 'backRightKnee',
      kind: 'line',
      width: 7,
    },
    {
      name: 'brLower',
      pivot: 'backRightKnee',
      end: 'backRightAnkle',
      kind: 'line',
      width: 7,
    },
    {
      name: 'flFoot',
      pivot: 'frontLeftAnkle',
      end: 'frontLeftToe',
      kind: 'line',
      width: 7,
    },
    {
      name: 'frFoot',
      pivot: 'frontRightAnkle',
      end: 'frontRightToe',
      kind: 'line',
      width: 7,
    },
    {
      name: 'blFoot',
      pivot: 'backLeftAnkle',
      end: 'backLeftToe',
      kind: 'line',
      width: 7,
    },
    {
      name: 'brFoot',
      pivot: 'backRightAnkle',
      end: 'backRightToe',
      kind: 'line',
      width: 7,
    },
  ],
  chains: [
    {
      name: 'legFL',
      joints: ['frontLeftHip', 'frontLeftKnee', 'frontLeftAnkle'],
    },
    {
      name: 'legFR',
      joints: ['frontRightHip', 'frontRightKnee', 'frontRightAnkle'],
    },
    {name: 'legBL', joints: ['backLeftHip', 'backLeftKnee', 'backLeftAnkle']},
    {
      name: 'legBR',
      joints: ['backRightHip', 'backRightKnee', 'backRightAnkle'],
    },
  ],
};
