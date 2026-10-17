import {DependencyContext, createSignal} from '@canvas-commons/core';
import {clearCache} from '@chenglou/pretext';

/**
 * A font face that text uses but no stylesheet has declared.
 */
export interface FontFaceRequest {
  /** The family name, without quotes. */
  family: string;
  /** The numeric CSS font weight, such as `400` or `700`. */
  weight: number;
  /** The CSS font style, such as `'normal'` or `'italic'`. */
  style: string;
}

/**
 * Declares a font face that no stylesheet declared, by adding an `@font-face`
 * stylesheet or a `FontFace` to `document.fonts`.
 *
 * @remarks
 * The scene waits for a returned promise before drawing. A resolver that does
 * not know the family returns nothing. A rejected promise is ignored and the
 * text keeps its fallback font.
 */
export type FontResolver = (request: FontFaceRequest) => Promise<void> | void;

/** Options of {@link googleFontsResolver}. */
export interface GoogleFontsResolverOptions {
  /** The only families to request; every undeclared family when omitted. */
  families?: string[];
  /**
   * The `css2` endpoint to request stylesheets from, for a proxy in front of
   * Google Fonts.
   *
   * @defaultValue `'https://fonts.googleapis.com/css2'`
   */
  baseUrl?: string;
}

const GENERIC_FAMILIES = new Set([
  'serif',
  'sans-serif',
  'monospace',
  'cursive',
  'fantasy',
  'system-ui',
  'ui-serif',
  'ui-sans-serif',
  'ui-monospace',
  'ui-rounded',
  'math',
  'emoji',
  'fangsong',
  'inherit',
  'initial',
  'unset',
  'revert',
]);

const FontsVersion = createSignal(0);
const RequestedFaces = new Set<string>();
// A face whose family nothing declared yet is looked at again once more faces
// are declared, since a stylesheet declaring it may still be on its way.
const UndeclaredFaces = new Map<string, number>();
const ResolvedFaces = new Map<string, Promise<void>>();
// The resolver declares only the faces in use, so a family it declared needs
// a face covering each weight and style it is drawn in.
const ResolverFamilies = new Set<string>();
const Stylesheets = new Map<string, Promise<void>>();
let ActiveResolver: FontResolver | null = null;

const CANVAS_FONT = /^(.*?)(?:^|\s)\d+(?:\.\d+)?px(?:\s*\/\s*\S+)?\s+(.+)$/;

/**
 * The face a canvas font shorthand names, without its size. An animated font
 * size walks through thousands of shorthands of one face, and the face is what
 * the browser loads.
 */
function faceOf(font: string): string {
  return font.replace(/(?:^|\s)\d+(?:\.\d+)?px(?:\s*\/\s*\S+)?\s/, ' ');
}

function invalidateMeasurements() {
  // Pretext caches measured widths per (segment, font) internally; widths
  // captured before the face loaded are fallback metrics and must go.
  clearCache();
  FontsVersion(FontsVersion() + 1);
}

if (typeof document !== 'undefined' && 'fonts' in document) {
  document.fonts.addEventListener('loadingdone', invalidateMeasurements);
}

/**
 * Reactive token for web font availability.
 *
 * @remarks
 * Canvas text measurement silently falls back to a substitute font until the
 * requested face finishes loading, and nothing in the signal graph observes
 * that load. Measurement computeds read this signal so a finished font load
 * invalidates their cached results.
 */
export function fontsVersion(): number {
  return FontsVersion();
}

/**
 * Set the callback that declares font families no stylesheet declared.
 *
 * @remarks
 * `document.fonts` only loads faces that are declared, so text in a family no
 * stylesheet declares is drawn in a fallback font. With a resolver, each such
 * family is passed to it in the weight and style the text uses, and the scene
 * waits for the face it declares.
 *
 * @example
 * ```ts
 * import {googleFontsResolver, setFontResolver} from '@canvas-commons/2d';
 *
 * setFontResolver(googleFontsResolver());
 * ```
 *
 * @param resolver - The resolver, or `null` to remove it.
 */
export function setFontResolver(resolver: FontResolver | null) {
  ActiveResolver = resolver;
  UndeclaredFaces.clear();
  ResolverFamilies.clear();
}

/**
 * Create a {@link FontResolver} that declares fonts from Google Fonts.
 *
 * @remarks
 * Each face is requested in the weight and style that text uses. A weight
 * between two hundreds is requested as the range between them, which a
 * variable font serves as one face for every weight in it, so animating the
 * weight does not load a face per frame. A family that does not have the range
 * falls back to the nearest hundred and then to the regular face. A family that
 * Google Fonts does not serve, like a system font, costs a few failed requests
 * per face; pass `families` to request only the ones that it serves.
 *
 * @example
 * ```ts
 * setFontResolver(googleFontsResolver({families: ['Inter', 'Fraunces']}));
 * ```
 *
 * @param options - The families to request and the endpoint to request them
 *   from.
 */
