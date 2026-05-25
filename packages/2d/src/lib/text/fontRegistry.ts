/**
 * Registry of semantic font names → CSS font-family strings.
 *
 * Engine/app code seeds this map (e.g. `warmPlayful` → `'"Fraunces", serif'`),
 * scenes then reference fonts by their semantic name:
 *   <Txt fontFamily="warmPlayful" /> resolves to <Txt fontFamily='"Fraunces", serif' />
 *
 * The registry is mutated in place (not replaced) so existing references stay
 * live. Use `Txt.fonts = {...}` to bulk-assign — that helper does the right
 * thing by merging into this same object.
 */
export const fontRegistry: Record<string, string> = {};

const CSS_GENERIC_FAMILIES = new Set([
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

const warnedKeys = new Set<string>();

/**
 * Resolve a fontFamily value to an actual CSS font-family string.
 *
 * Order:
 *   1. Exact match in `fontRegistry` → use that string
 *   2. Contains comma / paren / starts with quote → literal (font stack)
 *   3. CSS generic keyword → literal
 *   4. First character is uppercase → literal (e.g. "Arial", "Times New Roman")
 *   5. Otherwise → warn once and pass through (likely a typo'd semantic name)
 */
export function resolveFontFamily(name: string | null | undefined): string {
  if (!name) return '';
  if (Object.prototype.hasOwnProperty.call(fontRegistry, name)) {
    return fontRegistry[name];
  }
  if (
    name.includes(',') ||
    name.includes('(') ||
    name.startsWith('"') ||
    name.startsWith("'")
  ) {
    return name;
  }
  if (CSS_GENERIC_FAMILIES.has(name)) return name;
  const first = name.charAt(0);
  if (first >= 'A' && first <= 'Z') return quoteIfMultiWord(name);
  if (!warnedKeys.has(name)) {
    warnedKeys.add(name);
    // eslint-disable-next-line no-console
    console.warn(
      `[motion-canvas] fontFamily "${name}" not in Txt.fonts registry — ` +
        `passing through as a literal. Did you mean one of: ` +
        `${Object.keys(fontRegistry).join(', ') || '(registry empty)'}?`,
    );
  }
  return quoteIfMultiWord(name);
}

// CSS treats `Noto Sans SC` as three families separated by whitespace. Quote
// multi-word family names so the browser sees one family. Single-word names
// pass through unchanged (matches existing behaviour).
function quoteIfMultiWord(name: string): string {
  return name.includes(' ') ? `"${name}"` : name;
}
