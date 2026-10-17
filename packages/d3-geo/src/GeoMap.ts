import {
  CanvasStyleSignal,
  PossibleCanvasStyle,
  Rect,
  RectProps,
  canvasStyleParser,
  canvasStyleSignal,
  computed,
  initial,
  nodeName,
  resolveCanvasStyle,
  signal,
  vector2Signal,
} from '@canvas-commons/2d';
import {
  DependencyContext,
  PossibleVector2,
  SignalValue,
  SimpleSignal,
  TimingFunction,
  Vector2,
  Vector2Signal,
  easeInOutCubic,
  threadable,
  tween,
} from '@canvas-commons/core';
import {
  GeoProjection,
  geoBounds,
  geoCentroid,
  geoDistance,
  geoGraticule,
  geoInterpolate,
} from 'd3-geo';
import type {Feature, MultiLineString} from 'geojson';
import {feature, merge, mesh} from 'topojson-client';
import {presimplify, simplify, sphericalTriangleArea} from 'topojson-simplify';
import type {
  GeometryCollection,
  GeometryObject,
  MultiPolygon,
  Polygon,
} from 'topojson-specification';
import {cityLonLat} from './cities';
import {GeoTopology, isTopology} from './data';
import {GeoObject, sanitizePolygons} from './geometry';
import {projectToPath} from './path';
import {PossibleProjection, resolveProjection} from './projections';

/**
 * Map data accepted by {@link GeoMap}: a TopoJSON topology or GeoJSON
 * FeatureCollection — given directly, as a promise, or as a URL to fetch.
 */
export type GeoDataInput = string | object | Promise<object>;

interface GeoLayers {
  /**
   * The individual region features (countries, states, ...).
   */
  features: Feature[];
  /**
   * The merged landmass for a single fill.
   */
  land: GeoObject | null;
  /**
   * The interior borders between regions.
   */
  borders: MultiLineString | null;
  /**
   * The outer coastline: edges not shared between regions.
   */
  coast: MultiLineString | null;
  /**
   * Whether the data covers the whole world and should fit the sphere.
   */
  world: boolean;
  /**
   * The geometries of the region layer in the (simplified) source topology,
   * index-aligned with `features`.
   */
  source?: {topology: GeoTopology; geometries: GeometryObject[]};
}

type CulledLayers = Pick<GeoLayers, 'land' | 'borders' | 'coast'>;

interface SphericalRegion {
  center: [number, number];
  radius: number;
}

interface PendingData {
  value: GeoTopology | GeoObject | null;
  error: unknown;
  settled: Promise<unknown>;
}

const GeoTypes = new Set([
  'Point',
  'MultiPoint',
  'LineString',
  'MultiLineString',
  'Polygon',
  'MultiPolygon',
  'GeometryCollection',
  'Feature',
  'FeatureCollection',
  'Sphere',
]);

function isGeoObject(value: unknown): value is GeoObject {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    typeof value.type === 'string' &&
    GeoTypes.has(value.type)
  );
}

function toMapData(value: unknown): GeoTopology | GeoObject {
  if (isTopology(value) || isGeoObject(value)) {
    return value;
  }
  throw new Error('GeoMap: map data must be TopoJSON or GeoJSON.');
}

function isPolygonObject(
  object: GeometryObject,
): object is Polygon | MultiPolygon {
  return object.type === 'Polygon' || object.type === 'MultiPolygon';
}

function memberGeometries(object: GeometryObject): GeometryObject[] {
  return object.type === 'GeometryCollection' ? object.geometries : [object];
}

function toFeatures(object: GeoObject): Feature[] {
  switch (object.type) {
    case 'FeatureCollection':
      return object.features;
    case 'Feature':
      return [object];
    case 'Sphere':
      return [];
    default:
      return [{type: 'Feature', geometry: object, properties: null}];
  }
}

function track(promise: Promise<unknown>): PendingData {
  const entry: PendingData = {
    value: null,
    error: null,
    settled: Promise.resolve(),
  };
  entry.settled = promise.then(
    value => {
      try {
        entry.value = toMapData(value);
      } catch (error) {
        entry.error = error;
      }
    },
    error => {
      entry.error = error ?? 'unknown error';
    },
  );
  return entry;
}

export interface GeoMapProps extends RectProps {
  /**
   * Map data: TopoJSON topology or GeoJSON FeatureCollection, a promise of
   * one, or a URL string to fetch it from.
   */
  data?: SignalValue<GeoDataInput | null>;

  /**
   * Name of the topology object holding the region features.
   *
   * @remarks
   * Defaults to `'countries'` when present, otherwise the first object in
   * the topology. Ignored for plain GeoJSON data.
   */
  layer?: SignalValue<string | null>;

