import {
  BBox,
  Color,
  PossibleColor,
  PossibleVector2,
  SignalValue,
  SimpleSignal,
  Vector2Signal,
  unwrap,
} from '@canvas-commons/core';
import {computed} from '../decorators/computed';
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
  cssRelative?: SignalValue<boolean>;
}

export class Gradient {
  @initial('linear')
  @signal()
  declare public readonly type: SimpleSignal<GradientType, this>;

  @vector2Signal('from')
  declare public readonly from: Vector2Signal<this>;

  @vector2Signal('to')
  declare public readonly to: Vector2Signal<this>;

  @initial(0)
  @signal()
  declare public readonly angle: SimpleSignal<number, this>;
  @initial(0)
  @signal()
  declare public readonly fromRadius: SimpleSignal<number, this>;
  @initial(0)
  @signal()
  declare public readonly toRadius: SimpleSignal<number, this>;
  @initial([])
  @signal()
  declare public readonly stops: SimpleSignal<GradientStop[], this>;

  /**
   * Whether the gradient fits the box of the shape it paints, the way a CSS
   * gradient fits the element it is the background of.
   *
   * @remarks
   * A relative gradient is centered on the box. For `linear`, `from` and `to`
   * only give the direction, and the gradient line spans the box the way CSS
   * spans it: just far enough to reach the corners. For `radial`, the radii
   * are fractions of half the box diagonal, so a `toRadius` of `1` reaches the
   * corners. `conic` keeps its `angle`.
   *
   * Otherwise, positions and radii are in the local space of the shape.
   *
   * @example
   * ```tsx
   * <Rect
   *   size={[400, 200]}
   *   fill={
   *     new Gradient({
   *       cssRelative: true,
   *       from: [-1, 0],
   *       to: [1, 0],
   *       stops: [
   *         {offset: 0, color: '#e13238'},
   *         {offset: 1, color: '#242424'},
   *       ],
   *     })
   *   }
   * />
   * ```
   */
  @initial(false)
  @signal()
  declare public readonly cssRelative: SimpleSignal<boolean, this>;

  public constructor(props: GradientProps) {
    initializeSignals(this, props);
  }

  /**
   * Interpolate between two paints of which at least one may be a gradient.
   *
   * @remarks
   * A color becomes a gradient shaped like the other side with the color at
   * every stop, so a color turns into a gradient by spreading its stops apart.
   * `null` becomes the other gradient made transparent, so it fades in. Gradients of the same type and number
   * of stops interpolate their geometry and stops; any other pair switches
   * halfway through.
   *
   * @example
   * ```ts
   * rect().fill(new Gradient({...}), 1, easeInOutCubic, Gradient.lerp);
   * ```
   *
   * @param from - The paint to start from.
   * @param to - The paint to end at.
   * @param value - The progress of the interpolation, from `0` to `1`.
   */
  public static lerp(
    from: Gradient | Color | null,
    to: Gradient | Color | null,
    value: number,
  ): Gradient | Color | null {
    if (value <= 0) return from;
    if (value >= 1) return to;

    let reference: Gradient;
    if (from instanceof Gradient) {
      reference = from;
    } else if (to instanceof Gradient) {
      reference = to;
    } else {
      return Color.lerp(from, to, value);
    }

    const a = Gradient.uniform(from, reference);
    const b = Gradient.uniform(to, reference);
    const aStops = a.stops();
    const bStops = b.stops();
    if (a.type() !== b.type() || aStops.length !== bStops.length) {
      return value < 0.5 ? from : to;
    }

    const mix = (x: number, y: number) => x + (y - x) * value;
    return new Gradient({
      type: a.type(),
      from: a.from().lerp(b.from(), value),
      to: a.to().lerp(b.to(), value),
      angle: mix(a.angle(), b.angle()),
      fromRadius: mix(a.fromRadius(), b.fromRadius()),
      toRadius: mix(a.toRadius(), b.toRadius()),
      cssRelative: a.cssRelative() || b.cssRelative(),
      stops: aStops.map((stop, index) => ({
        offset: mix(unwrap(stop.offset), unwrap(bStops[index].offset)),
        color: Color.lerp(
          new Color(unwrap(stop.color)),
          new Color(unwrap(bStops[index].color)),
          value,
        ),
      })),
    });
  }

  private static uniform(
    paint: Gradient | Color | null,
    reference: Gradient,
  ): Gradient {
    if (paint instanceof Gradient) return paint;
    return new Gradient({
      type: reference.type(),
      from: reference.from(),
      to: reference.to(),
      angle: reference.angle(),
      fromRadius: reference.fromRadius(),
      toRadius: reference.toRadius(),
      cssRelative: reference.cssRelative(),
      stops: reference.stops().map(({offset, color}) => ({
        offset,
        color: paint ?? new Color(unwrap(color)).alpha(0),
      })),
    });
  }

  /**
   * Create the canvas gradient to paint with.
   *
   * @param context - The context to create the gradient for.
   * @param box - The box of the painted shape, which a
   *              {@link cssRelative} gradient fits.
   */
  public canvasGradient(
    context: CanvasRenderingContext2D,
    box?: BBox,
  ): CanvasGradient {
    if (box && this.cssRelative()) {
      return this.withStops(this.relativeGradient(context, box));
    }
    return this.absoluteGradient(context);
  }

  private relativeGradient(
    context: CanvasRenderingContext2D,
    box: BBox,
  ): CanvasGradient {
    const {x, y} = box.center;
    const halfWidth = box.width / 2;
    const halfHeight = box.height / 2;
    switch (this.type()) {
      case 'linear': {
        const direction = this.to().sub(this.from()).normalized;
        const half =
          halfWidth * Math.abs(direction.x) +
          halfHeight * Math.abs(direction.y);
        return context.createLinearGradient(
          x - direction.x * half,
          y - direction.y * half,
          x + direction.x * half,
          y + direction.y * half,
        );
      }
      case 'conic':
        return context.createConicGradient(this.angle(), x, y);
      case 'radial': {
        const halfDiagonal = Math.hypot(halfWidth, halfHeight);
        return context.createRadialGradient(
          x,
          y,
          this.fromRadius() * halfDiagonal,
          x,
          y,
          this.toRadius() * halfDiagonal,
        );
      }
    }
  }

  @computed()
  private absoluteGradient(context: CanvasRenderingContext2D): CanvasGradient {
    let gradient: CanvasGradient;
    switch (this.type()) {
      case 'linear':
        gradient = context.createLinearGradient(
          this.from.x(),
          this.from.y(),
          this.to.x(),
          this.to.y(),
        );
        break;
      case 'conic':
        gradient = context.createConicGradient(
          this.angle(),
          this.from.x(),
          this.from.y(),
        );
        break;
      case 'radial':
        gradient = context.createRadialGradient(
          this.from.x(),
          this.from.y(),
          this.fromRadius(),
          this.to.x(),
          this.to.y(),
          this.toRadius(),
        );
        break;
    }

    return this.withStops(gradient);
  }

  private withStops(gradient: CanvasGradient): CanvasGradient {
    for (const {offset, color} of this.stops()) {
      gradient.addColorStop(
        unwrap(offset),
        new Color(unwrap(color)).serialize(),
      );
    }
    return gradient;
  }
}
