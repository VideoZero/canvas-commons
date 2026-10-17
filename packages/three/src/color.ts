import {Color} from '@canvas-commons/core';
import type * as THREE from 'three';
import {ThreeModule} from './loader';

/**
 * Copy the RGB of a Canvas Commons colour onto a Three.js colour and return
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
