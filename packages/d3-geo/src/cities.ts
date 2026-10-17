/**
 * Small built-in gazetteer of well-known cities as `[longitude, latitude]`.
 *
 * @remarks
 * Lets pins and camera targets reference cities by name without shipping a
 * full populated-places dataset. Lookup is case-insensitive via
 * {@link cityLonLat}.
 *
 * @example
 * ```ts
 * const [lon, lat] = CITIES['New York'];
 * ```
 */
export const CITIES: Record<string, [number, number]> = Object.fromEntries([
  ['Amsterdam', [4.9041, 52.3676]],
  ['Athens', [23.7275, 37.9838]],
  ['Atlanta', [-84.388, 33.749]],
  ['Auckland', [174.7645, -36.8509]],
  ['Austin', [-97.7431, 30.2672]],
  ['Bangkok', [100.5018, 13.7563]],
  ['Barcelona', [2.1734, 41.3851]],
  ['Beijing', [116.4074, 39.9042]],
  ['Berlin', [13.405, 52.52]],
  ['Bogotá', [-74.0721, 4.711]],
  ['Boston', [-71.0589, 42.3601]],
  ['Brussels', [4.3517, 50.8503]],
  ['Budapest', [19.0402, 47.4979]],
  ['Buenos Aires', [-58.3816, -34.6037]],
  ['Cairo', [31.2357, 30.0444]],
  ['Cape Town', [18.4241, -33.9249]],
  ['Caracas', [-66.9036, 10.4806]],
  ['Chicago', [-87.6298, 41.8781]],
  ['Cologne', [6.9603, 50.9375]],
  ['Copenhagen', [12.5683, 55.6761]],
  ['Dallas', [-96.797, 32.7767]],
  ['Delhi', [77.1025, 28.7041]],
  ['Denver', [-104.9903, 39.7392]],
  ['Dhaka', [90.4125, 23.8103]],
  ['Dubai', [55.2708, 25.2048]],
  ['Dublin', [-6.2603, 53.3498]],
  ['Edinburgh', [-3.1883, 55.9533]],
  ['Frankfurt', [8.6821, 50.1109]],
  ['Hamburg', [9.9937, 53.5511]],
  ['Havana', [-82.3666, 23.1136]],
  ['Helsinki', [24.9384, 60.1699]],
  ['Ho Chi Minh City', [106.6297, 10.8231]],
  ['Hong Kong', [114.1694, 22.3193]],
  ['Houston', [-95.3698, 29.7604]],
  ['Istanbul', [28.9784, 41.0082]],
  ['Jakarta', [106.8456, -6.2088]],
  ['Johannesburg', [28.0473, -26.2041]],
  ['Karachi', [67.0011, 24.8607]],
  ['Kuala Lumpur', [101.6869, 3.139]],
  ['Kyiv', [30.5234, 50.4501]],
  ['Lagos', [3.3792, 6.5244]],
  ['Lima', [-77.0428, -12.0464]],
  ['Lisbon', [-9.1393, 38.7223]],
  ['London', [-0.1276, 51.5074]],
  ['Los Angeles', [-118.2437, 34.0522]],
  ['Madrid', [-3.7038, 40.4168]],
  ['Manila', [120.9842, 14.5995]],
  ['Melbourne', [144.9631, -37.8136]],
  ['Mexico City', [-99.1332, 19.4326]],
  ['Miami', [-80.1918, 25.7617]],
  ['Milan', [9.19, 45.4642]],
  ['Minneapolis', [-93.265, 44.9778]],
  ['Montreal', [-73.5673, 45.5017]],
  ['Moscow', [37.6173, 55.7558]],
  ['Mumbai', [72.8777, 19.076]],
  ['Munich', [11.582, 48.1351]],
  ['Nairobi', [36.8219, -1.2921]],
  ['New York', [-74.006, 40.7128]],
  ['Oslo', [10.7522, 59.9139]],
  ['Osaka', [135.5023, 34.6937]],
  ['Paris', [2.3522, 48.8566]],
  ['Philadelphia', [-75.1652, 39.9526]],
  ['Phoenix', [-112.074, 33.4484]],
  ['Prague', [14.4378, 50.0755]],
  ['Rio de Janeiro', [-43.1729, -22.9068]],
  ['Riyadh', [46.6753, 24.7136]],
  ['Rome', [12.4964, 41.9028]],
  ['San Francisco', [-122.4194, 37.7749]],
  ['Santiago', [-70.6693, -33.4489]],
  ['São Paulo', [-46.6333, -23.5505]],
  ['Seattle', [-122.3321, 47.6062]],
  ['Seoul', [126.978, 37.5665]],
  ['Shanghai', [121.4737, 31.2304]],
  ['Singapore', [103.8198, 1.3521]],
  ['Stockholm', [18.0686, 59.3293]],
  ['Sydney', [151.2093, -33.8688]],
  ['Taipei', [121.5654, 25.033]],
  ['Tel Aviv', [34.7818, 32.0853]],
  ['Tokyo', [139.6917, 35.6895]],
  ['Toronto', [-79.3832, 43.6532]],
  ['Vancouver', [-123.1207, 49.2827]],
  ['Vienna', [16.3738, 48.2082]],
  ['Warsaw', [21.0122, 52.2297]],
  ['Washington', [-77.0369, 38.9072]],
  ['Zurich', [8.5417, 47.3769]],
] satisfies [string, [number, number]][]);

const Lookup = new Map<string, [number, number]>(
  Object.entries(CITIES).map(([name, lonLat]) => [name.toLowerCase(), lonLat]),
);

/**
 * Look up a city's `[longitude, latitude]` by name (case-insensitive).
 *
 * @example
 * ```ts
 * cityLonLat('berlin'); // [13.405, 52.52]
 * ```
 *
 * @param name - The city name.
 */
export function cityLonLat(name: string): [number, number] | null {
  return Lookup.get(name.toLowerCase()) ?? null;
}
