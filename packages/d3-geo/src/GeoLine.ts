import {Shape, ShapeProps, computed, initial, nodeName, signal} from '@motion-canvas/2d';
import {
  PossibleVector2,
  SignalValue,
  SimpleSignal,
  Vector2,
  clamp,
} from '@motion-canvas/core';
import {geoDistance, geoInterpolate, geoPath} from 'd3-geo';
import {GeoMap} from './GeoMap';

export interface GeoLineProps extends ShapeProps {
  /**
   * Waypoints of the line: `[longitude, latitude]` pairs, city names, or
   * region names (their centroids).
   */
  points?: SignalValue<(string | PossibleVector2)[]>;

  /**
   * Fraction of the line (by spherical length) where drawing starts.
   */
  start?: SignalValue<number>;

  /**
   * Fraction of the line (by spherical length) where drawing ends.
   *
   * @remarks
   * Tween `end` from 0 to 1 to animate a route being drawn.
   */
  end?: SignalValue<number>;
}

/**
 * A great-circle line through a list of locations on a {@link GeoMap}.
 *
 * @remarks
 * Must be a descendant of a {@link GeoMap}. Each segment follows the
 * geodesic between its endpoints and re-projects with camera moves,
 * including correct clipping at the antimeridian and the globe's horizon.
 * Style with the usual `stroke`/`lineWidth`/`lineDash` signals; animate a
 * draw-on with the `start`/`end` signals.
 *
 * @example
 * ```tsx
 * <GeoLine
 *   points={['Berlin', 'New York', 'Tokyo']}
 *   stroke={'#ffd166'}
 *   lineWidth={4}
 *   end={0}
 * />
 * // ...
 * yield* line().end(1, 2);
 * ```
 */
@nodeName('GeoLine')
export class GeoLine extends Shape {
  @initial([])
  @signal()
  public declare readonly points: SimpleSignal<
    (string | PossibleVector2)[],
    this
  >;

  @initial(0)
  @signal()
  public declare readonly start: SimpleSignal<number, this>;

  @initial(1)
  @signal()
  public declare readonly end: SimpleSignal<number, this>;

  public constructor(props: GeoLineProps) {
    // The path is generated in map space; never let flex layout move it.
    super({layout: false, ...props});
  }

  @computed()
  protected map(): GeoMap {
    const map = this.findAncestor(node => node instanceof GeoMap);
    if (!map) {
      throw new Error('GeoLine must be a descendant of a GeoMap.');
    }
    return map as GeoMap;
  }

  /**
   * The line densely sampled along each geodesic segment, with cumulative
   * spherical lengths for `start`/`end` trimming.
   */
  @computed()
  private samples(): {coordinates: [number, number][]; lengths: number[]} {
    const map = this.map();
    const resolved = this.points().map(point => {
      const lonLat = map.resolveLonLat(point);
      return [lonLat.x, lonLat.y] as [number, number];
    });

    const coordinates: [number, number][] = [];
    const lengths: number[] = [];
    let total = 0;
    for (let i = 0; i < resolved.length; i++) {
      if (i === 0) {
        coordinates.push(resolved[0]);
        lengths.push(0);
        continue;
      }
      const from = resolved[i - 1];
      const to = resolved[i];
      const distance = geoDistance(from, to);
      // ~1° sampling keeps the geodesic smooth under any projection.
      const steps = Math.max(1, Math.ceil(distance / 0.017));
      const interpolate = geoInterpolate(from, to);
      for (let step = 1; step <= steps; step++) {
        coordinates.push(interpolate(step / steps));
        total += distance / steps;
        lengths.push(total);
      }
    }
    return {coordinates, lengths};
  }

  /**
   * The `[longitude, latitude]` on the line at a fraction of its length.
   *
   * @remarks
   * Useful for making a marker ride the line as it draws on:
   *
   * @example
   * ```tsx
   * <GeoPin at={() => route().pointAt(route().end())} marker={'dot'} />
   * ```
   */
  public pointAt(fraction: number): Vector2 {
    const {coordinates, lengths} = this.samples();
    if (coordinates.length === 0) {
      return Vector2.zero;
    }
    const total = lengths[lengths.length - 1];
    if (total === 0 || coordinates.length === 1) {
      return new Vector2(coordinates[0]);
    }
    const target = clamp(0, 1, fraction) * total;
    for (let i = 1; i < coordinates.length; i++) {
      if (lengths[i] >= target) {
        const span = lengths[i] - lengths[i - 1];
        const t = span === 0 ? 0 : (target - lengths[i - 1]) / span;
        return new Vector2(
          geoInterpolate(coordinates[i - 1], coordinates[i])(t),
        );
      }
    }
    return new Vector2(coordinates[coordinates.length - 1]);
  }

  /**
   * The `start`/`end` fraction at which the given waypoint sits.
   *
   * @example
   * ```ts
   * // Draw the line exactly up to the second waypoint:
   * yield* line().end(line().progressAt(1), 2);
   * ```
   */
  public progressAt(index: number): number {
    const map = this.map();
    const resolved = this.points().map(point => {
      const lonLat = map.resolveLonLat(point);
      return [lonLat.x, lonLat.y] as [number, number];
    });
    if (resolved.length < 2) {
      return 0;
    }
    let total = 0;
    let at = 0;
    for (let i = 1; i < resolved.length; i++) {
      total += geoDistance(resolved[i - 1], resolved[i]);
      if (i === index) {
        at = total;
      }
    }
    return index <= 0 || total === 0 ? 0 : Math.min(1, at / total || 1);
  }

  @computed()
  private linePath(): Path2D {
    const path = new Path2D();
    const projection = this.map().projector();
    const {coordinates, lengths} = this.samples();
    if (!projection || coordinates.length < 2) {
      return path;
    }

    const total = lengths[lengths.length - 1];
    const start = Math.min(this.start(), this.end()) * total;
    const end = Math.max(this.start(), this.end()) * total;
    if (total === 0 || end - start <= 0) {
      return path;
    }

    const trimmed: [number, number][] = [];
    for (let i = 0; i < coordinates.length; i++) {
      if (lengths[i] < start || lengths[i] > end) {
        // Interpolate the boundary points of the visible window.
        const next = lengths[i + 1];
        const previous = lengths[i - 1];
        if (next !== undefined && lengths[i] < start && next > start) {
          const t = (start - lengths[i]) / (next - lengths[i]);
          trimmed.push(
            geoInterpolate(coordinates[i], coordinates[i + 1])(t),
          );
        }
        if (previous !== undefined && lengths[i] > end && previous < end) {
          const t = (end - previous) / (lengths[i] - previous);
          trimmed.push(
            geoInterpolate(coordinates[i - 1], coordinates[i])(t),
          );
        }
        continue;
      }
      trimmed.push(coordinates[i]);
    }
    if (trimmed.length < 2) {
      return path;
    }

    geoPath(projection, path as any)({
      type: 'LineString',
      coordinates: trimmed,
    });
    return path;
  }

  protected override getPath(): Path2D {
    return this.linePath();
  }
}
