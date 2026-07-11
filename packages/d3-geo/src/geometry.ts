import {geoArea} from 'd3-geo';

/**
 * Sanitize polygons for d3's spherical rendering.
 *
 * @remarks
 * d3-geo interprets ring winding on the sphere: a polygon wound the
 * "wrong" way (including standard RFC 7946 GeoJSON, which winds exterior
 * rings counterclockwise in planar coordinates) reads as covering
 * everything *except* its interior, flooding the fill across the whole
 * projection. Simplification can additionally collapse small rings to
 * zero area, which breaks d3's polygon clipping the same way.
 *
 * This helper drops degenerate rings — they cover no pixels anyway — and
 * rewinds any polygon that reads as larger than a hemisphere. Applied
 * automatically to map data; exported for sanitizing custom geometry
 * passed straight to `GeoFeature`.
 *
 * @param object - GeoJSON object of any type; non-polygon geometry passes
 * through untouched.
 * @param rewind - Set to `false` to skip the winding fix for geometry with
 * trusted winding (e.g. TopoJSON-derived layers), keeping only the cheap
 * degenerate-ring cleanup.
 */
export function sanitizePolygons(object: any, rewind = true): any {
  if (!object) {
    return object;
  }
  if (object.type === 'Feature') {
    return {...object, geometry: sanitizePolygons(object.geometry, rewind)};
  }
  if (object.type === 'FeatureCollection') {
    return {
      ...object,
      features: object.features.map((item: any) =>
        sanitizePolygons(item, rewind),
      ),
    };
  }
  if (object.type === 'GeometryCollection') {
    return {
      ...object,
      geometries: object.geometries.map((item: any) =>
        sanitizePolygons(item, rewind),
      ),
    };
  }
  const epsilon = 1e-10;
  const clean = (coordinates: any[]): any[] | null => {
    const rings = coordinates.filter(ring => {
      if (ring.length < 4) {
        return false;
      }
      if (ring.length >= 8) {
        // Enough surviving vertices to be a real ring — skip the (per-ring
        // costly) area check; collapsed remnants keep only a few points.
        return true;
      }
      // A hole ring read standalone covers the complement (~4π); treat
      // both near-0 and near-4π as degenerate.
      const area = geoArea({type: 'Polygon', coordinates: [ring]} as any);
      return area > epsilon && area < 4 * Math.PI - epsilon;
    });
    if (rings.length === 0 || rings[0] !== coordinates[0]) {
      // The exterior ring collapsed — drop the polygon entirely.
      return null;
    }
    if (!rewind) {
      return rings;
    }
    return geoArea({type: 'Polygon', coordinates: rings} as any) > Math.PI * 2
      ? rings.map(ring => ring.slice().reverse())
      : rings;
  };
  if (object.type === 'Polygon') {
    const coordinates = clean(object.coordinates);
    return coordinates
      ? {...object, coordinates}
      : {...object, type: 'MultiPolygon', coordinates: []};
  }
  if (object.type === 'MultiPolygon') {
    return {
      ...object,
      coordinates: object.coordinates.map(clean).filter(Boolean),
    };
  }
  return object;
}
