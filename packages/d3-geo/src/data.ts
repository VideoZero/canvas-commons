import type {Objects, Topology} from 'topojson-specification';

/**
 * A TopoJSON topology.
 */
export type GeoTopology = Topology<Objects>;

export type WorldAtlasResolution = '110m' | '50m' | '10m';

export interface GeoDataConfig {
  /**
   * The base URL of the named datasets resolved by {@link geoData}, for
   * example `'/geo'`.
   */
  baseUrl?: string | null;

  /**
   * A custom URL resolver. Takes precedence over `baseUrl`.
   */
  resolver?: ((name: string) => string) | null;

  /**
   * Whether {@link worldAtlas} fetches `countries-<resolution>.json` through
   * the configured source instead of using the bundled data.
   */
  hostWorldAtlas?: boolean;
}

const Config: Required<GeoDataConfig> = {
  baseUrl: null,
  resolver: null,
  hostWorldAtlas: false,
};

/**
 * Check whether a value is a TopoJSON topology.
 *
 * @example
 * ```ts
 * if (isTopology(json)) console.log(Object.keys(json.objects));
 * ```
 *
 * @param value - The value to check.
 */
export function isTopology(value: unknown): value is GeoTopology {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    value.type === 'Topology' &&
    'objects' in value &&
    typeof value.objects === 'object' &&
    value.objects !== null &&
    'arcs' in value &&
    Array.isArray(value.arcs)
  );
}

/**
 * Configure where named geo datasets are loaded from.
 *
 * @remarks
 * Call it once during project setup, before any scene creates a `GeoMap`.
 *
 * @example
 * ```ts
 * configureGeoData({baseUrl: '/geo'});
 * // <GeoMap data={geoData('germany-states')} /> fetches /geo/germany-states.json
 * ```
 *
 * @param options - The options to change.
 */
export function configureGeoData(options: GeoDataConfig): void {
  Object.assign(Config, options);
}

/**
 * Resolve a dataset name to the URL that a `GeoMap` should fetch.
 *
 * @remarks
 * Accepts bare names (`'germany-states'`), names with an extension, and
 * absolute URLs or paths, which are returned unchanged. Pass the result to
 * the `data` property; `GeoMap` fetches and caches URLs itself.
 *
 * @example
 * ```tsx
 * <GeoMap data={geoData('germany-states')} />
 * ```
 *
 * @param name - The dataset name or URL.
 */
export function geoData(name: string): string {
  if (
    /^(https?:)?\/\//.test(name) ||
    name.startsWith('/') ||
    name.startsWith('.')
  ) {
    return name;
  }
  const file = /\.(topo|geo)?json$/.test(name) ? name : `${name}.json`;
  if (Config.resolver) {
    return Config.resolver(file);
  }
  if (Config.baseUrl) {
    return `${Config.baseUrl.replace(/\/$/, '')}/${file}`;
  }
  return file;
}

const WorldAtlasCache = new Map<string, Promise<GeoTopology>>();

async function fetchTopology(url: string): Promise<GeoTopology> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  const json: unknown = await response.json();
  if (!isTopology(json)) {
    throw new Error(`"${url}" is not a TopoJSON topology.`);
  }
  return json;
}

function importWorldAtlas(resolution: WorldAtlasResolution) {
  switch (resolution) {
    case '50m':
      return import('world-atlas/countries-50m.json');
    case '10m':
      return import('world-atlas/countries-10m.json');
    default:
      return import('world-atlas/countries-110m.json');
  }
}

/**
 * The world countries as a TopoJSON topology with the `countries` and `land`
 * objects.
 *
 * @remarks
 * The Natural Earth data of the `world-atlas` package is imported lazily, so
 * scenes without maps don't pay for it. With
 * `configureGeoData({hostWorldAtlas: true})`, the data is fetched from the
 * configured source instead.
 *
 * @example
 * ```tsx
 * <GeoMap data={worldAtlas('50m')} size={[1600, 900]} />
 * ```
 *
 * @param resolution - `'110m'` (small, the default), `'50m'` (more detail
 *                     for zooming in on countries), or `'10m'` (full detail,
 *                     large).
 */
export function worldAtlas(
  resolution: WorldAtlasResolution = '110m',
): Promise<GeoTopology> {
  const key = `${resolution}:${Config.hostWorldAtlas}`;
  let promise = WorldAtlasCache.get(key);
  if (!promise) {
    promise = Config.hostWorldAtlas
      ? fetchTopology(geoData(`countries-${resolution}.json`))
      : importWorldAtlas(resolution).then(module => module.default);
    WorldAtlasCache.set(key, promise);
  }
  return promise;
}
