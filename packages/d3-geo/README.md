# @motion-canvas/d3-geo

Animated 2D maps for Motion Canvas, rendered with [d3-geo](https://github.com/d3/d3-geo).
Fully synchronous at frame time — no tiles, no async work per frame — so output
is deterministic under frame stepping.

## Components

| Component    | Purpose |
| ------------ | ------- |
| `GeoMap`     | The map itself: data, projection, camera (`center`/`zoom`/`roll`, `flyTo`/`flyToFeature`/`zoomFor`), layer styling (`water`, `land`, `borders`, `coast`, `graticule`, `outline`), and `featureFills` (a `{name: fill}` record — the choropleth layer, rendered with LOD). |
| `GeoFeature` | Highlights a region by name/id or GeoJSON object. `reveal` animates a circular color-in wipe. |
| `GeoCircle`  | Geodesic circle region (`at` + `radius` in km). Tween `radius` for range/ripple effects. |
| `GeoLine`    | Great-circle route through waypoints. `start`/`end` animate a draw-on; `progressAt(i)` gives the fraction at waypoint `i`; `pointAt(t)` lets markers ride the line; `bulge` bows each leg for the flight-arc look. |
| `GeoPin`     | Teardrop/dot marker anchored to a location; constant screen size, hides behind the globe. |
| `GeoLabel`   | Text anchored to a location; text defaults to the name passed to `at`. |

Locations accept `[longitude, latitude]`, a city name from the built-in
gazetteer (~90 cities, see `cities.ts`), or a region name from the map data
(resolved to its centroid).

## Quick start

```tsx
import {GeoFeature, GeoLine, GeoMap, GeoPin, worldAtlas} from '@motion-canvas/d3-geo';

const map = createRef<GeoMap>();
view.add(
  <GeoMap
    ref={map}
    data={worldAtlas('50m')}
    size={[1820, 1000]}
    water={'#0e1a2e'}
    land={'#31415a'}
    borders={'#0e1a2e'}
  >
    <GeoFeature feature={'Germany'} fill={'#e8555d'} reveal={0} />
    <GeoPin at={'Berlin'} fill={'white'} />
    <GeoLine points={['Berlin', 'New York']} stroke={'#ffd166'} lineWidth={4} end={0} />
  </GeoMap>,
);

yield* map().flyTo('Berlin', 7, 3); // great-circle flight with zoom-out hop
```

See `render_scene_test/src/scenes/GeoMapTest.tsx` for a full tour including
the orthographic globe, the projection showcase, and shader effects.

## Projections

Ten built-ins by name (`naturalEarth`, `equalEarth`, `mercator`,
`equirectangular`, `orthographic`, `stereographic`, `azimuthalEqualArea`,
`conicEqualArea`, `transverseMercator`, `albersUsa`). Azimuthal projections
rotate the sphere for camera moves (globe behavior); the rest pan.
`albersUsa` is a fixed composite (US + Alaska/Hawaii insets) — the camera
cannot pan, so pair it with `fit`; pins outside its domain hide themselves.
Custom projections plug in directly:

```tsx
import {geoRobinson} from 'd3-geo-projection';
<GeoMap projection={geoRobinson} />
// or with globe-style camera semantics:
<GeoMap projection={{factory: geoSatellite, azimuthal: true}} />
```

## Data

- `worldAtlas('110m' | '50m')` — bundled Natural Earth countries
  (TopoJSON from the `world-atlas` npm package).
- `data` also accepts any TopoJSON/GeoJSON object, promise, or URL.
- `configureGeoData({baseUrl, resolver, hostWorldAtlas})` + `geoData(name)`
  resolve named datasets from a server at runtime.

TopoJSON inputs get interior borders and coastlines via topology meshing and
support automatic simplification; plain GeoJSON renders features only.

**Licensing:** all runtime dependencies are ISC. Natural Earth data is public
domain — free for commercial use, no attribution required. Note that Natural
Earth draws de-facto boundaries; audiences with legally mandated borders
(e.g. India) may need alternative data.

## Performance

Rendering cost is dominated by d3's spherical polygon clipping, not canvas
rasterization. `GeoMap` therefore simplifies detailed topologies to match the
current projection scale (`simplification` signal, default 2px tolerance,
`0` disables) and culls off-screen regions when zoomed in. With the 50m
atlas at 1080p this keeps camera flights at 60fps; without it, world views
cost ~90ms/frame.

Beware the Motion Canvas signal convention: methods named
`get<SignalName>`/`set<SignalName>`/`tween<SignalName>` are hijacked as
signal accessors — never add such methods to these classes.

## Shaders

All geo nodes support the Motion Canvas `shaders` prop (they implement the
cache bounds required for the effect pass). Inline fragment strings cannot
use `#include`; declare the built-ins directly:

```glsl
#version 300 es
precision highp float;

in vec2 sourceUV;
out vec4 outColor;
uniform float time;
uniform sampler2D sourceTexture;

void main() {
  vec4 color = texture(sourceTexture, sourceUV);
  outColor = vec4(color.rgb * (0.8 + 0.2 * sin(time * 4.0)), color.a);
}
```
