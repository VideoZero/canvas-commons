import {geoMercator} from 'd3-geo';
import {describe, expect, test} from 'vitest';
import {PROJECTIONS, resolveProjection} from '../projections';

describe('resolveProjection', () => {
  test('resolves built-in kinds by name', () => {
    expect(resolveProjection('mercator').factory).toBe(geoMercator);
    expect(resolveProjection('mercator').azimuthal).toBe(false);
  });

  test('flags azimuthal kinds', () => {
    expect(resolveProjection('orthographic').azimuthal).toBe(true);
    expect(resolveProjection('stereographic').azimuthal).toBe(true);
    expect(resolveProjection('azimuthalEqualArea').azimuthal).toBe(true);
    expect(resolveProjection('naturalEarth').azimuthal).toBe(false);
    expect(resolveProjection('albersUsa').azimuthal).toBe(false);
  });

  test('throws on unknown kinds', () => {
    expect(() =>
      Reflect.apply(resolveProjection, undefined, ['bogus']),
    ).toThrow('unknown projection');
  });

  test('accepts a bare factory (non-azimuthal by default)', () => {
    const resolved = resolveProjection(geoMercator);
    expect(resolved.factory).toBe(geoMercator);
    expect(resolved.azimuthal).toBe(false);
  });

  test('accepts a full definition', () => {
    const resolved = resolveProjection({
      factory: geoMercator,
      azimuthal: true,
    });
    expect(resolved.factory).toBe(geoMercator);
    expect(resolved.azimuthal).toBe(true);
  });
});

describe('projection camera contracts', () => {
  test('albersUsa has a fixed camera (no rotate)', () => {
    const projection = PROJECTIONS.albersUsa.factory();
    expect(projection.rotate).toBeUndefined();
  });

  test('azimuthal clip angles match the visibility model', () => {
    // GeoMap.isPointVisible derives the visible cap from clipAngle; these
    // are the d3 defaults it relies on.
    expect(PROJECTIONS.orthographic.factory().clipAngle()).toBeCloseTo(90, 1);
    expect(PROJECTIONS.stereographic.factory().clipAngle()).toBeCloseTo(142, 1);
    expect(PROJECTIONS.azimuthalEqualArea.factory().clipAngle()).toBeCloseTo(
      180,
      1,
    );
  });
});
