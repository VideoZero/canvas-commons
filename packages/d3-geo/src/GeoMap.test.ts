import {describe, expect, test} from 'vitest';
import {GeoMap} from './GeoMap';
import {mockScene2D} from './testScene';

mockScene2D();

const TESTLAND = {
  type: 'Feature',
  id: 'TL',
  properties: {name: 'Testland'},
  geometry: {
    type: 'Polygon',
    coordinates: [
      [
        [10, 10],
        [20, 10],
        [20, 20],
        [10, 20],
        [10, 10],
      ],
    ],
  },
};

function makeMap(): GeoMap {
  return new GeoMap({
    data: {type: 'FeatureCollection', features: [TESTLAND]},
  });
}

describe('GeoMap.featureByName', () => {
  test('finds features by name, case-insensitively', () => {
    const map = makeMap();
    expect(map.featureByName('Testland')?.id).toBe('TL');
    expect(map.featureByName('testland')?.id).toBe('TL');
  });

  test('finds features by id', () => {
    expect(makeMap().featureByName('TL')?.id).toBe('TL');
  });

  test('returns null for unknown names', () => {
    expect(makeMap().featureByName('Atlantis')).toBeNull();
  });
});

describe('GeoMap.resolveLonLat', () => {
  test('passes coordinates through', () => {
    const resolved = makeMap().resolveLonLat([13.4, 52.5]);
    expect(resolved.x).toBeCloseTo(13.4, 5);
    expect(resolved.y).toBeCloseTo(52.5, 5);
  });

  test('resolves gazetteer cities', () => {
    const resolved = makeMap().resolveLonLat('Berlin');
    expect(resolved.x).toBeCloseTo(13.405, 3);
    expect(resolved.y).toBeCloseTo(52.52, 3);
  });

  test('resolves region names to their centroid', () => {
    const resolved = makeMap().resolveLonLat('Testland');
    expect(resolved.x).toBeCloseTo(15, 0);
    expect(resolved.y).toBeCloseTo(15, 0);
  });

  test('throws for unknown locations once data is loaded', () => {
    expect(() => makeMap().resolveLonLat('Nowhere')).toThrow(
      'unknown location',
    );
  });
});

describe('GeoMap.isPointVisible', () => {
  test('is always true for non-azimuthal projections', () => {
    const map = makeMap();
    map.projection('mercator');
    map.center([0, 0]);
    expect(map.isPointVisible([179, 0])).toBe(true);
  });
});
