import {Txt, TxtProps, computed, initial, nodeName, signal} from '@motion-canvas/2d';
import {
  PossibleVector2,
  SignalValue,
  SimpleSignal,
  Vector2,
} from '@motion-canvas/core';
import {GeoMap} from './GeoMap';

export interface GeoLabelProps extends TxtProps {
  /**
   * What the label is anchored to: a region name (its centroid), a city
   * name, or `[longitude, latitude]`.
   */
  at?: SignalValue<string | PossibleVector2>;
}

/**
 * A text label anchored to a geographic location on a {@link GeoMap}.
 *
 * @remarks
 * Must be a descendant of a {@link GeoMap}. Follows the projected location
 * through camera moves at constant screen size and hides itself on the far
 * side of a globe. When `at` is a name and no `text` is given, the name is
 * used as the label text.
 *
 * @example
 * ```tsx
 * <GeoLabel at={'Germany'} fill={'white'} fontSize={36} />
 * ```
 */
@nodeName('GeoLabel')
export class GeoLabel extends Txt {
  @initial([0, 0])
  @signal()
  public declare readonly at: SimpleSignal<string | PossibleVector2, this>;

  public constructor(props: GeoLabelProps) {
    const defaults: TxtProps = {};
    if (
      typeof props.at === 'string' &&
      props.text === undefined &&
      props.children === undefined
    ) {
      defaults.text = props.at;
    }
    // The label anchors to projected coordinates; never let flex move it.
    super({layout: false, ...defaults, ...props});
    if (
      props.position === undefined &&
      props.x === undefined &&
      props.y === undefined
    ) {
      this.position(() => this.geoPosition());
    }
  }

  @computed()
  protected map(): GeoMap {
    const map = this.findAncestor(node => node instanceof GeoMap);
    if (!map) {
      throw new Error('GeoLabel must be a descendant of a GeoMap.');
    }
    return map as GeoMap;
  }

  @computed()
  private geoPosition(): Vector2 {
    return this.map().geoPosition(this.at());
  }

  /**
   * Whether the label's location faces the camera (relevant on globes) and
   * is representable by the projection.
   */
  @computed()
  public isVisibleOnGlobe(): boolean {
    return this.map().isLocationVisible(this.at());
  }

  protected override draw(context: CanvasRenderingContext2D) {
    if (!this.isVisibleOnGlobe()) {
      return;
    }
    super.draw(context);
  }
}
