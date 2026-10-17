import {BBox, SignalValue, Vector2} from '@canvas-commons/core';
import {Layout} from '../components/Layout';
import {Node} from '../components/Node';
import {TextUnit, Txt, TxtSplitGranularity} from '../components/Txt';
import {useScene2D} from '../scenes/useScene2D';

/**
 * Options for {@link splitText}.
 */
export interface SplitTextOptions {
  /**
   * How to cut the text, see {@link Txt.split}. Defaults to `'grapheme'`.
   */
  by?: TxtSplitGranularity;
  /**
   * Mask every line to its own line box, so pieces moved off their line are
   * hidden. Used for reveal animations.
   */
  clip?: boolean;
  /**
   * How far, in pixels, the mask of a clipped line reaches past its line box
   * on every side, so glyph ink outside the box is not cut. Defaults to `4`.
   */
  clipPadding?: number;
}

/** Draws the pieces with the transform the source is drawn with. */
class SplitContainer extends Node {
  public constructor(private readonly source: Txt) {
    super({});
  }

  public override localToParent(): DOMMatrix {
    const world = this.source.localToWorld();
    return this.parent()?.worldToLocal().multiply(world) ?? world;
  }
}

/**
 * A {@link Txt} split into standalone pieces that are drawn in its place.
 *
 * @remarks
 * Created by {@link splitText}. While the split exists, the source is hidden
 * and the pieces are drawn where the source drew its text. Call
 * {@link TextSplit.restore} to remove the pieces and show the source again.
 */
export class TextSplit {
  /** The node holding the pieces, sharing the source's transform. */
  public readonly container: Node;
  /** The pieces, in reading order. */
  public readonly pieces: Txt[];
  /** The unit of the source each piece reproduces. */
  public readonly units: TextUnit[];
  /** Where each piece rests, in the space of its parent. */
  public readonly homes: Vector2[];
  /** The pieces of each line, in reading order. */
  public readonly lines: Txt[][];
  /**
   * The box of each line in the space of its pieces' parent: the line box,
   * from the left edge of its first piece to the right edge of its last one,
   * grown by the clip padding when clipped.
   */
  public readonly lineBoxes: BBox[];
  /** The source's opacity before it was hidden. */
  public readonly opacity: number;

  private readonly sourceOpacity: SignalValue<number>;
  private readonly lineOf: number[];
  private restored = false;

  public constructor(
    public readonly source: Txt,
    {by = 'grapheme', clip = false, clipPadding = 4}: SplitTextOptions = {},
  ) {
    const split = source.splitPieces(by);
    this.pieces = split.map(piece => piece.node);
    this.units = split.map(piece => piece.unit);

    const lineIndices = [...new Set(this.units.map(unit => unit.lineIndex))];
    this.lineOf = this.units.map(unit => lineIndices.indexOf(unit.lineIndex));
    this.lines = lineIndices.map(() => []);
    this.pieces.forEach((piece, index) => {
      this.lines[this.lineOf[index]].push(piece);
      piece.layoutSelf(false);
    });

    const padding = clip ? clipPadding : 0;
    this.lineBoxes = lineIndices.map(line => {
      const units = this.units.filter(unit => unit.lineIndex === line);
      const left = Math.min(...units.map(unit => unit.x - unit.width / 2));
      const right = Math.max(...units.map(unit => unit.x + unit.width / 2));
      const top = Math.min(...units.map(unit => unit.y - unit.height / 2));
      const bottom = Math.max(...units.map(unit => unit.y + unit.height / 2));
      return new BBox(
        left - padding,
        top - padding,
        right - left + padding * 2,
        bottom - top + padding * 2,
      );
    });

    this.container = new SplitContainer(source);
    if (clip) {
      this.container.add(
        this.lineBoxes.map((box, line) => {
          const mask = new Layout({
            layout: false,
            clip: true,
            position: box.center,
            size: box.size,
          });
          for (const piece of this.lines[line]) {
            piece.position(piece.position().sub(box.center));
          }
          mask.add(this.lines[line]);
          return mask;
        }),
      );
      this.lineBoxes = this.lineBoxes.map(
        box => new BBox(-box.width / 2, -box.height / 2, box.width, box.height),
      );
    } else {
      this.container.add(this.pieces);
    }
    this.homes = this.pieces.map(piece => piece.position());

    let host: Node = source;
    for (let parent = host.parent(); parent instanceof Txt;) {
      host = parent;
      parent = host.parent();
    }
    const parent = host.parent() ?? useScene2D().getView();
    parent.insert(this.container, parent.children().indexOf(host) + 1);

    this.sourceOpacity = source.opacity.context.raw() ?? 1;
    this.opacity = source.opacity();
    this.container.opacity(this.opacity);
    source.opacity(0);
  }

  /**
   * The line the piece at the given index sits on, counted from `0` for the
   * first line of this split.
   *
   * @param index - The index of the piece in {@link pieces}.
   */
  public lineIndexOf(index: number): number {
    return this.lineOf[index];
  }

  /**
   * The box of the line the piece at the given index sits on, see
   * {@link lineBoxes}.
   *
   * @param index - The index of the piece in {@link pieces}.
   */
  public lineBoxOf(index: number): BBox {
    return this.lineBoxes[this.lineOf[index]];
  }

  /**
   * Remove the pieces and show the source again.
   *
   * @param opacity - The opacity to give the source. Defaults to the one it
   *                  had before the split.
   */
  public restore(opacity: SignalValue<number> = this.sourceOpacity) {
    if (this.restored) return;
    this.restored = true;
    this.container.remove();
    this.container.dispose();
    this.source.opacity(opacity);
  }
}

/**
 * Split a {@link Txt} into standalone pieces drawn in its place, to animate
 * the pieces on their own.
 *
 * @remarks
 * The pieces are mounted right above the source, in a node that follows the
 * source's transform, and the source is hidden. In headless environments
 * without a 2D canvas, and for text on a path, there are no pieces.
 *
 * @example
 * ```tsx
 * const split = splitText(label(), {by: 'word'});
 * yield* sequence(
 *   0.1,
 *   ...split.pieces.map((piece, i) =>
 *     piece.y(split.homes[i].y - 20, 0.2).to(split.homes[i].y, 0.2),
 *   ),
 * );
 * split.restore();
 * ```
 *
 * @param source - The text to split.
 * @param options - How to split it.
 */
export function splitText(source: Txt, options?: SplitTextOptions): TextSplit {
  return new TextSplit(source, options);
}
