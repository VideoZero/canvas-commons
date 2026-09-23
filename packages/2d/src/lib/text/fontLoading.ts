import {DependencyContext} from '@motion-canvas/core';

// The size does not affect which face loads, so keying without it requests
// each face once however many sizes use it.
const REQUEST_SIZE = '16px';
const RequestedFonts = new Set<string>();

/**
 * Request a web font face and let the scene wait for it.
 *
 * @remarks
 * Styling an element with a font does not fetch the face until the browser
 * lays out text with it, which can come after the frame was measured. Each
 * face is requested once; a pending load is collected like any other
 * asynchronous resource, so the scene waits for it before drawing. Failed
 * loads keep the fallback metrics.
 *
 * Adapted from canvas-commons 56a26185.
 *
 * @param family - A resolved CSS font family list.
 * @param weight - The CSS font weight.
 * @param style - The CSS font style.
 */
export function requestFontLoad(
  family: string,
  weight: number | string,
  style: string,
) {
  if (!family || typeof document === 'undefined' || !document.fonts) return;

  const font = `${style} ${weight} ${REQUEST_SIZE} ${family}`;
  if (RequestedFonts.has(font)) return;
  RequestedFonts.add(font);

  try {
    if (document.fonts.check(font)) return;
  } catch {
    // An invalid shorthand; the browser ignores it as well.
    return;
  }

  DependencyContext.collectPromise(
    document.fonts.load(font).catch(() => {
      // The browser already reports the network/parse failure; fallback
      // metrics remain in effect.
    }),
  );
}
