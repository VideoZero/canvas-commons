import {useLogger} from '@canvas-commons/core';

/**
 * The font stack VideoZero used when no `fontFamily` is set.
 */
export const VideoZeroFontFamily = 'Inter, system-ui, sans-serif';

/**
 * The semantic font names `AnimTxt` resolves, see `AnimTxt.fonts`.
 */
export const videoZeroFonts: Record<string, string> = {};

const GenericFamilies = new Set([
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

const Warned = new Set<string>();

/** CSS reads `Noto Sans SC` as three families: quote multi-word names. */
function quoteIfMultiWord(name: string): string {
  return name.includes(' ') ? `"${name}"` : name;
}

/**
 * Resolve a `fontFamily` the way VideoZero's `Txt.fonts` registry did.
 *
 * @remarks
 * In order:
 * 1. a name in {@link videoZeroFonts} (`AnimTxt.fonts`) gives its stack,
 * 2. a stack (containing `,` or `(`, or starting with a quote) is kept,
 * 3. a CSS generic family (`serif`, `system-ui`, ...) is kept,
 * 4. a capitalized family name (`Arial`, `Times New Roman`) is kept, quoted
 *    when it has several words,
 * 5. anything else is most likely a mistyped semantic name: it warns once per
 *    name and is kept, quoted when it has several words.
 *
 * @example
 * ```ts
 * AnimTxt.fonts.warmPlayful = '"Fraunces", serif';
 * resolveVideoZeroFontFamily('warmPlayful'); // '"Fraunces", serif'
 * resolveVideoZeroFontFamily('Noto Sans SC'); // '"Noto Sans SC"'
 * ```
 *
 * @param name - The `fontFamily` as written.
 */
export function resolveVideoZeroFontFamily(name: string): string {
  if (!name) return name;
  if (Object.prototype.hasOwnProperty.call(videoZeroFonts, name)) {
    return videoZeroFonts[name];
  }
  if (
    name.includes(',') ||
    name.includes('(') ||
    name.startsWith('"') ||
    name.startsWith("'")
  ) {
    return name;
  }
  if (GenericFamilies.has(name)) return name;
  const first = name.charAt(0);
  if (first >= 'A' && first <= 'Z') return quoteIfMultiWord(name);
  if (!Warned.has(name)) {
    Warned.add(name);
    const known = Object.keys(videoZeroFonts).join(', ') || '(none registered)';
    useLogger().warn(
      `fontFamily "${name}" is not in AnimTxt.fonts, so it is used as a ` +
        `font name. Registered names: ${known}.`,
    );
  }
  return quoteIfMultiWord(name);
}
