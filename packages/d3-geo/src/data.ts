/**
 * Geo data loading: bundled world-atlas plus configurable remote sources.
 */
export type WorldAtlasResolution = '110m' | '50m' | '10m';

export interface GeoDataConfig {
  /**
   * Base URL for named datasets resolved by {@link geoData}, e.g.
   * `'/geo'` or `'https://example.com/geo'`. No trailing slash needed.
   */
  baseUrl?: string | null;

  /**
   * Full override for URL resolution; takes precedence over `baseUrl`.
   */
  resolver?: ((name: string) => string) | null;

  /**
   * When set, {@link worldAtlas} fetches `countries-<resolution>.json`
   * through the configured source instead of using the bundled data.
   */
  hostWorldAtlas?: boolean;
}

const config: Required<GeoDataConfig> = {
  baseUrl: null,
  resolver: null,
  hostWorldAtlas: false,
};

/**
 * Configure where named geo datasets are loaded from.
 *
 * @remarks
 * Call once at project setup, before any scene constructs a `GeoMap`.
 *
 * @example
 * ```ts
 * configureGeoData({baseUrl: '/geo'});
 * // <GeoMap data={geoData('germany-states')} />  → fetches /geo/germany-states.json
 * ```
 */
export function configureGeoData(options: GeoDataConfig): void {
  Object.assign(config, options);
}

/**
 * Resolve a dataset name to the URL a `GeoMap` should fetch it from.
 *
 * @remarks
 * Pass the result straight to the `data` prop — `GeoMap` fetches and
 * caches URLs itself. Accepts bare names (`'germany-states'`), names with
 * extension, or absolute URLs/paths (returned unchanged).
 */
export function geoData(name: string): string {
  if (/^(https?:)?\/\//.test(name) || name.startsWith('/') || name.startsWith('.')) {
    return name;
  }
  const file = /\.(topo|geo)?json$/.test(name) ? name : `${name}.json`;
  if (config.resolver) {
    return config.resolver(file);
  }
  if (config.baseUrl) {
    return `${config.baseUrl.replace(/\/$/, '')}/${file}`;
  }
  return file;
}

const cache = new Map<string, Promise<object>>();

/**
 * World countries TopoJSON (objects: `countries`, `land`).
 *
 * @remarks
 * Bundled from the `world-atlas` npm package (Natural Earth) and loaded
 * lazily via dynamic import, so scenes without maps don't pay for the
 * data. When `configureGeoData({hostWorldAtlas: true, ...})` is set, the
 * data is fetched from the configured source instead.
 *
 * @param resolution - `'110m'` (small, default), `'50m'` (more detail,
 * better when zooming in on countries), or `'10m'` (full detail, large —
 * for close-ups of coastlines and small islands).
 */
export function worldAtlas(
  resolution: WorldAtlasResolution = '110m',
): Promise<object> {
  const key = `world-atlas:${resolution}:${config.hostWorldAtlas}`;
  let promise = cache.get(key);
  if (!promise) {
    if (config.hostWorldAtlas) {
      promise = fetch(geoData(`countries-${resolution}.json`)).then(response =>
        response.json(),
      );
    } else {
      promise =
        resolution === '50m'
          ? import('world-atlas/countries-50m.json').then(
              module => module.default as object,
            )
          : resolution === '10m'
            ? import('world-atlas/countries-10m.json').then(
                module => module.default as object,
              )
            : import('world-atlas/countries-110m.json').then(
                module => module.default as object,
              );
    }
    cache.set(key, promise);
  }
  return promise;
}
