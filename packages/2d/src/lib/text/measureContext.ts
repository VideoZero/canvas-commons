/**
 * A shared, offscreen 2D context for measuring text.
 *
 * @remarks
 * Returns `null` where canvas is unsupported (e.g. jsdom). A failed attempt
 * is not remembered, so environments that gain canvas support later (tests
 * that mock `getContext`) are picked up on the next call.
 */
let context: CanvasRenderingContext2D | null = null;

export function getMeasureContext(): CanvasRenderingContext2D | null {
  if (!context && typeof document !== 'undefined') {
    try {
      context = document.createElement('canvas').getContext('2d');
    } catch {
      context = null;
    }
  }
  return context;
}

/**
 * Set `context.font`, reporting whether the browser accepted it.
 *
 * @remarks
 * Assigning an unparseable font is silently ignored and leaves the previous
 * font in place, which would make measurements use the wrong font.
 */
export function trySetFont(
  context: CanvasRenderingContext2D,
  font: string,
): boolean {
  const sentinel = '1px serif';
  context.font = sentinel;
  const before = context.font;
  context.font = font;
  return context.font !== before || font.replace(/\s+/g, ' ') === sentinel;
}
