import {Shape, ShapeProps, computed, initial, nodeName, signal} from '@motion-canvas/2d';
import {SignalValue, SimpleSignal} from '@motion-canvas/core';
import {
  GeoPermissibleObjects,
  geoBounds,
  geoCentroid,
  geoCircle,
  geoDistance,
  geoPath,
} from 'd3-geo';
import {GeoMap} from './GeoMap';

export interface GeoFeatureProps extends ShapeProps {
  /**
   * The region to draw: a feature name/id from the parent map's data, or a
   * GeoJSON object.
   */
  feature?: SignalValue<string | number | object | null>;

  /**
   * How much of the region is shown, as a circular wipe from its center.
   *
   * @remarks
   * Tween from 0 to 1 to "color in" the region. The wipe is a true
   * spherical cap, so it stays circular under any projection.
   */
  reveal?: SignalValue<number>;
}

/**
 * Highlights a single region of a {@link GeoMap}.
 *
 * @remarks
 * Must be placed as a direct child of a {@link GeoMap} (it renders in the
 * map's coordinate space). All {@link Shape} styling signals apply, so the
 * highlight is fully tweenable.
 *
 * @example
 * ```tsx
 * <GeoMap data={worldAtlas()} size={'100%'}>
 *   <GeoFeature ref={france} feature={'France'} fill={'#4666ff'} reveal={0} />
 * </GeoMap>
 * // ...
 * yield* france().reveal(1, 0.8);
 * ```
 */
@nodeName('GeoFeature')
export class GeoFeature extends Shape {
  @signal()
  public declare readonly feature: SimpleSignal<
    string | number | object | null,
    this
  >;

  @initial(1)
  @signal()
  public declare readonly reveal: SimpleSignal<number, this>;

  public constructor(props: GeoFeatureProps) {
    // The path is generated in map space; never let flex layout move it.
    super({layout: false, ...props});
  }

  @computed()
  protected map(): GeoMap {
    const map = this.findAncestor(node => node instanceof GeoMap);
    if (!map) {
      throw new Error('GeoFeature must be a descendant of a GeoMap.');
    }
    return map as GeoMap;
  }

  @computed()
  private geometry(): GeoPermissibleObjects | null {
    const value = this.feature();
    if (value === null) {
      return null;
    }
    if (typeof value === 'object') {
      return value as GeoPermissibleObjects;
    }
    return this.map().featureByName(value) as GeoPermissibleObjects | null;
  }

  @computed()
  private featurePath(): Path2D {
    const path = new Path2D();
    const geometry = this.geometry();
    const projection = this.map().projector();
    if (geometry && projection) {
      geoPath(projection, path as any)(geometry);
    }
    return path;
  }

  /**
   * Center and angular radius (in degrees) of the cap that fully covers
   * the region — the end state of the reveal wipe.
   */
  @computed()
  private revealRegion(): {center: [number, number]; radius: number} | null {
    const geometry = this.geometry();
    if (!geometry) {
      return null;
    }
    const center = geoCentroid(geometry);
    const [[west, south], [east, north]] = geoBounds(geometry);
    let radius = 0;
    for (const point of [
      [west, south],
      [west, north],
      [east, south],
      [east, north],
    ] as [number, number][]) {
      radius = Math.max(radius, geoDistance(center, point));
    }
    return {center, radius: (radius * 180) / Math.PI};
  }

  @computed()
  private revealClipPath(): Path2D | null {
    const region = this.revealRegion();
    const projection = this.map().projector();
    if (!region || !projection) {
      return null;
    }
    const cap = geoCircle()
      .center(region.center)
      .radius(Math.max(1e-4, region.radius * this.reveal()))();
    const path = new Path2D();
    geoPath(projection, path as any)(cap);
    return path;
  }

  protected override draw(context: CanvasRenderingContext2D) {
    const reveal = this.reveal();
    if (reveal <= 0) {
      return;
    }
    if (reveal >= 1) {
      super.draw(context);
      return;
    }
    const clip = this.revealClipPath();
    if (!clip) {
      super.draw(context);
      return;
    }
    context.save();
    context.clip(clip);
    super.draw(context);
    context.restore();
  }

  protected override getPath(): Path2D {
    return this.featurePath();
  }
}
