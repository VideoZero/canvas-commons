import {
  BBox,
  Color,
  PossibleColor,
  PossibleVector2,
  SignalValue,
  SimpleSignal,
  Vector2Signal,
  unwrap,
} from '@motion-canvas/core';
import {initial, initializeSignals, signal} from '../decorators/signal';
import {vector2Signal} from '../decorators/vector2Signal';

export type GradientType = 'linear' | 'conic' | 'radial';

export interface GradientStop {
  offset: SignalValue<number>;
  color: SignalValue<PossibleColor>;
}

export interface GradientProps {
  type?: SignalValue<GradientType>;
  fromX?: SignalValue<number>;
  fromY?: SignalValue<number>;
  from?: SignalValue<PossibleVector2>;
  toX?: SignalValue<number>;
  toY?: SignalValue<number>;
  to?: SignalValue<PossibleVector2>;
  angle?: SignalValue<number>;
  fromRadius?: SignalValue<number>;
  toRadius?: SignalValue<number>;
  stops?: GradientStop[];
  /**
   * Interpret the gradient relative to the painted shape's bbox at
   * render time, following CSS gradient conventions. Used by the CSS
   * gradient string parser and SVG paint-server resolver so the
   * gradient auto-fits whatever shape it's applied to.
   *
   * - `linear`: `from`/`to` are taken as a unit direction vector; the
   *   actual gradient line spans the bbox corner-projection on that
   *   axis (CSS "magic corners" formula).
   * - `radial`: gradient is centred at the bbox centre; `fromRadius` /
   *   `toRadius` are scaled by the bbox half-diagonal.
   * - `conic`: centred at the bbox centre; `angle` unchanged.
   *
   * When `false` (default), `from`/`to`/radii are absolute canvas
   * units, matching the legacy explicit-gradient behaviour.
   */
  cssRelative?: SignalValue<boolean>;
}

export class Gradient {
  @initial('linear')
  @signal()
  public declare readonly type: SimpleSignal<GradientType, this>;

  @vector2Signal('from')
  public declare readonly from: Vector2Signal<this>;

  @vector2Signal('to')
  public declare readonly to: Vector2Signal<this>;

  @initial(0)
  @signal()
  public declare readonly angle: SimpleSignal<number, this>;
  @initial(0)
  @signal()
  public declare readonly fromRadius: SimpleSignal<number, this>;
  @initial(0)
  @signal()
  public declare readonly toRadius: SimpleSignal<number, this>;
  @initial([])
  @signal()
  public declare readonly stops: SimpleSignal<GradientStop[], this>;

  @initial(false)
  @signal()
  public declare readonly cssRelative: SimpleSignal<boolean, this>;

  public constructor(props: GradientProps) {
    initializeSignals(this, props);
  }

  /**
   * Interpolate between two fill values that may include a `Gradient`.
   * Routed through from `canvasStyleSignal`'s dispatcher (and may also
   * be called directly when tweening between two known gradients).
   *
   * Handling:
   * - At `t <= 0` returns `from` unchanged, at `t >= 1` returns `to`
   *   unchanged — so a `Color → Gradient` or `Gradient → Color` tween
   *   only resolves to the actual `Color` endpoint at the boundary
   *   frame; everything in-between is a `Gradient`.
   * - `Color` / `null` on one side is treated as a uniform-colour
   *   gradient that mirrors the other side's geometry, so colour →
   *   gradient transitions look like the gradient fading in.
   * - When both gradients share a type *and* stop count, every
   *   structural property (`from`, `to`, radii, angle, stop offsets,
   *   stop colours) is lerped element-wise.
   * - When types or stop counts differ, we fall back to a discrete
   *   swap at t=0.5 rather than try to morph between incompatible
   *   structures.
   */
  public static lerp(
    from: Gradient | Color | string | null,
    to: Gradient | Color | string | null,
    t: number,
  ): Gradient | Color | null {
    if (t <= 0) return Gradient.normalizeEndpoint(from);
    if (t >= 1) return Gradient.normalizeEndpoint(to);

    const fromGrad = from instanceof Gradient ? from : null;
    const toGrad = to instanceof Gradient ? to : null;
    const ref = fromGrad ?? toGrad;
    if (!ref) {
      // Neither side is a Gradient — defer to Color.lerp.
      return Color.lerp(from as Color | string | null, to as Color | string | null, t);
    }

    const a = Gradient.toUniformGradient(from, ref);
    const b = Gradient.toUniformGradient(to, ref);

    // Structurally incompatible — no meaningful element-wise lerp.
    if (a.type() !== b.type() || a.stops().length !== b.stops().length) {
      return t < 0.5
        ? Gradient.normalizeEndpoint(from)
        : Gradient.normalizeEndpoint(to);
    }

    const mix = (x: number, y: number) => x + (y - x) * t;
    const aStops = a.stops();
    const bStops = b.stops();
    const stops: GradientStop[] = aStops.map((s, i) => ({
      offset: mix(unwrap(s.offset), unwrap(bStops[i].offset)),
      color: Color.lerp(
        new Color(unwrap(s.color)),
        new Color(unwrap(bStops[i].color)),
        t,
      ),
    }));

    return new Gradient({
      type: a.type(),
      from: [mix(a.from.x(), b.from.x()), mix(a.from.y(), b.from.y())],
      to: [mix(a.to.x(), b.to.x()), mix(a.to.y(), b.to.y())],
      angle: mix(a.angle(), b.angle()),
      fromRadius: mix(a.fromRadius(), b.fromRadius()),
      toRadius: mix(a.toRadius(), b.toRadius()),
      cssRelative: a.cssRelative() || b.cssRelative(),
      stops,
    });
  }

