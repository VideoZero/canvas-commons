import {
  GeoProjection,
  geoAzimuthalEqualArea,
  geoConicEqualArea,
  geoEqualEarth,
  geoEquirectangular,
  geoMercator,
  geoNaturalEarth1,
  geoOrthographic,
  geoStereographic,
  geoTransverseMercator,
} from 'd3-geo';

export type ProjectionKind =
  | 'naturalEarth'
  | 'equalEarth'
  | 'mercator'
  | 'equirectangular'
  | 'orthographic'
  | 'stereographic'
  | 'azimuthalEqualArea'
  | 'conicEqualArea'
  | 'transverseMercator';

export interface ProjectionDefinition {
  factory: () => GeoProjection;
  /**
   * Azimuthal projections point the camera by rotating the sphere on both
   * axes; cylindrical/pseudocylindrical ones rotate longitude and shift
   * latitude via `center` to avoid tilting the graticule.
   *
   * @defaultValue false
   */
  azimuthal?: boolean;
}

/**
 * A projection for `GeoMap`: a built-in kind by name, a bare factory
 * (e.g. `geoRobinson` from `d3-geo-projection`), or a full definition
 * with camera semantics.
 */
export type PossibleProjection =
  | ProjectionKind
  | (() => GeoProjection)
  | ProjectionDefinition;

export function resolveProjection(
  value: PossibleProjection,
): {factory: () => GeoProjection; azimuthal: boolean} {
  if (typeof value === 'string') {
    const definition = PROJECTIONS[value];
    if (!definition) {
      throw new Error(`GeoMap: unknown projection "${value}".`);
    }
    return {factory: definition.factory, azimuthal: definition.azimuthal ?? false};
  }
  if (typeof value === 'function') {
    return {factory: value, azimuthal: false};
  }
  return {factory: value.factory, azimuthal: value.azimuthal ?? false};
}

export const PROJECTIONS: Record<ProjectionKind, ProjectionDefinition> = {
  naturalEarth: {factory: geoNaturalEarth1, azimuthal: false},
  equalEarth: {factory: geoEqualEarth, azimuthal: false},
  mercator: {factory: geoMercator, azimuthal: false},
  equirectangular: {factory: geoEquirectangular, azimuthal: false},
  orthographic: {factory: geoOrthographic, azimuthal: true},
  stereographic: {factory: geoStereographic, azimuthal: true},
  azimuthalEqualArea: {factory: geoAzimuthalEqualArea, azimuthal: true},
  conicEqualArea: {factory: geoConicEqualArea, azimuthal: false},
  transverseMercator: {factory: geoTransverseMercator, azimuthal: false},
};
