import {DependencyContext} from '@motion-canvas/core';
import {CSS_GENERIC_FAMILIES} from './fontRegistry';

/**
 * A font face that text uses but no stylesheet has declared.
 */
export interface FontFaceRequest {
  /** The family name, without quotes. */
  family: string;
  /** The CSS font weight, such as `400` or `'bold'`. */
  weight: number | string;
  /** The CSS font style, such as `'normal'` or `'italic'`. */
  style: string;
}

/**
 * Declare a font face that no stylesheet declared, by adding an `@font-face`
 * stylesheet or a `FontFace` to `document.fonts`.
 *
 * @remarks
 * The scene waits for a returned promise before drawing. A resolver that does
 * not know the family returns nothing. A rejected promise is ignored and the
 * text keeps its fallback font.
 */
export type FontResolver = (request: FontFaceRequest) => Promise<void> | void;

// The size does not affect which face loads, so keying without it requests
// each face once however many sizes use it.
const REQUEST_SIZE = '16px';
const RequestedFonts = new Set<string>();
// A font with an undeclared family is looked at again once more faces have
// been declared, since a stylesheet declaring it may still be on its way.
const UndeclaredFonts = new Map<string, number>();
const ResolvedFaces = new Map<string, Promise<void>>();
const Stylesheets = new Map<string, Promise<void>>();
let ActiveResolver: FontResolver | null = null;

/**
 * Set the callback that declares font families no stylesheet declared.
 *
 * @example
 * ```ts
 * setFontResolver(googleFontsResolver());
 * ```
 *
 * @param resolver - The resolver, or `null` to remove it.
 */
export function setFontResolver(resolver: FontResolver | null) {
  ActiveResolver = resolver;
  UndeclaredFonts.clear();
}

/**
 * Create a resolver that declares fonts from Google Fonts.
 *
 * @remarks
 * Each face is requested in the weight and style that text uses, falling back
 * to the regular face for a family that does not have them. A family that
 * Google Fonts does not serve, like a system font, costs one failed request
 * per face; pass `families` to request only the ones that it serves.
 *
 * @param options - The families to request; every undeclared family if omitted.
 */
export function googleFontsResolver(
  options: {families?: string[]} = {},
): FontResolver {
  return ({family, weight, style}) => {
    if (options.families && !options.families.includes(family)) return;

    const name = encodeURIComponent(family).replace(/%20/g, '+');
    const italic = style === 'normal' ? 0 : 1;
    const base = 'https://fonts.googleapis.com/css2?display=block&family=';
    return loadStylesheet(
      `${base}${name}:ital,wght@${italic},${cssWeight(weight)}`,
    ).catch(() => loadStylesheet(`${base}${name}`));
  };
}

/**
 * Request a web font face and let the scene wait for it.
 *
 * @remarks
 * Styling an element with a font does not fetch the face until the browser
 * lays out text with it, which can come after the frame was measured. Each
 * face is requested once; a pending load is collected like any other
 * asynchronous resource, so the scene waits for it before drawing. Families
 * that no stylesheet declared go to the {@link setFontResolver | resolver}
 * first. Failed loads keep the fallback metrics.
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
  if (UndeclaredFonts.get(font) === document.fonts.size) return;

  const undeclared = parseFamilies(family).filter(name => !isDeclared(name));
  if (undeclared.length > 0 && !ActiveResolver) {
    UndeclaredFonts.set(font, document.fonts.size);
  } else {
    UndeclaredFonts.delete(font);
    RequestedFonts.add(font);
  }

  const resolving = ActiveResolver
    ? undeclared.map(name => resolveFace({family: name, weight, style}))
    : [];

  if (resolving.length === 0) {
    try {
      if (document.fonts.check(font)) return;
    } catch {
      // An invalid shorthand; the browser ignores it as well.
      return;
    }
  }

  DependencyContext.collectPromise(
    Promise.all(resolving)
      // `load` resolves with no faces when none is declared, so it has to wait
      // for the resolvers to declare them.
      .then(() => document.fonts.load(font))
      .catch(() => {
        // The browser already reports the network/parse failure; fallback
        // metrics remain in effect.
      }),
  );
}

function resolveFace(request: FontFaceRequest): Promise<void> {
  const key = `${request.style} ${request.weight} ${request.family}`;
  let face = ResolvedFaces.get(key);
  if (!face) {
    face = Promise.resolve()
      .then(() => ActiveResolver?.(request))
      .catch(() => {
        // The text keeps its fallback font.
      });
    ResolvedFaces.set(key, face);
  }
  return face;
}

function parseFamilies(family: string): string[] {
  return family
    .split(',')
    .map(name => name.trim().replace(/^["']|["']$/g, ''))
    .filter(name => name.length > 0 && !CSS_GENERIC_FAMILIES.has(name));
}

function isDeclared(family: string): boolean {
  const name = family.toLowerCase();
  for (const face of document.fonts) {
    if (face.family.replace(/^["']|["']$/g, '').toLowerCase() === name) {
      return true;
    }
  }
  return false;
}

function cssWeight(weight: number | string): number {
  if (weight === 'bold') return 700;
  const value = typeof weight === 'number' ? weight : parseInt(weight);
  return Number.isFinite(value) ? value : 400;
}

function loadStylesheet(href: string): Promise<void> {
  let loading = Stylesheets.get(href);
  if (!loading) {
    loading = new Promise<void>((resolve, reject) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      link.onload = () => resolve();
      link.onerror = () => {
        link.remove();
        reject(new Error(`Failed to load the stylesheet ${href}`));
      };
      document.head.appendChild(link);
    });
    Stylesheets.set(href, loading);
  }
  return loading;
}
