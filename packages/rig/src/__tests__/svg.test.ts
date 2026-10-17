import {describe, expect, test} from 'vitest';
import {detectTemplate} from '../extract';
import {BIPED, QUADRUPED} from '../gaits';
import {parseCharacterSvg, syntheticChar} from '../svg';

const Character = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 300">
  <defs><linearGradient id="skin"/></defs>
  <g id="body" data-rig-part="root">
    <g id="arm" data-rig-part="leftUpperArm" data-parent="torso"
       data-pivot-ref="leftShoulder" data-end-ref="leftElbow">
      <rect width="10" height="40" fill="url(#skin)"/>
    </g>
  </g>
  <circle id="rp-shoulder" data-reference-point="leftShoulder" cx="80" cy="100"/>
  <circle id="rp-elbow" data-reference-point="leftElbow" cx="70" cy="150"/>
</svg>`;

describe('parseCharacterSvg', () => {
  test('parses the viewBox and reference points', () => {
    const character = parseCharacterSvg(Character);
    expect(character.viewBox).toEqual([0, 0, 200, 300]);
    expect(character.referencePoints.leftShoulder.id).toBe('rp-shoulder');
    expect(character.referencePoints.leftElbow.pos.x).toBe(70);
    expect(character.referencePoints.leftElbow.pos.y).toBe(150);
  });

  test('slices rig parts with their shared definitions', () => {
    const character = parseCharacterSvg(Character);
    expect(Object.keys(character.parts)).toEqual(['leftUpperArm']);
    const arm = character.parts.leftUpperArm;
    expect(arm.pivotRef).toBe('leftShoulder');
    expect(arm.endRef).toBe('leftElbow');
    expect(arm.parent).toBe('torso');
    expect(arm.groupSvg).toContain('viewBox="0 0 200 300"');
    expect(arm.groupSvg).toContain('linearGradient');
    expect(Object.keys(character.layers).sort()).toEqual(['arm', 'body']);
  });

  test('falls back to the default viewBox', () => {
    const character = parseCharacterSvg(
      '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
    );
    expect(character.viewBox).toEqual([0, 0, 100, 100]);
  });
});

describe('detectTemplate', () => {
  test('detects bipeds and quadrupeds from their roles', () => {
    const viewBox: [number, number, number, number] = [0, 0, 1, 1];
    expect(
      detectTemplate(
        syntheticChar(
          {leftHip: [0, 0], rightHip: [0, 0], leftShoulder: [0, 0]},
          viewBox,
        ),
      ),
    ).toBe(BIPED);
    expect(
      detectTemplate(
        syntheticChar(
          {hipCenter: [0, 0], frontLeftHip: [0, 0], backRightHip: [0, 0]},
          viewBox,
        ),
      ),
    ).toBe(QUADRUPED);
    expect(detectTemplate(syntheticChar({p0: [0, 0]}, viewBox))).toBe(
      undefined,
    );
  });
});