  /**
   * The projection to render the map with: a built-in kind by name, a bare
   * projection factory (e.g. `geoRobinson` from `d3-geo-projection`), or a
   * `{factory, azimuthal}` definition.
   */
  projection?: SignalValue<PossibleProjection>;

  /**
   * The `[longitude, latitude]` the camera looks at.
   */
  center?: SignalValue<PossibleVector2>;

  /**
   * Camera roll in degrees (rotation around the view axis).
   */
  roll?: SignalValue<number>;

  /**
   * Camera zoom factor; `1` shows the fitted extent.
   */
  zoom?: SignalValue<number>;

  /**
   * What to fit into the node at zoom 1: a feature name from the data, a
   * GeoJSON object, or `null` for the whole dataset (sphere for world data).
   */
  fit?: SignalValue<string | GeoObject | null>;

  /**
   * Padding in pixels around the fitted extent at zoom 1.
   */
  fitPadding?: SignalValue<number>;

  /**
   * Geometry simplification tolerance in pixels for rendering; `0` disables.
   *
   * @remarks
   * Detailed datasets (e.g. the 50m world atlas) are automatically
   * simplified to match the current projection scale, keeping camera
   * animation fast without visible quality loss. Highlighted features
   * always render at full detail.
   */
  simplification?: SignalValue<number>;

  /**
   * Number of half-octave LOD levels above the base scale to prebuild
   * along with the first one, so zoom flights don't pay level-build
   * hitches mid-animation.
   *
   * @remarks
   * The default (`6`) covers camera zooms up to ~8×; deeper zooms build
   * lazily. `0` disables prewarming.
   */
  lodPrewarm?: SignalValue<number>;

  water?: SignalValue<PossibleCanvasStyle>;
  land?: SignalValue<PossibleCanvasStyle>;
  borders?: SignalValue<PossibleCanvasStyle>;
  bordersWidth?: SignalValue<number>;
  graticule?: SignalValue<PossibleCanvasStyle>;
  graticuleWidth?: SignalValue<number>;
  /**
   * Grid spacing of the graticule in degrees; a single number applies to
   * both axes.
   */
  graticuleStep?: SignalValue<number | [number, number]>;
  /**
   * Stroke style of the outer coastline (where land meets ocean).
   */
  coast?: SignalValue<PossibleCanvasStyle>;
  coastWidth?: SignalValue<number>;

  /**
   * Per-region fills keyed by feature name or id — the choropleth layer.
   *
   * @remarks
   * Rendered between the land fill and the borders using the same
   * level-of-detail pipeline as the base map, so coloring every country
   * stays fast. For animated single-region highlights prefer `GeoFeature`.
   *
   * @example
   * ```tsx
   * <GeoMap featureFills={{Germany: '#e8555d', France: '#4666ff'}} />
   * ```
   */
  featureFills?: SignalValue<Record<string, PossibleCanvasStyle>>;
  /**
   * Per-region strokes keyed by feature name or id — outlines for the
   * choropleth layer, drawn above borders and coast.
   */
  featureStrokes?: SignalValue<Record<string, PossibleCanvasStyle>>;
  featureStrokeWidth?: SignalValue<number>;
  outline?: SignalValue<PossibleCanvasStyle>;
  outlineWidth?: SignalValue<number>;
}

/**
 * A 2D map rendered with d3-geo.
 *
 * @remarks
 * Renders synchronously into the scene canvas — no tiles, no async work at
 * frame time — so it is fully deterministic under frame stepping. The camera
 * is defined by the `center`/`zoom` signals; tween them directly or use
 * {@link flyTo} for a great-circle camera flight.
 *
 * Region highlights and pins are child nodes: see `GeoFeature` and `GeoPin`.
 *
 * @example
 * ```tsx
 * const map = createRef<GeoMap>();
 * view.add(
 *   <GeoMap
 *     ref={map}
 *     data={worldAtlas()}
 *     size={[1600, 900]}
 *     water={'#0b1526'}
 *     land={'#2b3a4d'}
 *     borders={'#0b1526'}
 *   >
 *     <GeoFeature feature={'Germany'} fill={'#e8555d'} />
 *     <GeoPin at={'Berlin'} fill={'#ffffff'} />
 *   </GeoMap>,
 * );
 * yield* map().flyTo('Berlin', 6, 3);
 * ```
 */
@nodeName('GeoMap')
export class GeoMap extends Rect {
  @initial(null)
  @signal()
  declare public readonly data: SimpleSignal<GeoDataInput | null, this>;

  @initial(null)
  @signal()
  declare public readonly layer: SimpleSignal<string | null, this>;

