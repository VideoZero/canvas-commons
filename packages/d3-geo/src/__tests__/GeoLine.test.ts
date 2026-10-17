import {describe, expect, test} from 'vitest';
import {GeoLine} from '../GeoLine';
import {GeoMap} from '../GeoMap';
import {mockScene2D} from './mockScene2D';

mockScene2D();

function makeLine(points: [number, number][]): GeoLine {
  const map = new GeoMap({
    data: {type: 'FeatureCollection', features: []},
  });
  const line = new GeoLine({points});
  map.add(line);
  return line;
}

describe('GeoLine.progressAt', () => {
  test('returns the cumulative fraction at each waypoint', () => {
    const line = makeLine([
      [0, 0],
      [10, 0],
      [30, 0],
    ]);
    expect(line.progressAt(0)).toBe(0);
    expect(line.progressAt(1)).toBeCloseTo(1 / 3, 5);
    expect(line.progressAt(2)).toBe(1);
  });

  test('handles duplicate leading waypoints', () => {
    const line = makeLine([
      [0, 0],
      [0, 0],
      [30, 0],
    ]);
    expect(line.progressAt(1)).toBe(0);
    expect(line.progressAt(2)).toBe(1);
  });

  test('clamps out-of-range indices', () => {
    const line = makeLine([
      [0, 0],
      [10, 0],
    ]);
    expect(line.progressAt(-1)).toBe(0);
    expect(line.progressAt(5)).toBe(1);
  });

  test('returns 0 for degenerate lines', () => {
    expect(makeLine([]).progressAt(1)).toBe(0);
    expect(makeLine([[0, 0]]).progressAt(1)).toBe(0);
    expect(
      makeLine([
        [10, 10],
        [10, 10],
      ]).progressAt(1),
    ).toBe(0);
  });
});

describe('GeoLine.pointAt', () => {
  test('interpolates along the geodesic', () => {
    const line = makeLine([
      [0, 0],
      [10, 0],
    ]);
    const mid = line.pointAt(0.5);
    expect(mid.x).toBeCloseTo(5, 3);
    expect(mid.y).toBeCloseTo(0, 3);
  });

  test('clamps to the endpoints', () => {
    const line = makeLine([
      [0, 0],
      [10, 0],
    ]);
    expect(line.pointAt(-1).x).toBeCloseTo(0, 5);
    expect(line.pointAt(2).x).toBeCloseTo(10, 5);
  });
});
