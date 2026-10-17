# @canvas-commons/d3-geo

Animated 2D maps rendered with d3-geo: `GeoMap` (data, projection, camera, and
layer styling) and the nodes anchored to it (`GeoFeature`, `GeoCircle`,
`GeoLine`, `GeoPin`, `GeoLabel`).

See the [root `AGENTS.md`](../../AGENTS.md) for repo-wide standards.

## Commands

```bash
pnpm d3-geo:build                                # tsdown
pnpm d3-geo:test                                 # vitest run (jsdom)
pnpm --filter @canvas-commons/d3-geo run typecheck
pnpm --filter @canvas-commons/d3-geo run lint:pkg
```

## Where things live

```
src/GeoMap.ts        Data loading, layers, LOD simplification, culling, camera.
src/Geo*.ts          Nodes drawn in the map's local space.
src/geometry.ts      sanitizePolygons: winding and degenerate-ring cleanup.
src/path.ts          Projects geo objects into a Path2D.
src/projections.ts   Built-in projections and their camera semantics.
src/data.ts          worldAtlas, configureGeoData, geoData.
src/cities.ts        The built-in gazetteer.
```

## Traps

**d3 reads polygon winding on the sphere.** A polygon wound the RFC 7946 way
covers the whole sphere except itself. All map data goes through
`sanitizePolygons`; keep it that way for any new geometry source.

**Frame time must stay synchronous.** Data loads through
`DependencyContext.collectPromise`, so the scene waits for it; nothing may fetch
or await while drawing. Tests that load data from a promise must
`await DependencyContext.consumePromises()` before they end, or the next scene
reset fails.

**Composite projections have no camera.** `albersUsa` has no `rotate`, `center`,
or `clipExtent`; guard calls to them with optional chaining.

**jsdom has no `Path2D`.** The tests install a recording stand-in
(`src/__tests__/recordingPath2D.ts`) that lets them inspect generated paths.

**`world-atlas` JSON is typed by `src/world-atlas.d.ts`.** `resolveJsonModule`
is off so TypeScript doesn't infer types from the multi-megabyte files.