  @initial('naturalEarth')
  @signal()
  declare public readonly projection: SimpleSignal<PossibleProjection, this>;

  @initial(0)
  @signal()
  declare public readonly roll: SimpleSignal<number, this>;

  @initial(Vector2.zero)
  @vector2Signal('center')
  declare public readonly center: Vector2Signal<this>;

  @initial(1)
  @signal()
  declare public readonly zoom: SimpleSignal<number, this>;

  @initial(null)
  @signal()
  declare public readonly fit: SimpleSignal<string | GeoObject | null, this>;

  @initial(0)
  @signal()
  declare public readonly fitPadding: SimpleSignal<number, this>;

  @initial(2)
  @signal()
  declare public readonly simplification: SimpleSignal<number, this>;

  @initial(6)
  @signal()
  declare public readonly lodPrewarm: SimpleSignal<number, this>;

  @canvasStyleSignal()
  declare public readonly water: CanvasStyleSignal<this>;

  @canvasStyleSignal()
  declare public readonly land: CanvasStyleSignal<this>;

  @canvasStyleSignal()
  declare public readonly borders: CanvasStyleSignal<this>;

  @initial(1)
  @signal()
  declare public readonly bordersWidth: SimpleSignal<number, this>;

  @canvasStyleSignal()
  declare public readonly graticule: CanvasStyleSignal<this>;

  @initial(1)
  @signal()
  declare public readonly graticuleWidth: SimpleSignal<number, this>;

  @initial(10)
  @signal()
  declare public readonly graticuleStep: SimpleSignal<
    number | [number, number],
    this
  >;

  @canvasStyleSignal()
  declare public readonly coast: CanvasStyleSignal<this>;

  @initial(1)
  @signal()
  declare public readonly coastWidth: SimpleSignal<number, this>;

  @initial({})
  @signal()
  declare public readonly featureFills: SimpleSignal<
    Record<string, PossibleCanvasStyle>,
    this
  >;

  @initial({})
  @signal()
  declare public readonly featureStrokes: SimpleSignal<
    Record<string, PossibleCanvasStyle>,
    this
  >;

  @initial(1)
  @signal()
  declare public readonly featureStrokeWidth: SimpleSignal<number, this>;

  @canvasStyleSignal()
  declare public readonly outline: CanvasStyleSignal<this>;

  @initial(2)
  @signal()
  declare public readonly outlineWidth: SimpleSignal<number, this>;

  private static readonly urlPool = new Map<string, PendingData>();
  private static readonly promisePool = new WeakMap<
    Promise<object>,
    PendingData
  >();

  public constructor(props: GeoMapProps) {
    super({clip: true, ...props});
  }

  /**
   * The resolved map data, or `null` while it is still loading.
   */
  @computed()
  public geoData(): GeoTopology | GeoObject | null {
    const raw = this.data();
    if (raw === null) {
      return null;
    }

    let entry: PendingData | undefined;
    let description: string;
    if (typeof raw === 'string') {
      description = `failed to load map data from "${raw}"`;
      entry = GeoMap.urlPool.get(raw);
      if (!entry) {
        entry = track(
          fetch(raw).then(response => {
            if (!response.ok) {
              throw new Error(`${response.status} ${response.statusText}`);
            }
            return response.json();
          }),
        );
        GeoMap.urlPool.set(raw, entry);
      }
    } else if (raw instanceof Promise) {
      description = 'map data promise rejected';
      entry = GeoMap.promisePool.get(raw);
      if (!entry) {
        entry = track(raw);
        GeoMap.promisePool.set(raw, entry);
      }
    } else {
      return toMapData(raw);
    }

    if (entry.error !== null) {
      throw new Error(`GeoMap: ${description}: ${entry.error}`);
    }
    if (entry.value === null) {
      DependencyContext.collectPromise(entry.settled);
    }
    return entry.value;
  }

  private buildLayers(data: GeoTopology | GeoObject): GeoLayers {
    if (data.type === 'Topology') {
      const objects = data.objects;
      const layerName =
        this.layer() ??
        ('countries' in objects ? 'countries' : Object.keys(objects)[0]);
      const object: GeometryObject | undefined = objects[layerName];
      if (!object) {
        return {
          features: [],
          land: null,
          borders: null,
          coast: null,
          world: false,
        };
      }
      // Topology winding is trusted; only degenerate rings left behind by
      // simplification need cleanup, which keeps LOD builds cheap.
      const features = toFeatures(
        sanitizePolygons(feature(data, object), false),
      );
      const landObject: GeometryObject | undefined = objects.land;
      const land = landObject
        ? sanitizePolygons(feature(data, landObject), false)
        : sanitizePolygons(
            merge(data, memberGeometries(object).filter(isPolygonObject)),
          );
      return {
        features,
        land,
        borders: mesh(data, object, (a, b) => a !== b),
        coast: mesh(data, object, (a, b) => a === b),
        world: landObject !== undefined || layerName === 'countries',
        source: {topology: data, geometries: memberGeometries(object)},
      };
    }

    // Sanitizing also rewinds RFC 7946 GeoJSON, which d3 would otherwise
    // read as the complement of each polygon.
    const collection = sanitizePolygons(data);
    return {
      features: toFeatures(collection),
      land: collection,
      borders: null,
      coast: null,
      world: false,
    };
  }

