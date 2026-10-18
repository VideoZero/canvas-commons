import {describe, expect, it} from 'vitest';
import type {PlacedLine} from '../../text';
import {Rect} from '../Rect';
import {Txt} from '../Txt';
import {failOnSceneErrors} from './failOnSceneErrors';
import {mockScene2D} from './mockScene2D';
import type {TextState} from './mockTextContext';
import {mockTextContext} from './mockTextContext';
import {add, lineTexts} from './sceneFixtures';

/** Exposes the lines as aligned in the node's own box. */
class Probe extends Txt {
  public placedLines(): readonly PlacedLine[] {
    return this.positionedLines();
  }
}

/** Uneven, fractional glyph widths, so break thresholds fall between pixels. */
function glyphWidth(char: string): number {
  return 6 + (((char.codePointAt(0) ?? 0) * 7919) % 97) * 0.0837;
}

/**
 * In the `narrow` font, spaces and `i` are narrow, so `aaaaaaaa i` is barely
 * wider than its first word.
 */
function narrowGlyph(char: string): number {
  return char === ' ' || char === 'i' ? 0.15 : 10;
}

function measure(value: string, state: TextState): number {
  const glyph = state.font.includes('narrow') ? narrowGlyph : glyphWidth;
  return [...value].reduce((sum, char) => sum + glyph(char), 0);
}

const HEADING =
  'Balanced wrapping keeps the lines of a heading about the same width';

function lines(txt: Txt): string {
  return lineTexts(txt)
    .map(line => line.trim())
    .join(' / ');
}

/** Sweep the box width in 1px steps, the way an animated width does. */
function sweep(from: number, to: number, visit: (width: number) => void) {
  const step = from < to ? 1 : -1;
  for (let width = from; step > 0 ? width <= to : width >= to; width += step) {
    visit(width);
  }
}

describe("textWrap 'balance' width sweep", () => {
  mockScene2D();
  failOnSceneErrors();
  mockTextContext(measure);

  it('keeps one set of breaks for each line count', () => {
    const greedy = new Txt({text: HEADING, fontSize: 16, lineHeight: 20});
    const balanced = new Txt({
      text: HEADING,
      fontSize: 16,
      lineHeight: 20,
      textWrap: 'balance',
    });
    add(greedy);
    add(balanced);

    const byCount = new Map<number, string>();
    const counts = new Set<number>();
    let previous: {count: number; breaks: string} | null = null;
    const check = (width: number) => {
      greedy.width(width);
      balanced.width(width);
      const count = greedy.lineCount();
      counts.add(count);
      const breaks = lines(balanced);
      expect(balanced.lineCount(), `lines at ${width}px`).toBe(count);
      const expected = byCount.get(count) ?? breaks;
      byCount.set(count, expected);
      expect(breaks, `breaks at ${width}px`).toBe(expected);
      if (previous && previous.count === count) {
        expect(breaks, `breaks at ${width}px`).toBe(previous.breaks);
      }
      previous = {count, breaks};
    };

    sweep(120, 560, check);
    sweep(560, 120, check);
    expect(counts.size).toBeGreaterThanOrEqual(4);
  });

  it.each(['center', 'end'] as const)(
    'aligns the balanced block in the box (%s)',
    textAlign => {
      const node = new Probe({
        text: HEADING,
        fontSize: 16,
        lineHeight: 20,
        textWrap: 'balance',
        textAlign,
      });
      add(node);

      sweep(200, 420, width => {
        node.width(width);
        const factor = textAlign === 'center' ? 0.5 : 1;
        for (const line of node.placedLines()) {
          const ink = line.pieces
            .filter(piece => !piece.hanging)
            .reduce(
              (right, piece) => Math.max(right, piece.x + piece.advance),
              line.left,
            );
          expect(line.left, `${textAlign} at ${width}px`).toBeCloseTo(
            (width - (ink - line.left)) * factor,
            6,
          );
        }
      });
    },
  );

  it('sizes an auto-width box to the breaks of its line count', () => {
    const node = new Txt({
      text: HEADING,
      fontSize: 16,
      lineHeight: 20,
      textWrap: 'balance',
    });
    const box = new Rect({layout: true, children: node});
    add(box);

    const byCount = new Map<number, number>();
    sweep(160, 520, width => {
      box.width(width);
      const count = node.lineCount();
      const size = node.size().x;
      expect(size, `width at ${width}px`).toBeLessThanOrEqual(width + 1e-6);
      const expected = byCount.get(count) ?? size;
      byCount.set(count, expected);
      expect(size, `width at ${width}px`).toBeCloseTo(expected, 6);
    });
    expect(byCount.size).toBeGreaterThanOrEqual(3);
  });
});

describe("textWrap 'balance' near a break threshold", () => {
  mockScene2D();
  failOnSceneErrors();
  mockTextContext(measure);

  // Three lines from 80px up; `aaaaaaaa i` fits on the first line from 80.3px.
  const CLOSE = 'aaaaaaaa i bbbbbbb cccccccc';

  it('breaks at the narrowest width whatever the box width', () => {
    const node = new Txt({
      text: CLOSE,
      fontFamily: 'narrow',
      fontSize: 16,
      lineHeight: 20,
      textWrap: 'balance',
    });
    add(node);

    for (let width = 81; width <= 150; width += 0.25) {
      node.width(width);
      expect(lines(node), `breaks at ${width}px`).toBe(
        'aaaaaaaa / i bbbbbbb / cccccccc',
      );
    }
  });
});
