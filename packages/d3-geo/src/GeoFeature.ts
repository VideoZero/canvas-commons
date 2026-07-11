import {Shape, ShapeProps, computed, nodeName, signal} from '@motion-canvas/2d';
import {SignalValue, SimpleSignal} from '@motion-canvas/core';
import {GeoPermissibleObjects, geoPath} from 'd3-geo';
import {GeoMap} from './GeoMap';

export interface GeoFeatureProps extends ShapeProps {
  /**
   * The region to draw: a feature name/id from the parent map's data, or a
   * GeoJSON object.
   */
  feature?: SignalValue<string | number | object | null>;
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
 *   <GeoFeature feature={'France'} fill={'#4666ff'} opacity={0} />
 * </GeoMap>
 * ```
 */
@nodeName('GeoFeature')
export class GeoFeature extends Shape {
  @signal()
  public declare readonly feature: SimpleSignal<
    string | number | object | null,
    this
  >;

  public constructor(props: GeoFeatureProps) {
    // The path is generated in map space; never let flex layout move it.
    super({layout: false, ...props});
  }

  @computed()
  private map(): GeoMap {
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

  protected override getPath(): Path2D {
    return this.featurePath();
  }
}