  @computed()
  private layers(): GeoLayers | null {
    const data = this.geoData();
    return data ? this.buildLayers(data) : null;
  }

  /**
   * The raw topology with per-vertex simplification weights, used to derive
   * LOD variants for rendering. `null` for plain GeoJSON data.
   */
  @computed()
  private presimplified(): GeoTopology | null {
    const data = this.geoData();
    if (!data || data.type !== 'Topology' || this.simplification() <= 0) {
      return null;
    }
    return presimplify(data, sphericalTriangleArea);
  }

  /**
   * The projection scale quantized to half-octaves: the LOD level.
   */
  @computed()
  private lodStep(): number | null {
    const projection = this.projector();
    return projection
      ? Math.round(Math.log2(projection.scale()) * 2) / 2
      : null;
  }

  /**
   * The cache of LOD-simplified layers, recreated whenever the source data or
   * layer changes so stale geometry can never leak across datasets.
   */
  @computed()
  private lodStore(): Map<string, GeoLayers> {
    this.geoData();
    this.layer();
    return new Map();
  }

  /**
   * The single-entry cache of the culled land, borders, and coast, recreated
   * whenever the source data or layer changes.
   */
  @computed()
  private culledStore(): Map<string, CulledLayers> {
    this.geoData();
    this.layer();
    return new Map();
  }

  /**
   * The layers simplified for the current projection scale.
   *
   * @remarks
   * The scale is quantized to half-octaves and each level is built once and
   * cached, so camera tweens only pay the path-generation cost per frame.
   */
  @computed()
  private renderLayers(): GeoLayers | null {
    const raw = this.layers();
    const pre = this.presimplified();
    const step = this.lodStep();
    if (!raw || !pre || step === null) {
      return raw;
    }
    const pixels = this.simplification();
    const key = `${pixels}:${step}`;
    const cache = this.lodStore();
    let lod = cache.get(key);
    if (!lod) {
      const build = (level: number) =>
        this.buildLayers(simplify(pre, (pixels / 2 ** level) ** 2));
      if (cache.size === 0) {
        // Prewarm deeper levels with the first build so that camera zooms
        // don't hit level-build hitches mid-flight.
        for (let extra = this.lodPrewarm() / 2; extra >= 0.5; extra -= 0.5) {
          cache.set(`${pixels}:${step + extra}`, build(step + extra));
        }
      }
      lod = build(step);
      cache.set(key, lod);
    }
    return lod;
  }

  /**
   * The bounding spherical cap of each raw feature, index-aligned with the
   * topology's geometries. Used for viewport culling.
   */
  @computed()
  private featureRegions(): SphericalRegion[] | null {
    const raw = this.layers();
    if (!raw || !raw.source) {
      return null;
    }
    return raw.features.map(item => {
      const center = geoCentroid(item);
      const [[west, south], [east, north]] = geoBounds(item);
      let radius = 0;
      for (const point of [
        [west, south],
        [west, north],
        [east, south],
        [east, north],
      ] satisfies [number, number][]) {
        radius = Math.max(radius, geoDistance(center, point));
      }
      return {center, radius};
    });
  }

  /**
   * The view cap when it is small enough for viewport culling to pay off,
   * `null` otherwise.
   */
  @computed()
  private cullingView(): SphericalRegion | null {
    const view = this.viewRegion();
    return view && view.radius <= Math.PI / 3 ? view : null;
  }

