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
} from '@motion-canvas/2d';
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
} from '@motion-canvas/core';
import {
  GeoPermissibleObjects,
  GeoProjection,
  geoBounds,
  geoCentroid,
  geoDistance,
  geoGraticule,
  geoInterpolate,
  geoPath,
} from 'd3-geo';
import {feature, merge, mesh} from 'topojson-client';
import {presimplify, simplify, sphericalTriangleArea} from 'topojson-simplify';
import {cityLonLat} from './cities';
import {PossibleProjection, resolveProjection} from './projections';

/**
 * Map data accepted by {@link GeoMap}: a TopoJSON topology or GeoJSON
 * FeatureCollection — given directly, as a promise, or as a URL to fetch.
 */
export type GeoDataInput = string | object | Promise<object>;

interface GeoFeatureObject {
  type: string;
  id?: string | number;
  properties?: Record<string, unknown> | null;
  geometry?: unknown;

  [key: string]: unknown;
}

interface GeoLayers {
  /** Individual region features (countries, states, ...). */
  features: GeoFeatureObject[];
  /** Merged landmass for a single fill. */
  land: GeoPermissibleObjects | null;
  /** Interior borders between regions. */
  borders: GeoPermissibleObjects | null;
  /** Outer coastline (edges not shared between regions). */
  coast: GeoPermissibleObjects | null;
  /** Whether the data covers the whole world (fit to sphere by default). */
  world: boolean;
  /** Source topology of these layers (LOD-simplified), if any. */
  topology?: any;
  /** Name of the topology object the layers came from. */
  layerName?: string;
}

interface SphericalRegion {
  center: [number, number];
  radius: number;
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
  fit?: SignalValue<string | object | null>;

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
  public declare readonly data: SimpleSignal<GeoDataInput | null, this>;

  @initial(null)
  @signal()
  public declare readonly layer: SimpleSignal<string | null, this>;

  @initial('naturalEarth')
  @signal()
  public declare readonly projection: SimpleSignal<PossibleProjection, this>;

  @initial(0)
  @signal()
  public declare readonly roll: SimpleSignal<number, this>;

  @initial(Vector2.zero)
  @vector2Signal('center')
  public declare readonly center: Vector2Signal<this>;

  @initial(1)
  @signal()
  public declare readonly zoom: SimpleSignal<number, this>;

  @initial(null)
  @signal()
  public declare readonly fit: SimpleSignal<string | object | null, this>;

  @initial(0)
  @signal()
  public declare readonly fitPadding: SimpleSignal<number, this>;

  @initial(2)
  @signal()
  public declare readonly simplification: SimpleSignal<number, this>;

  @canvasStyleSignal()
  public declare readonly water: CanvasStyleSignal<this>;

  @canvasStyleSignal()
  public declare readonly land: CanvasStyleSignal<this>;

  @canvasStyleSignal()
  public declare readonly borders: CanvasStyleSignal<this>;

  @initial(1)
  @signal()
  public declare readonly bordersWidth: SimpleSignal<number, this>;

  @canvasStyleSignal()
  public declare readonly graticule: CanvasStyleSignal<this>;

  @initial(1)
  @signal()
  public declare readonly graticuleWidth: SimpleSignal<number, this>;

  @initial(10)
  @signal()
  public declare readonly graticuleStep: SimpleSignal<
    number | [number, number],
    this
  >;

  @canvasStyleSignal()
  public declare readonly coast: CanvasStyleSignal<this>;

  @initial(1)
  @signal()
  public declare readonly coastWidth: SimpleSignal<number, this>;

  @initial({})
  @signal()
  public declare readonly featureFills: SimpleSignal<
    Record<string, PossibleCanvasStyle>,
    this
  >;

  @canvasStyleSignal()
  public declare readonly outline: CanvasStyleSignal<this>;

  @initial(2)
  @signal()
  public declare readonly outlineWidth: SimpleSignal<number, this>;

  private readonly lodCache = new Map<string, GeoLayers>();
  private readonly culledLandCache = new Map<string, GeoPermissibleObjects>();

  private static readonly urlPool: Record<string, {value: object | null; promise: Promise<object>}> = {};
  private static readonly promisePool = new WeakMap<
    Promise<object>,
    {value: object | null}
  >();

  public constructor(props: GeoMapProps) {
    super({clip: true, ...props});
  }

