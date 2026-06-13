import {parseCharacterSvg, type ParsedCharacter} from './svg';
import {BIPED, QUADRUPED} from './gaits';
import {Rig, type RigOptions, type SkeletonTemplate} from './skeleton';

/**
 * Guess a built-in skeleton template from the reference points a character
 * defines. Returns `undefined` if nothing fits (pass a template explicitly).
 */
export function detectTemplate(char: ParsedCharacter): SkeletonTemplate | undefined {
  const has = (r: string) => r in char.referencePoints;
  if (has('hipCenter') && has('frontLeftHip') && has('backRightHip')) return QUADRUPED;
  if (has('leftHip') && has('rightHip') && has('leftShoulder')) return BIPED;
  return undefined;
}

export interface RigFromSvgOptions extends RigOptions {
  /** Skeleton template. Omit to auto-detect biped vs quadruped from the roles. */
  template?: SkeletonTemplate;
}

/**
 * Extract a ready-to-pose {@link Rig} straight from an annotated SVG string —
 * parse + build in one call. Omit `template` to auto-detect biped vs quadruped
 * from the reference-point roles ({@link detectTemplate}).
 *
 * ```ts
 * const dog = rigFromSvg(DOG_SVG, {render: 'svg', renderParts}); // template auto-detected
 * bindPose(dog, clock, quadruped.walk(dog, {groundY: -110, startX: -130}));
 * ```
 */
export function rigFromSvg(svg: string, opts: RigFromSvgOptions = {}): Rig {
  const char = parseCharacterSvg(svg);
  const tpl = opts.template ?? detectTemplate(char);
  if (!tpl) {
    throw new Error(
      'rigFromSvg: could not auto-detect a skeleton template from the SVG; pass {template} explicitly.',
    );
  }
  return new Rig(char, tpl, opts);
}