  /**
   * The visible portion of the map as a spherical cap, or `null` when it
   * cannot be determined (for example when the whole globe is in view).
   */
  @computed()
  private viewRegion(): SphericalRegion | null {
    const projection = this.projector();
    if (!projection || !projection.invert) {
      return null;
    }
    const size = this.computedSize();
    const center = this.center();
    const centerLonLat: [number, number] = [center.x, center.y];
    let radius = 0;
    for (const [fx, fy] of [
      [0, 0],
      [0.5, 0],
      [1, 0],
      [0, 0.5],
      [1, 0.5],
      [0, 1],
      [0.5, 1],
      [1, 1],
    ]) {
      const point: [number, number] = [
        -size.x / 2 + size.x * fx,
        -size.y / 2 + size.y * fy,
      ];
      const inverted = projection.invert(point);
      if (!inverted || !inverted.every(isFinite)) {
        return null;
      }
      // Inversion can report a false hit for points outside the projection,
      // such as beyond the horizon of a globe, so verify the round trip.
      const roundTrip = projection(inverted);
      if (
        !roundTrip ||
        Math.hypot(roundTrip[0] - point[0], roundTrip[1] - point[1]) > 0.5
      ) {
        return null;
      }
      radius = Math.max(radius, geoDistance(centerLonLat, inverted));
    }
    return {center: centerLonLat, radius};
  }

  /**
   * The land, borders, and coast rebuilt from only the features that can
   * intersect the current view.
   *
   * @remarks
   * d3's spherical clipping processes every point of a geometry each frame
   * even when it ends up off-screen, so at higher zooms path generation over
   * world-sized meshes dominates the frame. Returns `null`, meaning the full
   * layers, when culling isn't possible or wouldn't pay off.
   */
  private culledLayers(layers: GeoLayers): CulledLayers | null {
    const source = layers.source;
    const view = this.cullingView();
    const regions = this.featureRegions();
    if (
      !source ||
      !view ||
      !regions ||
      regions.length !== source.geometries.length
    ) {
      return null;
    }
    const visible: number[] = [];
    for (let i = 0; i < regions.length; i++) {
      if (
        geoDistance(view.center, regions[i].center) <
        view.radius + regions[i].radius
      ) {
        visible.push(i);
      }
    }
    // Built from the current LOD topology, so the key must include the LOD
    // step; otherwise the layers could render at mixed detail levels.
    const key = `${this.simplification()}:${this.lodStep()}:${visible.join(',')}`;
    const cache = this.culledStore();
    let culled = cache.get(key);
    if (culled === undefined) {
      const subset = visible.map(i => source.geometries[i]);
      const collection: GeometryCollection = {
        type: 'GeometryCollection',
        geometries: subset,
      };
      culled = {
        land: sanitizePolygons(
          merge(source.topology, subset.filter(isPolygonObject)),
        ),
        borders: mesh(source.topology, collection, (a, b) => a !== b),
        coast: mesh(source.topology, collection, (a, b) => a === b),
      };
      cache.clear();
      cache.set(key, culled);
    }
    return culled;
  }

  /**
   * Look up a region feature by `properties.name` (case-insensitive) or id.
   */
  public featureByName(name: string | number): Feature | null {
    const layers = this.layers();
    if (!layers) {
      return null;
    }
    const query = String(name).toLowerCase();
    return (
      layers.features.find(
        item =>
          String(item.id).toLowerCase() === query ||
          String(item.properties?.name ?? '').toLowerCase() === query,
      ) ?? null
    );
  }

  /**
   * Resolve a location to `[longitude, latitude]`: accepts coordinates, a
   * city name from the built-in gazetteer, or a region name from the data
   * (resolved to its centroid).
   */
  public resolveLonLat(location: string | PossibleVector2): Vector2 {
    if (typeof location === 'string') {
      const city = cityLonLat(location);
      if (city) {
        return new Vector2(city);
      }
      const found = this.featureByName(location);
      if (found) {
        return new Vector2(geoCentroid(found));
      }
      if (this.geoData() === null) {
        // Data still loading — resolve quietly; dependents re-evaluate
        // once the data arrives.
        return Vector2.zero;
      }
      throw new Error(`GeoMap: unknown location "${location}".`);
    }
    return new Vector2(location);
  }

  @computed()
  private fitObject(): GeoObject {
    const fit = this.fit();
    if (fit !== null) {
      if (typeof fit === 'string') {
        const found = this.featureByName(fit);
        if (found) {
          return found;
        }
        if (this.geoData() === null) {
          // Data still loading — fit the sphere for now; recomputed once
          // the data arrives.
          return {type: 'Sphere'};
        }
        throw new Error(`GeoMap: unknown fit target "${fit}".`);
      }
      return fit;
    }

    const layers = this.layers();
    if (layers && !layers.world && layers.land) {
      return layers.land;
    }
    return {type: 'Sphere'};
  }