  /**
   * The resolved map data, or `null` while it is still loading.
   */
  @computed()
  public geoData(): any | null {
    const raw = this.data();
    if (raw === null) {
      return null;
    }

    if (typeof raw === 'string') {
      let entry = GeoMap.urlPool[raw];
      if (!entry) {
        entry = {
          value: null,
          promise: fetch(raw).then(response => response.json()),
        };
        entry.promise.then(value => {
          entry.value = value;
        });
        GeoMap.urlPool[raw] = entry;
      }
      if (entry.value === null) {
        DependencyContext.collectPromise(entry.promise);
      }
      return entry.value;
    }

    if (raw instanceof Promise) {
      let entry = GeoMap.promisePool.get(raw);
      if (!entry) {
        const created = {value: null as object | null};
        raw.then(value => {
          created.value = value;
        });
        GeoMap.promisePool.set(raw, created);
        entry = created;
      }
      if (entry.value === null) {
        DependencyContext.collectPromise(raw);
      }
      return entry.value;
    }

    return raw;
  }

  private buildLayers(data: any): GeoLayers {
    if (data.type === 'Topology') {
      const objects = data.objects ?? {};
      const layerName =
        this.layer() ??
        ('countries' in objects ? 'countries' : Object.keys(objects)[0]);
      const object = objects[layerName];
      if (!object) {
        return {features: [], land: null, borders: null, coast: null, world: false};
      }
      const collection = feature(data, object) as any;
      const features: GeoFeatureObject[] =
        collection.type === 'FeatureCollection'
          ? collection.features
          : [collection];
      const land = objects.land
        ? (feature(data, objects.land) as any)
        : (merge(data, object.geometries) as any);
      const borders = mesh(data, object, (a: any, b: any) => a !== b) as any;
      const coast = mesh(data, object, (a: any, b: any) => a === b) as any;
      const world = 'land' in objects || layerName === 'countries';
      return {features, land, borders, coast, world, topology: data, layerName};
    }

    const features: GeoFeatureObject[] =
      data.type === 'FeatureCollection' ? data.features : [data];
    return {
      features,
      land: data as GeoPermissibleObjects,
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
  private presimplified(): any | null {
    const data = this.geoData();
    if (!data || data.type !== 'Topology' || this.simplification() <= 0) {
      return null;
    }
    return presimplify(data, sphericalTriangleArea);
  }

  /**
   * Layers simplified for the current projection scale.
   *
   * @remarks
   * The scale is quantized to half-octaves and each level is built once and
   * cached, so camera tweens only pay the path-generation cost per frame.
   */
  @computed()
  private renderLayers(): GeoLayers | null {
    const raw = this.layers();
    const pre = this.presimplified();
    const projection = this.projector();
    if (!raw || !pre || !projection) {
      return raw;
    }
    const pixels = this.simplification();
    const step = Math.round(Math.log2(projection.scale()) * 2) / 2;
    const key = `${pixels}:${step}`;
    let lod = this.lodCache.get(key);
    if (!lod) {
      const minWeight = (pixels / 2 ** step) ** 2;
      lod = this.buildLayers(simplify(pre, minWeight));
      this.lodCache.set(key, lod);
    }
    return lod;
  }

  /**
   * Bounding region (spherical cap) of each raw feature, index-aligned with
   * the topology's geometries. Used for viewport culling.
   */
  @computed()
  private featureRegions(): SphericalRegion[] | null {
    const raw = this.layers();
    if (!raw || !raw.topology) {
      return null;
    }
    return raw.features.map(item => {
      const geometry = item as GeoPermissibleObjects;
      const center = geoCentroid(geometry);
      const [[west, south], [east, north]] = geoBounds(geometry);
      let radius = 0;
      for (const point of [
        [west, south],
        [west, north],
        [east, south],
        [east, north],
      ] as [number, number][]) {
        radius = Math.max(radius, geoDistance(center, point));
      }
      return {center, radius};
    });
  }

  /**
   * The visible portion of the map as a spherical cap, or `null` when it
   * cannot be determined (e.g. the whole globe is in view).
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
      // Inversion can report a false hit for points outside the projection
      // (e.g. beyond the globe's horizon) — verify by projecting back.
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
   * Landmass merged from only the features that can intersect the current
   * view. Falls back to the full merged land when culling isn't possible
   * or wouldn't pay off.
   */
  private culledLand(layers: GeoLayers): GeoPermissibleObjects | null {
    if (!layers.topology || !layers.layerName) {
      return null;
    }
    const view = this.viewRegion();
    const regions = this.featureRegions();
    if (!view || !regions || view.radius > Math.PI / 3) {
      return null;
    }
    const geometries = layers.topology.objects[layers.layerName].geometries;
    if (regions.length !== geometries.length) {
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
    const key = `${this.simplification()}:${visible.join(',')}`;
    let land = this.culledLandCache.get(key);
    if (land === undefined) {
      land = merge(
        layers.topology,
        visible.map(i => geometries[i]),
      ) as GeoPermissibleObjects;
      this.culledLandCache.clear();
      this.culledLandCache.set(key, land);
    }
    return land;
  }

  /**
   * Look up a region feature by `properties.name` (case-insensitive) or id.
   */
  public featureByName(name: string | number): GeoFeatureObject | null {
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
        return new Vector2(geoCentroid(found as GeoPermissibleObjects));
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
  private fitObject(): GeoPermissibleObjects {
    const fit = this.fit();
    if (fit !== null) {
      if (typeof fit === 'string') {
        const found = this.featureByName(fit);
        if (found) {
          return found as GeoPermissibleObjects;
        }
        if (this.geoData() === null) {
          // Data still loading — fit the sphere for now; recomputed once
          // the data arrives.
          return {type: 'Sphere'};
        }
        throw new Error(`GeoMap: unknown fit target "${fit}".`);
      }
      return fit as GeoPermissibleObjects;
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
   * Always `true` for non-azimuthal projections.
   */
  public isPointVisible(location: string | PossibleVector2): boolean {
    if (!resolveProjection(this.projection()).azimuthal) {
      return true;
    }
    const lonLat = this.resolveLonLat(location);
    const center = this.center();
    return (
      geoDistance([lonLat.x, lonLat.y], [center.x, center.y]) <
      Math.PI / 2 + 1e-6
    );
  }

  private renderPath(object: GeoPermissibleObjects): Path2D {
    const path = new Path2D();
    const projection = this.projector();
    if (projection) {
      geoPath(projection, path as any)(object);
    }
    return path;
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
    return layers?.coast ? this.renderPath(layers.coast) : null;
  }

  /**
   * LOD features indexed by lower-cased name and id.
   */
  @computed()
  private featureIndex(): Map<string, GeoFeatureObject[]> {
    const index = new Map<string, GeoFeatureObject[]>();
    const layers = this.renderLayers();
    if (!layers) {
      return index;
    }
    for (const item of layers.features) {
      for (const key of [
        String(item.id ?? '').toLowerCase(),
        String(item.properties?.name ?? '').toLowerCase(),
      ]) {
        if (!key) {
          continue;
        }
        const list = index.get(key);
        if (list) {
          list.push(item);
        } else {
          index.set(key, [item]);
        }
      }
    }
    return index;
  }

  @computed()
  private featureFillPaths(): {style: PossibleCanvasStyle; path: Path2D}[] {
    const entries = Object.entries(this.featureFills());
    if (entries.length === 0) {
      return [];
    }
    const index = this.featureIndex();
    const projection = this.projector();
    if (!projection) {
      return [];
    }
    const result: {style: PossibleCanvasStyle; path: Path2D}[] = [];
    for (const [name, style] of entries) {
      const features = index.get(name.toLowerCase());
      if (!features) {
        continue;
      }
      const path = new Path2D();
      const render = geoPath(projection, path as any);
      for (const item of features) {
        render(item as GeoPermissibleObjects);
      }
      result.push({style, path});
    }
    return result;
  }

  @computed()
  private landPath(): Path2D | null {
    const layers = this.renderLayers();
    if (!layers?.land) {
      return null;
    }
    const culled = this.culledLand(layers);
    return this.renderPath(culled ?? layers.land);
  }

  @computed()
  private bordersPath(): Path2D | null {
    const layers = this.renderLayers();
    return layers?.borders ? this.renderPath(layers.borders) : null;
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

    const interpolate = geoInterpolate([from.x, from.y], [to.x, to.y]);
    const distance = geoDistance([from.x, from.y], [to.x, to.y]);
    const logFrom = Math.log2(fromZoom);
    const logTo = Math.log2(toZoom);
    // Zoom out during the flight, further for longer hops, but never below
    // the fitted view (zoom 1).
    const dip = Math.min(distance * 1.5, Math.max(0, Math.min(logFrom, logTo)));

    yield* tween(duration, value => {
      const t = timing(value);
      const [lon, lat] = interpolate(t);
      this.center(new Vector2(lon, lat));
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
  public zoomFor(target: string | number | object, padding = 80): number {
    const size = this.computedSize();
    if (size.x === 0 || size.y === 0) {
      return this.zoom();
    }

    let geometry: GeoPermissibleObjects | null;
    if (typeof target === 'object') {
      geometry = target as GeoPermissibleObjects;
    } else {
      geometry = this.featureByName(target) as GeoPermissibleObjects | null;
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
    target: string | number | object,
    duration = 3,
    padding = 80,
    timing: TimingFunction = easeInOutCubic,
  ) {
    const location =
      typeof target === 'object'
        ? new Vector2(geoCentroid(target as GeoPermissibleObjects))
        : this.resolveLonLat(String(target));
    yield* this.flyTo(
      location,
      this.zoomFor(target, padding),
      duration,
      timing,
    );
  }
}
