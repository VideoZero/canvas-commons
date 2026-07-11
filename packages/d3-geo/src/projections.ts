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

interface ProjectionDefinition {
  factory: () => GeoProjection;
  /**
   * Azimuthal projections point the camera by rotating the sphere on both
   * axes; cylindrical/pseudocylindrical ones rotate longitude and shift
   * latitude via `center` to avoid tilting the graticule.
   */
  azimuthal: boolean;
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
