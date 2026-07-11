import {computed, initial, nodeName, signal} from '@motion-canvas/2d';
import {PossibleVector2, SignalValue, SimpleSignal} from '@motion-canvas/core';
import {geoCircle} from 'd3-geo';
import {GeoFeature, GeoFeatureProps} from './GeoFeature';

const KILOMETERS_PER_DEGREE = 111.32;

export interface GeoCircleProps extends Omit<GeoFeatureProps, 'feature'> {
  /**
   * Center of the circle: `[longitude, latitude]`, a city name, or a
   * region name (its centroid).
   */
  at?: SignalValue<string | PossibleVector2>;

  /**
   * Radius of the circle in kilometers (measured on the sphere).
   */
  radius?: SignalValue<number>;
}

/**
 * A geodesic circle region on a {@link GeoMap}.
 *
 * @remarks
 * Must be a descendant of a {@link GeoMap}. The circle is a true spherical
 * region — it deforms with the projection and clips correctly on globes.
 * All {@link GeoFeature} styling applies; tween `radius` to grow a range
 * indicator.
 *
 * @example
 * ```tsx
 * <GeoCircle at={'Berlin'} radius={300} fill={'#e8555d40'} stroke={'#e8555d'} lineWidth={2} />
 * ```
 */
@nodeName('GeoCircle')
export class GeoCircle extends GeoFeature {
  @initial([0, 0])
  @signal()
  public declare readonly at: SimpleSignal<string | PossibleVector2, this>;

  @initial(100)
  @signal()
  public declare readonly radius: SimpleSignal<number, this>;

  public constructor(props: GeoCircleProps) {
    super({...props, feature: null});
    // Late-bound so the circle re-generates when `at`/`radius` change.
    this.feature(() => this.circleGeometry());
  }

  @computed()
  private circleGeometry(): object {
    const center = this.map().resolveLonLat(this.at());
    return geoCircle()
      .center([center.x, center.y])
      .radius(this.radius() / KILOMETERS_PER_DEGREE)();
  }
}
