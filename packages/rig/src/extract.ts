import {BIPED, QUADRUPED} from './gaits';
import {Rig, type RigOptions, type SkeletonTemplate} from './skeleton';
import {parseCharacterSvg, type ParsedCharacter} from './svg';

/**
 * Guess a built-in skeleton template from the reference points of a
 * character.
 *
 * @example
 * ```ts
 * const template = detectTemplate(parseCharacterSvg(dogSvg)); // QUADRUPED
 * ```
 *
 * @param char - The parsed character.
 *
 * @returns The matching template, or `undefined` if none fits.
 */
export function detectTemplate(
  char: ParsedCharacter,
): SkeletonTemplate | undefined {
  const has = (role: string) => role in char.referencePoints;
  if (has('hipCenter') && has('frontLeftHip') && has('backRightHip')) {
    return QUADRUPED;
  }
  if (has('leftHip') && has('rightHip') && has('leftShoulder')) {
    return BIPED;
  }
  return undefined;
}

export interface RigFromSvgOptions extends RigOptions {
  /**
   * The skeleton template. Detected from the reference points when omitted.
   */
  template?: SkeletonTemplate;
}

/**
 * Parse an annotated SVG and build a {@link Rig} from it.
 *
 * @example
 * ```ts
 * const dog = rigFromSvg(dogSvg, {render: 'svg'});
 * view.add(dog.node);
 * bindPose(dog, clock, quadruped.walk(dog, {groundY: 200}));
 * ```
 *
 * @param svg - The SVG source.
 * @param options - The rig options.
 */
export function rigFromSvg(svg: string, options: RigFromSvgOptions = {}): Rig {
  const char = parseCharacterSvg(svg);
  const template = options.template ?? detectTemplate(char);
  if (!template) {
    throw new Error(
      'rigFromSvg: could not detect a skeleton template from the SVG; pass one with the `template` option.',
    );
  }
  return new Rig(char, template, options);
}
