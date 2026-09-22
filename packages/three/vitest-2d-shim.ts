/**
 * Test-only stand-in for '@motion-canvas/2d'.
 *
 * @remarks
 * The full 2d index has a circular import through `Code.ts` that breaks
 * when the module graph is entered from this package under vitest. The
 * shim re-exports just the modules the 3D nodes use, skipping the cycle.
 */
export * from '../2d/src/lib/components/Layout';
export * from '../2d/src/lib/components/Node';
export * from '../2d/src/lib/components/Rect';
export * from '../2d/src/lib/components/Shape';
export * from '../2d/src/lib/components/View2D';
export * from '../2d/src/lib/decorators';