  /**
   * The configured d3 projection for the current camera state, or `null`
   * until the node has a size.
   */
  @computed()
  public projector(): GeoProjection | null {
    const size = this.computedSize();
    if (size.x === 0 || size.y === 0) {
      return null;
    }

    const definition = resolveProjection(this.projection());
    const projection = definition.factory();
    const padding = this.fitPadding();
    // Composite projections (albersUsa) have no rotate/center/clipExtent;
    // for those the camera is fixed and only fit/zoom apply.
    projection.rotate?.([0, 0, 0]);
    projection.center?.([0, 0]);
    projection.fitExtent(
      [
        [-size.x / 2 + padding, -size.y / 2 + padding],
        [size.x / 2 - padding, size.y / 2 - padding],
      ],
      this.fitObject(),
    );

    const center = this.center();
    const roll = this.roll();
    if (projection.rotate) {
      if (definition.azimuthal) {
        projection.rotate([-center.x, -center.y, roll]);
      } else {
        projection.rotate([-center.x, 0, roll]);
        projection.center?.([0, center.y]);
      }
    }
    projection.scale(projection.scale() * this.zoom());
    projection.clipExtent?.([
      [-size.x / 2, -size.y / 2],
      [size.x / 2, size.y / 2],
    ]);
    return projection;
  }

  /**
   * Project `[longitude, latitude]` into this node's local space.
   *
   * @returns `null` while data/size are unresolved or when the point is
   * clipped away (e.g. on the far side of an orthographic globe).
   */
  public projectPoint(location: string | PossibleVector2): Vector2 | null {
    const projection = this.projector();
    if (!projection) {
      return null;
    }
    const lonLat = this.resolveLonLat(location);
    if (!this.isPointVisible(lonLat)) {
      return null;
    }
    const projected = projection([lonLat.x, lonLat.y]);
    return projected ? new Vector2(projected) : null;
  }

  /**
   * Whether a location is on the camera-facing side of the globe.
   *
   * @remarks
   * Always `true` for non-azimuthal projections. For azimuthal ones the
   * visible cap is set by the projection's own clip angle (90° for
   * orthographic, 142° for stereographic, ~180° for azimuthal equal-area).
   */
  public isPointVisible(location: string | PossibleVector2): boolean {
    if (!resolveProjection(this.projection()).azimuthal) {
      return true;
    }
    const clipAngle = this.projector()?.clipAngle?.() ?? null;
    if (clipAngle === null) {
      return true;
    }
    const lonLat = this.resolveLonLat(location);
    const center = this.center();
    return (
      geoDistance([lonLat.x, lonLat.y], [center.x, center.y]) <
      (clipAngle * Math.PI) / 180 + 1e-6
    );
  }

  /**
   * The projected position of a location in this node's local space,
   * regardless of visibility.
   *
   * @returns `Vector2.zero` while data/size are unresolved or when the
   * projection cannot represent the point.
   */
  public geoPosition(location: string | PossibleVector2): Vector2 {
    const projection = this.projector();
    if (!projection) {
      return Vector2.zero;
    }
    const lonLat = this.resolveLonLat(location);
    const projected = projection([lonLat.x, lonLat.y]);
    return projected ? new Vector2(projected) : Vector2.zero;
  }

  /**
   * Whether an anchored node at this location should be shown: on the
   * camera-facing side of a globe and representable by the projection
   * (composite projections like albersUsa cannot project points outside
   * their domain).
   */
  public isLocationVisible(location: string | PossibleVector2): boolean {
    if (!this.isPointVisible(location)) {
      return false;
    }
    const projection = this.projector();
    if (!projection) {
      return true;
    }
    const lonLat = this.resolveLonLat(location);
    return projection([lonLat.x, lonLat.y]) !== null;
  }

  private renderPath(object: GeoObject): Path2D {
    const projection = this.projector();
    return projection ? projectToPath(projection, object) : new Path2D();
  }

  @computed()
  private spherePath(): Path2D {
    return this.renderPath({type: 'Sphere'});
  }

  @computed()
  private graticulePath(): Path2D {
    const step = this.graticuleStep();
    const [stepX, stepY] = typeof step === 'number' ? [step, step] : step;
    return this.renderPath(geoGraticule().step([stepX, stepY])());
  }

  @computed()
  private coastPath(): Path2D | null {
    const layers = this.renderLayers();
    if (!layers?.coast) {
      return null;
    }
    const culled = this.culledLayers(layers);
    return this.renderPath(culled?.coast ?? layers.coast);
  }

  /**
   * LOD feature positions indexed by lower-cased name and id.
   */
  @computed()
  private featureIndex(): Map<string, number[]> {
    const index = new Map<string, number[]>();
    const layers = this.renderLayers();
    if (!layers) {
      return index;
    }
    for (let i = 0; i < layers.features.length; i++) {
      const item = layers.features[i];
      for (const key of [
        String(item.id ?? '').toLowerCase(),
        String(item.properties?.name ?? '').toLowerCase(),
      ]) {
        if (!key) {
          continue;
        }
        const list = index.get(key);
        if (list) {
          list.push(i);
        } else {
          index.set(key, [i]);
        }
      }
    }
    return index;
  }

