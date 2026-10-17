import {Color} from '@motion-canvas/core';
import type * as THREE from 'three';
import {ThreeModule} from './loader';

/**
 * Copy the RGB of a Motion Canvas colour onto a Three.js colour and return
 * its alpha.
 *
 * @remarks
 * `THREE.Color` has no alpha and rejects the 8-digit hex that `Color.hex()`
 * produces for translucent colours (leaving the old value in place), so the
 * channels are set directly and each caller decides what alpha means for
 * its property.
 *
 * @internal
 */
export function applyColor(
  three: ThreeModule,
  target: THREE.Color,
  color: Color,
): number {
  const [r, g, b, a] = color.gl();
  target.setRGB(r, g, b, three.SRGBColorSpace);
  return a;
}

/**
 * Perceptual brightness of a Motion Canvas colour, `0`–`1`: Rec. 709 luma
 * of its sRGB-encoded channels (alpha ignored).
 *
 * @internal
 */
export function colorLuma(color: Color): number {
  const [r, g, b] = color.gl();
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
