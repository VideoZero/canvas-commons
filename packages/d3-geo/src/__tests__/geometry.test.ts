import {geoArea, geoContains} from 'd3-geo';
import type {
  FeatureCollection,
  LineString,
  MultiPolygon,
  Polygon,
} from 'geojson';
import {describe, expect, test} from 'vitest';
import {sanitizePolygons} from '../geometry';

// RFC 7946 winding (counterclockwise exterior) — d3 reads this raw as the
// polygon's complement.
const RfcSquare: [number, number][][] = [
  [
    [10, 10],
    [20, 10],
    [20, 20],
    [10, 20],
    [10, 10],
  ],
];

describe('sanitizePolygons', () => {
  test('rewinds RFC 7946 polygons to d3 winding', () => {
    const raw: Polygon = {type: 'Polygon', coordinates: RfcSquare};
    expect(geoArea(raw)).toBeGreaterThan(Math.PI * 2);
    const sane = sanitizePolygons(raw);
    expect(geoArea(sane)).toBeLessThan(Math.PI * 2);
    expect(geoContains(sane, [15, 15])).toBe(true);
    expect(geoContains(sane, [-165, -15])).toBe(false);
  });

  test('keeps correctly wound polygons untouched', () => {
    const wound: Polygon = {
      type: 'Polygon',
      coordinates: [RfcSquare[0].slice().reverse()],
    };
    const sane = sanitizePolygons(wound);
    expect(sane.coordinates).toEqual(wound.coordinates);
  });

  test('drops degenerate rings that break d3 clipping', () => {
    const degenerate: MultiPolygon = {
      type: 'MultiPolygon',
      coordinates: [
        [RfcSquare[0].slice().reverse()],
        // Zero-area sliver: three collinear points.
        [
          [
            [50, 0],
            [51, 0],
            [50.5, 0],
            [50, 0],
          ],
        ],
      ],
    };
    const sane = sanitizePolygons(degenerate);
    expect(sane.coordinates.length).toBe(1);
  });

  test('recurses through features and collections', () => {
    const collection: FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {name: 'Testland'},
          geometry: {type: 'Polygon', coordinates: RfcSquare},
        },
      ],
    };
    const sane = sanitizePolygons(collection);
    expect(geoContains(sane.features[0], [15, 15])).toBe(true);
    expect(sane.features[0].properties?.name).toBe('Testland');
  });

  test('passes non-polygon geometry through', () => {
    const line: LineString = {
      type: 'LineString',
      coordinates: [
        [0, 0],
        [10, 10],
      ],
    };
    expect(sanitizePolygons(line)).toBe(line);
  });
});