  private featurePathsFor(
    record: Record<string, PossibleCanvasStyle>,
  ): {style: PossibleCanvasStyle; path: Path2D}[] {
    const entries = Object.entries(record);
    if (entries.length === 0) {
      return [];
    }
    const layers = this.renderLayers();
    const index = this.featureIndex();
    const projection = this.projector();
    if (!layers || !projection) {
      return [];
    }
    const view = this.cullingView();
    const regions = this.featureRegions();
    const cull =
      view && regions && regions.length === layers.features.length
        ? (i: number) =>
            geoDistance(view.center, regions[i].center) >=
            view.radius + regions[i].radius
        : () => false;
    const result: {style: PossibleCanvasStyle; path: Path2D}[] = [];
    for (const [name, style] of entries) {
      const indices = index.get(name.toLowerCase());
      if (!indices) {
        continue;
      }
      // Skip features that cannot intersect the view; d3's clipping would
      // still walk all of their points otherwise.
      const visible = indices
        .filter(i => !cull(i))
        .map(i => layers.features[i]);
      if (visible.length > 0) {
        result.push({style, path: projectToPath(projection, ...visible)});
      }
    }
    return result;
  }

  @computed()
  private featureFillPaths(): {style: PossibleCanvasStyle; path: Path2D}[] {
    return this.featurePathsFor(this.featureFills());
  }

  @computed()
  private featureStrokePaths(): {style: PossibleCanvasStyle; path: Path2D}[] {
    return this.featurePathsFor(this.featureStrokes());
  }

  @computed()
  private landPath(): Path2D | null {
    const layers = this.renderLayers();
    if (!layers?.land) {
      return null;
    }
    const culled = this.culledLayers(layers);
    return this.renderPath(culled?.land ?? layers.land);
  }

  @computed()
  private bordersPath(): Path2D | null {
    const layers = this.renderLayers();
    if (!layers?.borders) {
      return null;
    }
    const culled = this.culledLayers(layers);
    return this.renderPath(culled?.borders ?? layers.borders);
  }

  protected override draw(context: CanvasRenderingContext2D) {
    this.drawShape(context);

    context.save();
    context.clip(this.getPath());

    const water = this.water();
    if (water !== null) {
      context.fillStyle = resolveCanvasStyle(water, context);
      context.fill(this.spherePath());
    }

    const graticule = this.graticule();
    if (graticule !== null) {
      context.strokeStyle = resolveCanvasStyle(graticule, context);
      context.lineWidth = this.graticuleWidth();
      context.stroke(this.graticulePath());
    }

    const land = this.land();
    const landPath = this.landPath();
    if (land !== null && landPath) {
      context.fillStyle = resolveCanvasStyle(land, context);
      context.fill(landPath);
    }

    for (const {style, path} of this.featureFillPaths()) {
      context.fillStyle = resolveCanvasStyle(canvasStyleParser(style), context);
      context.fill(path);
    }

    const borders = this.borders();
    const bordersPath = this.bordersPath();
    if (borders !== null && bordersPath) {
      context.strokeStyle = resolveCanvasStyle(borders, context);
      context.lineWidth = this.bordersWidth();
      context.lineJoin = 'round';
      context.lineCap = 'round';
      context.stroke(bordersPath);
    }

    const coast = this.coast();
    const coastPath = this.coastPath();
    if (coast !== null && coastPath) {
      context.strokeStyle = resolveCanvasStyle(coast, context);
      context.lineWidth = this.coastWidth();
      context.lineJoin = 'round';
      context.lineCap = 'round';
      context.stroke(coastPath);
    }

    for (const {style, path} of this.featureStrokePaths()) {
      context.strokeStyle = resolveCanvasStyle(
        canvasStyleParser(style),
        context,
      );
      context.lineWidth = this.featureStrokeWidth();
      context.lineJoin = 'round';
      context.lineCap = 'round';
      context.stroke(path);
    }

    const outline = this.outline();
    if (outline !== null) {
      context.strokeStyle = resolveCanvasStyle(outline, context);
      context.lineWidth = this.outlineWidth();
      context.stroke(this.spherePath());
    }

    context.restore();

    if (this.clip()) {
      context.clip(this.getPath());
    }
    this.drawChildren(context);
  }

