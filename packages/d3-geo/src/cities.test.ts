import {describe, expect, test} from 'vitest';
import {cityLonLat} from './cities';

describe('cityLonLat', () => {
  test('looks up cities case-insensitively', () => {
    expect(cityLonLat('Berlin')).toEqual([13.405, 52.52]);
    expect(cityLonLat('berlin')).toEqual([13.405, 52.52]);
    expect(cityLonLat('NEW YORK')).toEqual(cityLonLat('New York'));
  });

  test('returns null for unknown cities', () => {
    expect(cityLonLat('Atlantis')).toBeNull();
  });
});
