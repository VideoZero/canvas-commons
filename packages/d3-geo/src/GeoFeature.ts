import {
  Shape,
  ShapeProps,
  computed,
  initial,
  is,
  nodeName,
  signal,
} from '@canvas-commons/2d';
import {BBox, SignalValue, SimpleSignal} from '@canvas-commons/core';
import {geoCentroid, geoCircle, geoDistance, geoPath} from 'd3-geo';
import type {Geometry, Position} from 'geojson';
import {GeoMap} from './GeoMap';
import {GeoObject, sanitizePolygons} from './geometry';
import {projectToPath} from './path';

function geometriesOf(object: GeoObject): Geometry[] {
  switch (object.type) {
    case 'Sphere':
      return [];
    case 'Feature':
      return object.geometry ? [object.geometry] : [];
    case 'FeatureCollection':
      return object.features.flatMap(item =>
        item.geometry ? [item.geometry] : [],
      );
    default:
      return [object];
  }
}

function positionsOf(geometry: Geometry): Position[] {
  switch (geometry.type) {
    case 'Point':
      return [geometry.coordinates];
    case 'MultiPoint':
    case 'LineString':
      return geometry.coordinates;
    case 'MultiLineString':
    case 'Polygon':
      return geometry.coordinates.flat();
    case 'MultiPolygon':
      return geometry.coordinates.flat(2);
    case 'GeometryCollection':
      return geometry.geometries.flatMap(positionsOf);
  }
}

export interface GeoFeatureProps extends ShapeProps {
  /**
   * The region to draw: a feature name/id from the parent map's data, or a
   * GeoJSON object.
   */
  feature?: SignalValue<string | number | GeoObject | null>;

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
  declare public readonly feature: SimpleSignal<
    string | number | GeoObject | null,
    this
  >;

  @initial(1)
  @signal()
  declare public readonly reveal: SimpleSignal<number, this>;

  public constructor(props: GeoFeatureProps) {
    // The path is generated in map space; never let flex layout move it.
    super({layout: false, ...props});
  }

  @computed()
  protected map(): GeoMap {
    const map = this.findAncestor(is(GeoMap));
    if (!map) {
      throw new Error('GeoFeature must be a descendant of a GeoMap.');
    }
    return map;
  }

  @computed()
  private geometry(): GeoObject | null {
    const value = this.feature();
    if (value === null) {
      return null;
    }
    if (typeof value === 'object') {
      return sanitizePolygons(value);
    }
    return this.map().featureByName(value);
  }

  @computed()
  private featurePath(): Path2D {
    const geometry = this.geometry();
    const projection = this.map().projector();
    return geometry && projection
      ? projectToPath(projection, geometry)
      : new Path2D();
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
    // Bounding box corners underestimate the radius of regions crossing the
    // antimeridian (Russia, Fiji, ...), so sweep the actual vertices.
    let radius = 0;
    for (const item of geometriesOf(geometry)) {
      for (const [lon, lat] of positionsOf(item)) {
        radius = Math.max(radius, geoDistance(center, [lon, lat]));
      }
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
    return projectToPath(projection, cap);
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

  /**
   * Bounds of the projected geometry in local space.
   *
   * @remarks
   * Required for effects that rasterize the node into a cache texture
   * (`shaders`, filters, opacity) — the layout size of this node is zero.
   */
  @computed()
  protected pathBBox(): BBox {
    const geometry = this.geometry();
    const projection = this.map().projector();
    if (!geometry || !projection) {
      return new BBox();
    }
    const [[left, top], [right, bottom]] = geoPath(projection).bounds(geometry);
    if (![left, top, right, bottom].every(isFinite) || right < left) {
      return new BBox();
    }
    return new BBox(left, top, right - left, bottom - top);
  }

  protected override getCacheBBox(): BBox {
    return this.pathBBox().expand(this.lineWidth() / 2);
  }
}
