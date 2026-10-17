import {DependencyContext, Vector2} from '@canvas-commons/core';
import {geoContains} from 'd3-geo';
import type {Feature, FeatureCollection} from 'geojson';
import {describe, expect, test} from 'vitest';
import {GeoFeature} from '../GeoFeature';
import {GeoLine} from '../GeoLine';
import {GeoMap} from '../GeoMap';
import {GeoPin} from '../GeoPin';
import {mockScene2D} from './mockScene2D';
import {recordedCommands} from './recordingPath2D';

const Testland: Feature = {
  type: 'Feature',
  id: 'TL',
  properties: {name: 'Testland'},
  geometry: {
    type: 'Polygon',
    // RFC 7946 winding: counterclockwise exterior ring.
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

const Data: FeatureCollection = {
  type: 'FeatureCollection',
  features: [Testland],
};

const UnitedStates: Feature = {
  type: 'Feature',
  properties: {name: 'United States'},
  geometry: {
    type: 'Polygon',
    coordinates: [
      [
        [-125, 24],
        [-66, 24],
        [-66, 50],
        [-125, 50],
        [-125, 24],
      ],
    ],
  },
};

class InspectableLine extends GeoLine {
  public path(): Path2D {
    return this.getPath();
  }
}

describe('GeoMap fixes', () => {
  const {errors} = mockScene2D();

  test('rewinds RFC 7946 GeoJSON on load', () => {
    const map = new GeoMap({data: Data, size: [800, 400]});
    const feature = map.featureByName('Testland');
    expect(feature && geoContains(feature, [15, 15])).toBe(true);
    expect(feature && geoContains(feature, [-165, -15])).toBe(false);
  });

  test('fits a named feature while the data is still loading', async () => {
    let resolve: (value: object) => void = () => {};
    const map = new GeoMap({
      data: new Promise<object>(done => (resolve = done)),
      fit: 'Testland',
      size: [800, 400],
    });
    expect(() => map.projector()).not.toThrow();
    expect(map.zoomFor('Testland')).toBe(1);
    resolve(Data);
    await DependencyContext.consumePromises();
  });

  test('surfaces rejected data promises', async () => {
    const data = Promise.reject(new Error('offline'));
    const map = new GeoMap({data, size: [800, 400]});
    expect(map.geoData()).toBeNull();
    await DependencyContext.consumePromises();
    map.data(null);
    map.data(data);
    map.geoData();
    expect(errors.map(({message}) => message)).toEqual([
      'GeoMap: map data promise rejected: Error: offline',
    ]);
  });

  test('rejects data that is neither TopoJSON nor GeoJSON', () => {
    const map = new GeoMap({data: {hello: 'world'}});
    map.geoData();
    expect(errors.map(({message}) => message)).toEqual([
      'GeoMap: map data must be TopoJSON or GeoJSON.',
    ]);
  });

  test('supports the composite albersUsa projection', () => {
    const map = new GeoMap({
      data: UnitedStates,
      projection: 'albersUsa',
      size: [800, 400],
    });
    expect(map.projector()).not.toBeNull();
    expect(map.isLocationVisible('New York')).toBe(true);
    expect(map.isLocationVisible('Berlin')).toBe(false);
  });

  test('uses the clip angle of azimuthal projections for visibility', () => {
    const map = new GeoMap({
      data: Data,
      projection: 'stereographic',
      size: [800, 400],
    });
    expect(map.isPointVisible([120, 0])).toBe(true);
    map.projection('orthographic');
    expect(map.isPointVisible([120, 0])).toBe(false);
  });
});

describe('geo node fixes', () => {
  mockScene2D();

  test('cache bounds cover the projected geometry', () => {
    const map = new GeoMap({data: Data, size: [800, 400]});
    const feature = new GeoFeature({feature: 'Testland', fill: 'red'});
    const line = new GeoLine({
      points: [
        [0, 0],
        [40, 20],
      ],
      lineWidth: 4,
    });
    const pin = new GeoPin({at: [15, 15]});
    map.add([feature, line, pin]);
    for (const node of [feature, line, pin]) {
      const box = node.cacheBBox();
      expect(box.width).toBeGreaterThan(0);
      expect(box.height).toBeGreaterThan(0);
    }
  });

  test('bulged lines break at the antimeridian', () => {
    const map = new GeoMap({data: Data, size: [800, 400]});
    const line = new InspectableLine({
      points: [
        [170, 0],
        [-170, 0],
      ],
      bulge: 20,
    });
    map.add(line);
    const commands = recordedCommands(line.path());
    expect(commands.filter(({type}) => type === 'moveTo')).toHaveLength(2);
    let previous = Vector2.zero;
    for (const command of commands) {
      if (command.type !== 'moveTo' && command.type !== 'lineTo') continue;
      const point = new Vector2(command.x, command.y);
      if (command.type === 'lineTo') {
        expect(point.sub(previous).magnitude).toBeLessThan(100);
      }
      previous = point;
    }
  });
});