  /**
   * Fly the camera to a location along a great circle, optionally changing
   * zoom, with a distance-proportional zoom-out "hop" in between.
   *
   * @param location - Target as `[longitude, latitude]`, a city name, or a
   * region name (flies to its centroid).
   * @param zoom - Target zoom; keeps the current zoom when omitted.
   * @param duration - Flight duration in seconds.
   * @param timing - Timing function for the flight.
   *
   * @example
   * ```ts
   * yield* map().flyTo('Tokyo', 5, 3);
   * ```
   */
  @threadable()
  public *flyTo(
    location: string | PossibleVector2,
    zoom: number | null = null,
    duration = 3,
    timing: TimingFunction = easeInOutCubic,
  ) {
    const from = this.center();
    const fromZoom = this.zoom();
    const to = this.resolveLonLat(location);
    const toZoom = zoom ?? fromZoom;
    // Composite projections (albersUsa) have a fixed camera — only the
    // zoom part of the flight applies.
    const fixedCamera = !this.projector()?.rotate;

    const interpolate = geoInterpolate([from.x, from.y], [to.x, to.y]);
    const distance = fixedCamera
      ? 0
      : geoDistance([from.x, from.y], [to.x, to.y]);
    const logFrom = Math.log2(fromZoom);
    const logTo = Math.log2(toZoom);
    // Zoom out during the flight, further for longer hops, but never below
    // the fitted view (zoom 1).
    const dip = Math.min(distance * 1.5, Math.max(0, Math.min(logFrom, logTo)));

    yield* tween(duration, value => {
      const t = timing(value);
      if (!fixedCamera) {
        const [lon, lat] = interpolate(t);
        this.center(new Vector2(lon, lat));
      }
      this.zoom(
        2 ** (logFrom + (logTo - logFrom) * t - dip * Math.sin(Math.PI * t)),
      );
    });
  }

  /**
   * The zoom level at which the given region fits this node.
   *
   * @param target - A feature name/id from the map data, or a GeoJSON
   * object (e.g. a `GeoCircle`-style geometry).
   * @param padding - Space in pixels to leave around the region.
   *
   * @example
   * ```ts
   * map().zoom(map().zoomFor('France'), 2);
   * ```
   */
  public zoomFor(target: string | number | GeoObject, padding = 80): number {
    const size = this.computedSize();
    if (size.x === 0 || size.y === 0) {
      return this.zoom();
    }

    let geometry: GeoObject | null;
    if (typeof target === 'object') {
      geometry = target;
    } else {
      geometry = this.featureByName(target);
      if (!geometry) {
        if (this.geoData() === null) {
          // Data still loading — keep the current zoom; recomputed once
          // the data arrives.
          return this.zoom();
        }
        throw new Error(`GeoMap: unknown zoom target "${target}".`);
      }
    }

    const definition = resolveProjection(this.projection());
    const fitPadding = this.fitPadding();

    // Scale of the zoom-1 view, matching the fit in projector().
    const base = definition.factory();
    base.rotate?.([0, 0, 0]);
    base.center?.([0, 0]);
    base.fitExtent(
      [
        [-size.x / 2 + fitPadding, -size.y / 2 + fitPadding],
        [size.x / 2 - fitPadding, size.y / 2 - fitPadding],
      ],
      this.fitObject(),
    );
    const baseScale = base.scale();

    // Scale needed to fit the target when the camera points at it.
    const projection = definition.factory();
    const [lon, lat] = geoCentroid(geometry);
    if (projection.rotate) {
      if (definition.azimuthal) {
        projection.rotate([-lon, -lat, 0]);
      } else {
        projection.rotate([-lon, 0, 0]);
        projection.center?.([0, lat]);
      }
    }
    projection.fitExtent(
      [
        [-size.x / 2 + padding, -size.y / 2 + padding],
        [size.x / 2 - padding, size.y / 2 - padding],
      ],
      geometry,
    );
    return projection.scale() / baseScale;
  }

  /**
   * Fly the camera to a region and zoom so it fits the node.
   *
   * @remarks
   * Combines {@link flyTo} with {@link zoomFor}: the camera flies to the
   * region's centroid and arrives at the zoom level that frames it with
   * the given padding.
   *
   * @example
   * ```ts
   * yield* map().flyToFeature('France', 3);
   * ```
   */
  @threadable()
  public *flyToFeature(
    target: string | number | GeoObject,
    duration = 3,
    padding = 80,
    timing: TimingFunction = easeInOutCubic,
  ) {
    const location =
      typeof target === 'object'
        ? new Vector2(geoCentroid(target))
        : this.resolveLonLat(String(target));
    yield* this.flyTo(
      location,
      this.zoomFor(target, padding),
      duration,
      timing,
    );
  }
}