export function googleFontsResolver(
  options: GoogleFontsResolverOptions = {},
): FontResolver {
  const endpoint = options.baseUrl ?? 'https://fonts.googleapis.com/css2';
  return ({family, weight, style}) => {
    if (options.families && !options.families.includes(family)) return;

    const name = encodeURIComponent(family).replace(/%20/g, '+');
    const italic = style === 'normal' ? 0 : 1;
    const base = `${endpoint}?display=block&family=${name}`;
    // Google Fonts rejects fractional weights and ranges that reach past the
    // axis of the family, whose bounds are hundreds for its variable fonts.
    const value = Math.min(Math.max(weight, 1), 1000);
    const low = Math.max(Math.floor(value / 100) * 100, 100);
    const high = Math.min(Math.ceil(value / 100) * 100, 900);
    const nearest = Math.min(Math.max(Math.round(value / 100) * 100, 100), 900);
    const weights = low < high ? [`${low}..${high}`, nearest] : [nearest];
    const [first, ...fallbacks] = [
      ...weights.map(one => `${base}:ital,wght@${italic},${one}`),
      base,
    ];
    return fallbacks.reduce(
      (previous, href) => previous.catch(() => loadStylesheet(href)),
      loadStylesheet(first),
    );
  };
}

/**
 * Kick off loading for a canvas font shorthand (e.g. `'700 160px Inter'`).
 *
 * @remarks
 * Setting `ctx.font` does not trigger a web font fetch on its own. Each font
 * a text node measures with is requested here; when the load lands,
 * {@link fontsVersion} bumps and dependents re-measure with real metrics.
 * A pending load is collected like any other asynchronous resource, so the
 * scene waits for it before drawing. Families that no stylesheet declared go
 * to the {@link setFontResolver | font resolver} first. Failed loads keep the
 * fallback metrics.
 *
 * @example
 * ```ts
 * requestFontLoad('italic 700 48px "Fraunces", serif');
 * ```
 */
export function requestFontLoad(font: string) {
  if (typeof document === 'undefined' || !('fonts' in document)) return;
  const face = faceOf(font);
  if (RequestedFaces.has(face)) return;
  if (UndeclaredFaces.get(face) === document.fonts.size) return;

  const {families, weight, style} = parseCanvasFont(font);
  const undeclared = families.filter(
    family => !isDeclared(family, weight, style),
  );
  if (undeclared.length > 0 && !ActiveResolver) {
    UndeclaredFaces.set(face, document.fonts.size);
  } else {
    UndeclaredFaces.delete(face);
    RequestedFaces.add(face);
  }

  const resolving = ActiveResolver
    ? undeclared.map(family => resolveFace({family, weight, style}))
    : [];
  if (resolving.length === 0) {
    try {
      if (document.fonts.check(font)) return;
    } catch {
      // An invalid shorthand; the canvas ignores it as well.
      return;
    }
  }

  DependencyContext.collectPromise(
    Promise.all(resolving)
      // `load` resolves with no faces while none is declared, so it waits for
      // the resolver to declare them.
      .then(() => document.fonts.load(font))
      // `loadingdone` can fire after this promise settles, and the scene draws
      // as soon as it does.
      .then(invalidateMeasurements, () => {
        // The browser already reports the network/parse failure; fallback
        // metrics remain in effect.
      }),
  );
}

function resolveFace(request: FontFaceRequest): Promise<void> {
  ResolverFamilies.add(request.family.toLowerCase());
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

function parseCanvasFont(font: string): {
  families: string[];
  weight: number;
  style: string;
} {
  const match = font.match(CANVAS_FONT);
  const prefix = match ? match[1].trim().split(/\s+/) : [];
  const style =
    prefix.find(token => token === 'italic' || token === 'oblique') ?? 'normal';
  const weight = cssWeight(
    prefix.find(token => /^(\d+(\.\d+)?|bold|bolder|lighter)$/.test(token)) ??
      'normal',
  );
  const families = (match ? match[2] : '')
    .split(',')
    .map(name => unquote(name.trim()))
    .filter(name => name.length > 0 && !GENERIC_FAMILIES.has(name));
  return {families, weight, style};
}

function unquote(name: string): string {
  return name.replace(/^["']|["']$/g, '');
}

function isDeclared(family: string, weight: number, style: string): boolean {
  const name = family.toLowerCase();
  const needsFace = ResolverFamilies.has(name);
  for (const face of document.fonts) {
    if (
      unquote(face.family).toLowerCase() === name &&
      (!needsFace || coversFace(face, weight, style))
    ) {
      return true;
    }
  }
  return false;
}

function coversFace(face: FontFace, weight: number, style: string): boolean {
  if ((face.style === 'normal') !== (style === 'normal')) return false;
  const bounds = face.weight.split(/\s+/).map(cssWeight);
  return bounds[0] <= weight && weight <= bounds[bounds.length - 1];
}

function cssWeight(weight: string): number {
  if (weight === 'bold' || weight === 'bolder') return 700;
  if (weight === 'lighter') return 300;
  const value = parseFloat(weight);
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
