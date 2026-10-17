import {afterAll, beforeAll} from 'vitest';

/** The context state a measurement depends on. */
export type TextState = {font: string; letterSpacing: string};

/**
 * Install a deterministic fake 2D context for the suite, like
 * `mockTextContext` in the 2d package: glyph widths come from `charWidth` and
 * the paint calls are no-ops.
 *
 * @remarks
 * Text measurements are cached across suites of one file, so use one
 * `charWidth` per test file.
 *
 * @param charWidth - Width reported per character, or a function measuring a
 *                    whole string in the given state.
 */
export function mockTextContext(
  charWidth: number | ((text: string, state: TextState) => number) = 10,
): void {
  const measure =
    typeof charWidth === 'number'
      ? (text: string) => text.length * charWidth
      : charWidth;
  let original: typeof HTMLCanvasElement.prototype.getContext;
  beforeAll(() => {
    original = HTMLCanvasElement.prototype.getContext;
    const build = () => {
      const context = {
        font: '',
        letterSpacing: '0px',
        direction: 'inherit' as CanvasDirection,
        textBaseline: 'alphabetic' as CanvasTextBaseline,
        fillStyle: '',
        strokeStyle: '',
        lineWidth: 1,
        lineCap: 'butt' as CanvasLineCap,
        lineJoin: 'miter' as CanvasLineJoin,
        lineDashOffset: 0,
        canvas: {width: 0, height: 0},
        save() {},
        restore() {},
        setLineDash() {},
        setTransform() {},
        transform() {},
        translate() {},
        rotate() {},
        drawImage() {},
        measureText(text: string) {
          return {
            width: measure(text, {
              font: context.font,
              letterSpacing: context.letterSpacing,
            }),
          } as TextMetrics;
        },
        fillText() {},
        strokeText() {},
      };
      return context;
    };
    const contexts = new WeakMap<HTMLCanvasElement, ReturnType<typeof build>>();
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      kind: string,
    ) {
      if (kind !== '2d') return null;
      let context = contexts.get(this);
      if (!context) {
        context = build();
        contexts.set(this, context);
      }
      return context;
    } as typeof HTMLCanvasElement.prototype.getContext;
  });
  afterAll(() => {
    HTMLCanvasElement.prototype.getContext = original;
  });
}
