import {Latex, LatexProps, nodeName} from '@canvas-commons/2d';
import {BBox} from '@canvas-commons/core';

/**
 * The padding VideoZero added around `Latex` fragment boxes by default.
 */
export const VideoZeroFragmentPadding = 8;

/**
 * A {@link Latex} whose fragment boxes have the VideoZero default padding of
 * {@link VideoZeroFragmentPadding} pixels.
 *
 * @remarks
 * Canvas Commons pads fragment boxes by `0` unless a padding is passed.
 * `getAbsoluteFragmentBBox` returns world coordinates, as in Canvas Commons.
 *
 * @example
 * ```tsx
 * const tex = createRef<AnimLatex>();
 * view.add(<AnimLatex ref={tex} tex="{{a}}x^2" fill="white" />);
 * view.add(
 *   <Rect
 *     stroke="yellow"
 *     lineWidth={4}
 *     position={() => tex().getFragmentBBox('a')[0].center}
 *     size={() => tex().getFragmentBBox('a')[0].size}
 *   />,
 * );
 * ```
 */
@nodeName('AnimLatex')
export class AnimLatex extends Latex {
  public constructor(props: LatexProps) {
    super(props);
  }

  /**
   * The boxes of the fragment in the parent's space, padded by `8` by default.
   *
   * @param id - The fragment text (what's inside `\{\{...\}\}`).
   * @param padding - The padding around each box, `8` by default.
   */
  public override getFragmentBBox(
    id: string,
    padding = VideoZeroFragmentPadding,
  ): BBox[] {
    return super.getFragmentBBox(id, padding);
  }

  /**
   * The boxes of the fragment in this node's space, padded by `8` by default.
   *
   * @param id - The fragment text (what's inside `\{\{...\}\}`).
   * @param padding - The padding around each box, `8` by default.
   */
  public override getLocalFragmentBBox(
    id: string,
    padding = VideoZeroFragmentPadding,
  ): BBox[] {
    return super.getLocalFragmentBBox(id, padding);
  }

  /**
   * The boxes of the fragment in world space, padded by `8` by default.
   *
   * @param id - The fragment text (what's inside `\{\{...\}\}`).
   * @param padding - The padding around each box, `8` by default.
   */
  public override getAbsoluteFragmentBBox(
    id: string,
    padding = VideoZeroFragmentPadding,
  ): BBox[] {
    return super.getAbsoluteFragmentBBox(id, padding);
  }
}