  /**
   * Coerce a non-Gradient endpoint into a Gradient that mirrors the
   * reference gradient's geometry but uses a single colour at every
   * stop. `null` becomes fully transparent so a `null → Gradient` tween
   * fades in.
   */
  private static toUniformGradient(
    style: Gradient | Color | string | null,
    ref: Gradient,
  ): Gradient {
    if (style instanceof Gradient) return style;
    const color =
      style === null
        ? new Color('rgba(0, 0, 0, 0)')
        : style instanceof Color
        ? style
        : new Color(style);
    return new Gradient({
      type: ref.type(),
      from: [ref.from.x(), ref.from.y()],
      to: [ref.to.x(), ref.to.y()],
      angle: ref.angle(),
      fromRadius: ref.fromRadius(),
      toRadius: ref.toRadius(),
      cssRelative: ref.cssRelative(),
      stops: ref.stops().map(s => ({offset: unwrap(s.offset), color})),
    });
  }

  /** Normalise a t=0/t=1 endpoint to the discriminated union. */
  private static normalizeEndpoint(
    style: Gradient | Color | string | null,
  ): Gradient | Color | null {
    if (style === null) return null;
    if (style instanceof Gradient) return style;
    if (style instanceof Color) return style;
    return new Color(style);
  }

  // Not @computed: result depends on the per-call `bbox`, which sits
  // outside Motion Canvas's signal graph. Recomputing per paint is
  // cheap compared to the rest of Shape.draw.
  public canvasGradient(
    context: CanvasRenderingContext2D,
    bbox?: BBox,
  ): CanvasGradient {
    let gradient: CanvasGradient;
    const fromX = this.from.x();
    const fromY = this.from.y();
    const toX = this.to.x();
    const toY = this.to.y();

    if (this.cssRelative() && bbox) {
      const cx = bbox.center.x;
      const cy = bbox.center.y;
      const halfW = bbox.width / 2;
      const halfH = bbox.height / 2;
      switch (this.type()) {
        case 'linear': {
          // from/to encode a unit direction vector. Project the bbox
          // corners onto that axis (CSS "magic corners" formula) to
          // pick the gradient line endpoints, so the gradient spans
          // exactly far enough to touch the bbox corners.
          const dx = toX - fromX;
          const dy = toY - fromY;
          const len = Math.hypot(dx, dy) || 1;
          const ux = dx / len;
          const uy = dy / len;
          const half = halfW * Math.abs(ux) + halfH * Math.abs(uy);
          gradient = context.createLinearGradient(
            cx - ux * half,
            cy - uy * half,
            cx + ux * half,
            cy + uy * half,
          );
          break;
        }
        case 'conic':
          gradient = context.createConicGradient(this.angle(), cx, cy);
          break;
        case 'radial': {
          // Radii are 0-1 of the bbox half-diagonal — covers the
          // bbox corners at radius 1.
          const halfDiag = Math.hypot(halfW, halfH);
          gradient = context.createRadialGradient(
            cx,
            cy,
            this.fromRadius() * halfDiag,
            cx,
            cy,
            this.toRadius() * halfDiag,
          );
          break;
        }
      }
    } else {
      switch (this.type()) {
        case 'linear':
          gradient = context.createLinearGradient(fromX, fromY, toX, toY);
          break;
        case 'conic':
          gradient = context.createConicGradient(this.angle(), fromX, fromY);
          break;
        case 'radial':
          gradient = context.createRadialGradient(
            fromX,
            fromY,
            this.fromRadius(),
            toX,
            toY,
            this.toRadius(),
          );
          break;
      }
    }

    for (const {offset, color} of this.stops()) {
      gradient.addColorStop(
        unwrap(offset),
        new Color(unwrap(color)).serialize(),
      );
    }

    return gradient;
  }
}
