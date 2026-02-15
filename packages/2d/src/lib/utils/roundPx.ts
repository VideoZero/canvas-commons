const ROUND_PX_FACTOR = 2;

/**
 * Round a pixel value to avoid sub-pixel jitter from getBoundingClientRect().
 */
export const roundPx = (n: number) =>
  Math.round(n * ROUND_PX_FACTOR) / ROUND_PX_FACTOR;
