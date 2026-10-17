import {
  Shape,
  ShapeProps,
  computed,
  initial,
  is,
  nodeName,
  signal,
} from '@canvas-commons/2d';
import {
  BBox,
  PossibleVector2,
  SignalValue,
  SimpleSignal,
  Vector2,
  clamp,
} from '@canvas-commons/core';
import {geoDistance, geoInterpolate, geoPath} from 'd3-geo';
import {GeoMap} from './GeoMap';
import {projectToPath} from './path';

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

  /**
   * Screen-space bow of each leg in pixels — the "flight arc" look.
   *
   * @remarks
   * Offsets the line perpendicular to its direction of travel, peaking at
   * the middle of each leg. Negative values bow the other way. `0` (the
   * default) renders the exact geodesic.
   */
  bulge?: SignalValue<number>;
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
  declare public readonly points: SimpleSignal<
    (string | PossibleVector2)[],
    this
  >;

  @initial(0)
  @signal()
  declare public readonly start: SimpleSignal<number, this>;

  @initial(1)
  @signal()
  declare public readonly end: SimpleSignal<number, this>;

  @initial(0)
  @signal()
  declare public readonly bulge: SimpleSignal<number, this>;

  public constructor(props: GeoLineProps) {
    // The path is generated in map space; never let flex layout move it.
    super({layout: false, ...props});
  }

  @computed()
  protected map(): GeoMap {
    const map = this.findAncestor(is(GeoMap));
    if (!map) {
      throw new Error('GeoLine must be a descendant of a GeoMap.');
    }
    return map;
  }

  /**
   * The line densely sampled along each geodesic segment, with cumulative
   * spherical lengths for `start`/`end` trimming.
   */
  @computed()
  private resolvedPoints(): [number, number][] {
    const map = this.map();
    return this.points().map(point => {
      const lonLat = map.resolveLonLat(point);
      return [lonLat.x, lonLat.y];
    });
  }

  @computed()
  private samples(): {coordinates: [number, number][]; lengths: number[]} {
    const resolved = this.resolvedPoints();

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
    const lengths = this.waypointLengths();
    const total = lengths[lengths.length - 1] ?? 0;
    if (total === 0) {
      return 0;
    }
    const at = lengths[Math.round(clamp(0, lengths.length - 1, index))];
    return Math.min(1, at / total);
  }

  @computed()
  private trimmedSamples(): {
    coordinates: [number, number][];
    lengths: number[];
  } {
    const empty: {coordinates: [number, number][]; lengths: number[]} = {
      coordinates: [],
      lengths: [],
    };
    const {coordinates, lengths} = this.samples();
    if (coordinates.length < 2) {
      return empty;
    }

    const total = lengths[lengths.length - 1];
    const start = Math.min(this.start(), this.end()) * total;
    const end = Math.max(this.start(), this.end()) * total;
    if (total === 0 || end - start <= 0) {
      return empty;
    }

    const trimmed: [number, number][] = [];
    const trimmedLengths: number[] = [];
    for (let i = 0; i < coordinates.length; i++) {
      if (lengths[i] < start || lengths[i] > end) {
        // Interpolate the boundary points of the visible window.
        const next = lengths[i + 1];
        const previous = lengths[i - 1];
        if (next !== undefined && lengths[i] < start && next > start) {
          const t = (start - lengths[i]) / (next - lengths[i]);
          trimmed.push(geoInterpolate(coordinates[i], coordinates[i + 1])(t));
          trimmedLengths.push(start);
        }
        if (previous !== undefined && lengths[i] > end && previous < end) {
          const t = (end - previous) / (lengths[i] - previous);
          trimmed.push(geoInterpolate(coordinates[i - 1], coordinates[i])(t));
          trimmedLengths.push(end);
        }
        continue;
      }
      trimmed.push(coordinates[i]);
      trimmedLengths.push(lengths[i]);
    }
    return trimmed.length < 2
      ? empty
      : {coordinates: trimmed, lengths: trimmedLengths};
  }

  /**
   * Cumulative spherical length at each waypoint, for mapping a sample's
   * length to its leg.
   */
  @computed()
  private waypointLengths(): number[] {
    const resolved = this.resolvedPoints();
    const cumulative = [0];
    for (let i = 1; i < resolved.length; i++) {
      cumulative.push(
        cumulative[i - 1] + geoDistance(resolved[i - 1], resolved[i]),
      );
    }
    return cumulative;
  }

  @computed()
  private linePath(): Path2D {
    const path = new Path2D();
    const projection = this.map().projector();
    const {coordinates, lengths} = this.trimmedSamples();
    if (!projection || coordinates.length < 2) {
      return path;
    }

    const bulge = this.bulge();
    if (bulge === 0) {
      return projectToPath(projection, {type: 'LineString', coordinates});
    }

    // Bulged lines are built manually: project each sample, offset it
    // perpendicular to the direction of travel with a sinusoidal envelope
    // peaking mid-leg. Far-side points (on globes) break the line.
    const map = this.map();
    const waypoints = this.waypointLengths();
    const projected = coordinates.map((point, i) => {
      if (!map.isPointVisible(point)) {
        return null;
      }
      const result = projection(point);
      return result ? {x: result[0], y: result[1], length: lengths[i]} : null;
    });

    // Consecutive samples are ~1° apart, so their projected distance is a
    // small fraction of the projection scale. A jump beyond it means the
    // leg wrapped around the antimeridian on a flat projection — break the
    // line there, like d3's clipping does for the geodesic case.
    const scale = projection.scale?.() ?? Number.POSITIVE_INFINITY;
    const isJump = (
      a: {x: number; y: number},
      b: {x: number; y: number},
    ): boolean => Math.hypot(a.x - b.x, a.y - b.y) > scale;

    let leg = 0;
    let started = false;
    for (let i = 0; i < projected.length; i++) {
      const current = projected[i];
      if (!current) {
        started = false;
        continue;
      }
      const previous = projected[i - 1] ?? null;
      const next = projected[i + 1] ?? null;
      if (previous && isJump(current, previous)) {
        started = false;
      }
      while (
        leg < waypoints.length - 2 &&
        current.length > waypoints[leg + 1]
      ) {
        leg++;
      }
      const legStart = waypoints[leg] ?? 0;
      const legEnd = waypoints[leg + 1] ?? legStart + 1;
      const t = (current.length - legStart) / (legEnd - legStart || 1);

      const before =
        previous && !isJump(current, previous) ? previous : current;
      const after = next && !isJump(current, next) ? next : current;
      const dx = after.x - before.x;
      const dy = after.y - before.y;
      const magnitude = Math.hypot(dx, dy) || 1;
      const offset = bulge * Math.sin(Math.PI * Math.max(0, Math.min(1, t)));
      const x = current.x + (dy / magnitude) * offset;
      const y = current.y - (dx / magnitude) * offset;

      if (started) {
        path.lineTo(x, y);
      } else {
        path.moveTo(x, y);
        started = true;
      }
    }
    return path;
  }

  protected override getPath(): Path2D {
    return this.linePath();
  }

  /**
   * Bounds of the projected line in local space — required for effects
   * that rasterize the node (`shaders`, filters, opacity), since the
   * layout size of this node is zero.
   */
  @computed()
  protected pathBBox(): BBox {
    const projection = this.map().projector();
    const {coordinates} = this.trimmedSamples();
    if (!projection || coordinates.length < 2) {
      return new BBox();
    }
    const [[left, top], [right, bottom]] = geoPath(projection).bounds({
      type: 'LineString',
      coordinates,
    });
    if (![left, top, right, bottom].every(isFinite) || right < left) {
      return new BBox();
    }
    return new BBox(left, top, right - left, bottom - top);
  }

  protected override getCacheBBox(): BBox {
    return this.pathBBox().expand(
      this.lineWidth() / 2 + Math.abs(this.bulge()),
    );
  }
}
