/**
 * Bundled world map data from the `world-atlas` package (Natural Earth).
 *
 * @remarks
 * Loaded lazily via dynamic import so scenes that don't use maps don't pay
 * for the data. Pass the returned promise straight to `GeoMap`'s `data`
 * prop — the node awaits it through the dependency system.
 */
export type WorldAtlasResolution = '110m' | '50m';

const cache = new Map<string, Promise<object>>();

/**
 * World countries TopoJSON (objects: `countries`, `land`).
 *
 * @param resolution - `'110m'` (small, default) or `'50m'` (more detail,
 * better when zooming in on countries).
 */
export function worldAtlas(
  resolution: WorldAtlasResolution = '110m',
): Promise<object> {
  let promise = cache.get(resolution);
  if (!promise) {
    promise =
      resolution === '50m'
        ? import('world-atlas/countries-50m.json').then(
            module => module.default as object,
          )
        : import('world-atlas/countries-110m.json').then(
            module => module.default as object,
          );
    cache.set(resolution, promise);
  }
  return promise;
}
