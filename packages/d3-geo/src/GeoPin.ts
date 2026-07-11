import {Shape, ShapeProps, computed, initial, nodeName, signal} from '@motion-canvas/2d';
import {
  PossibleVector2,
  SignalValue,
  SimpleSignal,
  Vector2,
} from '@motion-canvas/core';
import {GeoMap} from './GeoMap';

export type GeoPinMarker = 'pin' | 'dot' | 'none';

export interface GeoPinProps extends ShapeProps {
  /**
   * Where the pin sits: `[longitude, latitude]`, a city name from the
   * built-in gazetteer, or a region name from the map data (its centroid).
   */
  at?: SignalValue<string | PossibleVector2>;

  /**
   * The built-in marker to draw: a teardrop `'pin'` (tip on the location),
   * a `'dot'`, or `'none'` to only position children.
   */
  marker?: SignalValue<GeoPinMarker>;

  /**
   * Height of the pin marker (or diameter reference for the dot) in pixels.
   */
  pinSize?: SignalValue<number>;
}

/**
 * A marker anchored to a geographic location on a {@link GeoMap}.
 *
 * @remarks
 * Must be a descendant of a {@link GeoMap}. The node's position follows the
 * projected location automatically, staying put during camera moves while
 * keeping a constant screen size. On azimuthal projections (orthographic
 * globe) the pin hides itself when its location rotates to the far side.
 *
 * Children are rendered relative to the location, so labels can be attached
 * with a simple offset.
 *
 * @example
 * ```tsx
 * <GeoPin at={'Berlin'} fill={'#e8555d'}>
 *   <Txt text={'Berlin'} y={-70} fill={'white'} />
 * </GeoPin>
 * ```
 */
@nodeName('GeoPin')
export class GeoPin extends Shape {
  @initial([0, 0])
  @signal()
  public declare readonly at: SimpleSignal<string | PossibleVector2, this>;

  @initial('pin')
  @signal()
  public declare readonly marker: SimpleSignal<GeoPinMarker, this>;

  @initial(48)
  @signal()
  public declare readonly pinSize: SimpleSignal<number, this>;

  public constructor(props: GeoPinProps) {
    super(props);
    if (
      props.position === undefined &&
      props.x === undefined &&
      props.y === undefined
    ) {
      this.position(() => this.geoPosition());
    }
  }

  @computed()
  private map(): GeoMap {
    const map = this.findAncestor(node => node instanceof GeoMap);
    if (!map) {
      throw new Error('GeoPin must be a descendant of a GeoMap.');
    }
    return map as GeoMap;
  }

  @computed()
  private geoPosition(): Vector2 {
    const map = this.map();
    const projection = map.projector();
    if (!projection) {
      return Vector2.zero;
    }
    const lonLat = map.resolveLonLat(this.at());
    const projected = projection([lonLat.x, lonLat.y]);
    return projected ? new Vector2(projected) : Vector2.zero;
  }

  /**
   * Whether the pin's location faces the camera (relevant on globes).
   */
  @computed()
  public isVisibleOnGlobe(): boolean {
    return this.map().isPointVisible(this.at());
  }

  @computed()
  private markerPath(): Path2D {
    const path = new Path2D();
    const kind = this.marker();
    const size = this.pinSize();

    if (kind === 'dot') {
      path.arc(0, 0, size * 0.28, 0, Math.PI * 2);
      path.closePath();
      return path;
    }

    if (kind === 'pin') {
      // Teardrop with the tip at the local origin and the bulb above it.
      const radius = size * 0.38;
      const centerY = -(size - radius);
      const alpha = Math.acos(radius / -centerY);
      const start = Math.PI / 2 - alpha;
      const end = Math.PI / 2 + alpha;
      path.moveTo(0, 0);
      path.lineTo(radius * Math.cos(start), centerY + radius * Math.sin(start));
      path.arc(0, centerY, radius, start, end, true);
      path.closePath();
      // Opposite-winding inner circle punches the hole.
      const hole = radius * 0.45;
      path.moveTo(hole, centerY);
      path.arc(0, centerY, hole, 0, Math.PI * 2, false);
      path.closePath();
    }

    return path;
  }

  protected override getPath(): Path2D {
    return this.markerPath();
  }

  protected override draw(context: CanvasRenderingContext2D) {
    if (!this.isVisibleOnGlobe()) {
      return;
    }
    super.draw(context);
  }
}
