import type {GeoSphere} from 'd3-geo';
import {geoArea} from 'd3-geo';
import type {
  Feature,
  FeatureCollection,
  Geometry,
  Polygon,
  Position,
} from 'geojson';

/**
 * A geographic object accepted by the geo nodes: a GeoJSON geometry, feature,
 * or feature collection, or d3's `{type: 'Sphere'}`.
 */
export type GeoObject = Geometry | Feature | FeatureCollection | GeoSphere;

const Epsilon = 1e-10;

function isDegenerate(ring: Position[]): boolean {
  if (ring.length < 4) return true;
  // Collapsed remnants keep only a few points, so longer rings skip the
  // comparatively expensive area check.
  if (ring.length >= 8) return false;
  // A hole read on its own covers the complement of the sphere, so both
  // near-zero and near-4π areas count as degenerate.
  const area = geoArea({type: 'Polygon', coordinates: [ring]});
  return area <= Epsilon || area >= 4 * Math.PI - Epsilon;
}

function cleanRings(rings: Position[][], rewind: boolean): Position[][] | null {
  const kept = rings.filter(ring => !isDegenerate(ring));
  if (kept.length === 0 || kept[0] !== rings[0]) {
    return null;
  }
  if (!rewind) {
    return kept;
  }
  const polygon: Polygon = {type: 'Polygon', coordinates: kept};
  return geoArea(polygon) > Math.PI * 2
    ? kept.map(ring => ring.slice().reverse())
    : kept;
}

function sanitizeGeometry(geometry: Geometry, rewind: boolean): Geometry {
  switch (geometry.type) {
    case 'GeometryCollection':
      return {
        ...geometry,
        geometries: geometry.geometries.map(item =>
          sanitizeGeometry(item, rewind),
        ),
      };
    case 'Polygon':
      return {
        ...geometry,
        coordinates: cleanRings(geometry.coordinates, rewind) ?? [],
      };
    case 'MultiPolygon':
      return {
        ...geometry,
        coordinates: geometry.coordinates
          .map(polygon => cleanRings(polygon, rewind))
          .filter((polygon): polygon is Position[][] => polygon !== null),
      };
    default:
      return geometry;
  }
}

function sanitizeFeature(feature: Feature, rewind: boolean): Feature {
  return {
    ...feature,
    geometry: feature.geometry && sanitizeGeometry(feature.geometry, rewind),
  };
}

/**
 * Sanitize polygons for d3's spherical rendering.
 *
 * @remarks
 * d3-geo reads ring winding on the sphere: a polygon wound the other way,
 * including standard RFC 7946 GeoJSON with counterclockwise exterior rings,
 * covers everything except its interior and floods the whole projection.
 * Simplification can also collapse small rings to zero area, which breaks
 * d3's polygon clipping the same way.
 *
 * This function drops degenerate rings, drops polygons whose exterior ring
 * collapsed, and rewinds any polygon that covers more than a hemisphere. Map
 * data is sanitized automatically; use this for custom geometry.
 *
 * @example
 * ```ts
 * const region = sanitizePolygons(await (await fetch(url)).json());
 * ```
 *
 * @param object - The object to sanitize. Non-polygon geometry is returned
 *                 unchanged.
 * @param rewind - Whether to fix the winding. Pass `false` for geometry with
 *                 trusted winding, such as TopoJSON layers, to only drop
 *                 degenerate rings.
 */
export function sanitizePolygons<T extends GeoObject>(
  object: T,
  rewind?: boolean,
): T;
export function sanitizePolygons(object: GeoObject, rewind = true): GeoObject {
  switch (object.type) {
    case 'Sphere':
      return object;
    case 'Feature':
      return sanitizeFeature(object, rewind);
    case 'FeatureCollection':
      return {
        ...object,
        features: object.features.map(item => sanitizeFeature(item, rewind)),
      };
    default:
      return sanitizeGeometry(object, rewind);
  }
}
