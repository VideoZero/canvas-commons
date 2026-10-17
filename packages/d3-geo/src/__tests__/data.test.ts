import {afterEach, describe, expect, test} from 'vitest';
import {configureGeoData, geoData} from '../data';

afterEach(() => {
  configureGeoData({baseUrl: null, resolver: null, hostWorldAtlas: false});
});

describe('geoData', () => {
  test('passes through absolute URLs and paths', () => {
    expect(geoData('https://example.com/x.json')).toBe(
      'https://example.com/x.json',
    );
    expect(geoData('//cdn.example.com/x.json')).toBe(
      '//cdn.example.com/x.json',
    );
    expect(geoData('/geo/x.json')).toBe('/geo/x.json');
    expect(geoData('./local.json')).toBe('./local.json');
  });

  test('appends .json to bare names only', () => {
    expect(geoData('germany-states')).toBe('germany-states.json');
    expect(geoData('germany-states.json')).toBe('germany-states.json');
    expect(geoData('germany.topojson')).toBe('germany.topojson');
    expect(geoData('germany.geojson')).toBe('germany.geojson');
  });

  test('joins names onto the configured base URL', () => {
    configureGeoData({baseUrl: '/geo'});
    expect(geoData('germany-states')).toBe('/geo/germany-states.json');
    configureGeoData({baseUrl: 'https://example.com/geo/'});
    expect(geoData('germany-states')).toBe(
      'https://example.com/geo/germany-states.json',
    );
  });

  test('resolver takes precedence over baseUrl', () => {
    configureGeoData({
      baseUrl: '/geo',
      resolver: file => `/custom/${file}`,
    });
    expect(geoData('germany-states')).toBe('/custom/germany-states.json');
  });

  test('absolute inputs bypass the resolver', () => {
    configureGeoData({resolver: file => `/custom/${file}`});
    expect(geoData('/geo/x.json')).toBe('/geo/x.json');
  });
});
