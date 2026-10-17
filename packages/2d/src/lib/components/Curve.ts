import {
  BBox,
  SerializedVector2,
  SignalValue,
  SimpleSignal,
  ThreadGenerator,
  TimingFunction,
  Vector2,
  clamp,
  easeOutCubic,
  easeOutSine,
  threadable,
  tween,
} from '@canvas-commons/core';
import {CurveDrawingInfo} from '../curves/CurveDrawingInfo';
import {CurvePoint} from '../curves/CurvePoint';
import {CurveProfile, profileToSVGPathData} from '../curves/CurveProfile';
import {getPointAtDistance} from '../curves/getPointAtDistance';
import {computed, initial, nodeName, signal} from '../decorators';
import {DesiredLength} from '../partials';
import {lineTo, moveTo, resolveCanvasStyle} from '../utils';
import {fadeColor} from '../utils/fadeColor';
import {Shape, ShapeProps} from './Shape';

// How far into a build the fill starts fading in.
const BUILD_FILL_START = 0.7;

export interface CurveProps extends ShapeProps {
  /**
   * {@inheritDoc Curve.alignChildren}
   */
  alignChildren?: SignalValue<boolean>;
  /**
   * {@inheritDoc Curve.rotateChildren}
   */
  rotateChildren?: SignalValue<boolean>;
  /**
   * {@inheritDoc Curve.closed}
   */
  closed?: SignalValue<boolean>;
  /**
   * {@inheritDoc Curve.start}
   */
  start?: SignalValue<number>;
  /**
   * {@inheritDoc Curve.startOffset}
   */
  startOffset?: SignalValue<number>;
  /**
   * {@inheritDoc Curve.startArrow}
   */
  startArrow?: SignalValue<boolean>;
  /**
   * {@inheritDoc Curve.end}
   */
  end?: SignalValue<number>;
  /**
   * {@inheritDoc Curve.endOffset}
   */
  endOffset?: SignalValue<number>;
  /**
   * {@inheritDoc Curve.endArrow}
   */
  endArrow?: SignalValue<boolean>;
  /**
   * {@inheritDoc Curve.arrowSize}
   */
  arrowSize?: SignalValue<number>;
}

@nodeName('Curve')
export abstract class Curve extends Shape {
  /**
   * Whether to place the children at the midpoint of the curve.
   *
   * @remarks
   * When enabled, the children are positioned relative to the point halfway
   * along the curve, with their x-axis following its tangent. Set
   * {@link rotateChildren} to `false` to keep them upright instead.
   *
   * @example
   * ```tsx
   * <Line points={[[-200, 0], [200, -100]]} alignChildren>
   *   <Txt text="label" y={-30} />
   * </Line>
   * ```
   */
  @initial(false)
  @signal()
  declare public readonly alignChildren: SimpleSignal<boolean, this>;

  /**
   * Whether children placed by {@link alignChildren} follow the tangent of the
   * curve.
   */
  @initial(true)
  @signal()
  declare public readonly rotateChildren: SimpleSignal<boolean, this>;

  /**
   * Whether the curve should be closed.
   *
   * @remarks
   * Closed curves have their start and end points connected.
   */
  @initial(false)
  @signal()
  declare public readonly closed: SimpleSignal<boolean, this>;

  /**
   * A percentage from the start before which the curve should be clipped.
   *
   * @remarks
   * The portion of the curve that comes before the given percentage will be
   * made invisible.
   *
   * This property is usefully for animating the curve appearing on the screen.
   * The value of `0` means the very start of the curve (accounting for the
   * {@link startOffset}) while `1` means the very end (accounting for the
   * {@link endOffset}).
   */
  @initial(0)
  @signal()
  declare public readonly start: SimpleSignal<number, this>;

  /**
   * The offset in pixels from the start of the curve.
   *
   * @remarks
   * This property lets you specify where along the defined curve the actual
   * visible portion starts. For example, setting it to `20` will make the first
   * 20 pixels of the curve invisible.
   *
   * This property is useful for trimming the curve using a fixed distance.
   * If you want to animate the curve appearing on the screen, use {@link start}
   * instead.
   */
  @initial(0)
  @signal()
  declare public readonly startOffset: SimpleSignal<number, this>;

  /**
   * Whether to display an arrow at the start of the visible curve.
   *
   * @remarks
   * Use {@link arrowSize} to control the size of the arrow.
   */
  @initial(false)
  @signal()
  declare public readonly startArrow: SimpleSignal<boolean, this>;

  /**
   * A percentage from the start after which the curve should be clipped.
   *
   * @remarks
   * The portion of the curve that comes after the given percentage will be
   * made invisible.
   *
   * This property is usefully for animating the curve appearing on the screen.
   * The value of `0` means the very start of the curve (accounting for the
   * {@link startOffset}) while `1` means the very end (accounting for the
   * {@link endOffset}).
   */
  @initial(1)
  @signal()
  declare public readonly end: SimpleSignal<number, this>;

  /**
   * The offset in pixels from the end of the curve.
   *
   * @remarks
   * This property lets you specify where along the defined curve the actual
   * visible portion ends. For example, setting it to `20` will make the last
   * 20 pixels of the curve invisible.
   *
   * This property is useful for trimming the curve using a fixed distance.
   * If you want to animate the curve appearing on the screen, use {@link end}
   * instead.
   */
  @initial(0)
  @signal()
  declare public readonly endOffset: SimpleSignal<number, this>;

  /**
   * Whether to display an arrow at the end of the visible curve.
   *
   * @remarks
   * Use {@link arrowSize} to control the size of the arrow.
   */
  @initial(false)
  @signal()
  declare public readonly endArrow: SimpleSignal<boolean, this>;

  /**
   * Controls the size of the end and start arrows.
   *
   * @remarks
   * To make the arrows visible make sure to enable {@link startArrow} and/or
   * {@link endArrow}.
   */
  @initial(24)
  @signal()
  declare public readonly arrowSize: SimpleSignal<number, this>;

  protected canHaveSubpath = false;

  protected override desiredSize(): SerializedVector2<DesiredLength> {
    return this.childrenBBox().size;
  }

  public constructor(props: CurveProps) {
    super(props);
  }

  protected abstract childrenBBox(): BBox;

  public abstract profile(): CurveProfile;

  /**
   * Convert a percentage along the curve to a distance.
   *
   * @remarks
   * The returned distance is given in relation to the full curve, not
   * accounting for {@link startOffset} and {@link endOffset}.
   *
   * @param value - The percentage along the curve.
   */
  public percentageToDistance(value: number): number {
    return clamp(
      0,
      this.baseArcLength(),
      this.startOffset() + this.offsetArcLength() * value,
    );
  }

  /**
   * Convert a distance along the curve to a percentage.
   *
   * @remarks
   * The distance should be given in relation to the full curve, not
   * accounting for {@link startOffset} and {@link endOffset}.
   *
   * @param value - The distance along the curve.
   */
  public distanceToPercentage(value: number): number {
    return (value - this.startOffset()) / this.offsetArcLength();
  }

  /**
   * The base arc length of this curve.
   *
   * @remarks
   * This is the entire length of this curve, not accounting for
   * {@link startOffset | the offsets}.
   */
  public baseArcLength() {
    return this.profile().arcLength;
  }

  /**
   * The offset arc length of this curve.
   *
   * @remarks
   * This is the length of the curve that accounts for
   * {@link startOffset | the offsets}.
   */
  public offsetArcLength() {
    const startOffset = this.startOffset();
    const endOffset = this.endOffset();
    const baseLength = this.baseArcLength();
    return clamp(0, baseLength, baseLength - startOffset - endOffset);
  }

  /**
   * The visible arc length of this curve.
   *
   * @remarks
   * This arc length accounts for both the offset and the {@link start} and
   * {@link end} properties.
   */
  @computed()
  public arcLength() {
    return this.offsetArcLength() * Math.abs(this.start() - this.end());
  }

  /**
   * The percentage of the curve that's currently visible.
   *
   * @remarks
   * The returned value is the ratio between the visible length (as defined by
   * {@link start} and {@link end}) and the offset length of the curve.
   */
  public completion(): number {
    return Math.abs(this.start() - this.end());
  }

  protected processSubpath(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _path: Path2D,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _startPoint: Vector2 | null,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _endPoint: Vector2 | null,
  ) {
    // do nothing
  }

  /**
   * How much of the visible part of the curve {@link build} has drawn.
   *
   * @remarks
   * It scales {@link end}, so a build leaves the `end` of the curve alone.
   */
  @initial(1)
  @signal()
  declare protected readonly buildProgress: SimpleSignal<number, this>;

  /**
   * The end of the visible part of the curve, as drawn.
   */
  @computed()
  protected drawnEnd(): number {
    return this.end() * this.buildProgress();
  }

  /**
   * Draw the curve on: trace it from its start, then fade its fill in.
   *
   * @remarks
   * The fill fades in over the last part of the trace. A gradient fades
   * through its middle stop and a pattern simply stays, since neither can
   * fade.
   *
   * @example
   * ```tsx
   * const circle = createRef<Circle>();
   * view.add(<Circle ref={circle} size={200} stroke="white" fill="red" />);
   * yield* circle().build(1);
   * ```
   *
   * @param duration - The duration of the animation in seconds.
   * @param timingFunction - The easing of the trace.
   */
  @threadable()
  public *build(
    duration = 0.6,
    timingFunction: TimingFunction = easeOutCubic,
  ): ThreadGenerator {
    const fill = this.fill.context.raw();
    const fade = fadeColor(this.fill());
    const alpha = fade?.alpha() ?? 0;
    if (fade) this.fill(null);
    this.buildProgress(0);

    yield* tween(duration, value => {
      const progress = timingFunction(value);
      this.buildProgress(progress);
      if (fade && progress > BUILD_FILL_START) {
        const fill = easeOutSine(
          (progress - BUILD_FILL_START) / (1 - BUILD_FILL_START),
        );
        this.fill(fade.alpha(alpha * fill));
      }
    });

    this.buildProgress(1);
    if (fade && fill !== undefined) this.fill(fill);
  }

  @computed()
  protected curveDrawingInfo(): CurveDrawingInfo {
    const path = new Path2D();
    let subpath = new Path2D();
    const profile = this.profile();

    let start = this.percentageToDistance(this.start());
    let end = this.percentageToDistance(this.drawnEnd());
    if (start > end) {
      [start, end] = [end, start];
    }

    const distance = end - start;
    if (distance <= 0) {
      // An empty stroke still draws its caps, which would leave a dot where
      // a curve that is drawn on starts.
      return {
        startPoint: Vector2.zero,
        startTangent: Vector2.right,
        endPoint: Vector2.zero,
        endTangent: Vector2.right,
        arrowSize: 0,
        path,
        startOffset: start,
      };
    }
    const arrowSize = Math.min(distance / 2, this.arrowSize());

    if (this.startArrow()) {
      start += arrowSize / 2;
    }

    if (this.endArrow()) {
      end -= arrowSize / 2;
    }

    let length = 0;
    let startPoint = null;
    let startTangent = null;
    let endPoint = null;
    let endTangent = null;
    for (const segment of profile.segments) {
      const previousLength = length;
      length += segment.arcLength;
      if (length < start) {
        continue;
      }

      const relativeStart = (start - previousLength) / segment.arcLength;
      const relativeEnd = (end - previousLength) / segment.arcLength;

      const clampedStart = clamp(0, 1, relativeStart);
      const clampedEnd = clamp(0, 1, relativeEnd);

      if (
        this.canHaveSubpath &&
        endPoint &&
        !segment.getPoint(0).position.equals(endPoint)
      ) {
        path.addPath(subpath);
        this.processSubpath(subpath, startPoint, endPoint);
        subpath = new Path2D();
        startPoint = null;
      }

      const [startCurvePoint, endCurvePoint] = segment.draw(
        subpath,
        clampedStart,
        clampedEnd,
        startPoint === null,
      );

      if (startPoint === null) {
        startPoint = startCurvePoint.position;
        startTangent = startCurvePoint.normal.flipped.perpendicular;
      }

      endPoint = endCurvePoint.position;
      endTangent = endCurvePoint.normal.flipped.perpendicular;
      if (length > end) {
        break;
      }
    }

    if (
      this.closed() &&
      this.start.isInitial() &&
      this.end.isInitial() &&
      this.startOffset.isInitial() &&
      this.endOffset.isInitial()
    ) {
      subpath.closePath();
    }
    this.processSubpath(subpath, startPoint, endPoint);
    path.addPath(subpath);

    return {
      startPoint: startPoint ?? Vector2.zero,
      startTangent: startTangent ?? Vector2.right,
      endPoint: endPoint ?? Vector2.zero,
      endTangent: endTangent ?? Vector2.right,
      arrowSize,
      path,
      startOffset: start,
    };
  }

  protected getPointAtDistance(value: number): CurvePoint {
    return getPointAtDistance(this.profile(), value + this.startOffset());
  }

  public getPointAtPercentage(value: number): CurvePoint {
    return getPointAtDistance(this.profile(), this.percentageToDistance(value));
  }

  protected override getComputedLayout(): BBox {
    return this.offsetComputedLayout(super.getComputedLayout());
  }

  protected offsetComputedLayout(box: BBox): BBox {
    box.position = box.position.sub(this.childrenBBox().center);
    return box;
  }

  protected override getPath(): Path2D {
    return this.curveDrawingInfo().path;
  }

  @computed()
  protected override getPathData(): string {
    if (this.isClipped()) {
      return this.visiblePathData();
    }
    return profileToSVGPathData(this.profile());
  }

  /**
   * Get the rotation that keeps a child placed by {@link alignChildren}
   * readable.
   *
   * @remarks
   * Counters the tangent at the midpoint of the curve in steps of 90 degrees,
   * so a label turns with the curve without ever ending up upside down.
   *
   * @example
   * ```tsx
   * <Line ref={line} points={points} alignChildren>
   *   <Txt text="label" rotation={() => line().uprightRotation()} />
   * </Line>
   * ```
   */
  @computed()
  public uprightRotation(): number {
    if (!this.alignChildren() || !this.rotateChildren()) {
      return 0;
    }
    return -Math.round(this.midpointAngle() / 90) * 90;
  }

  private midpointAngle(): number {
    return this.getPointAtPercentage(0.5).normal.flipped.perpendicular.degrees;
  }

  @computed()
  protected override childrenToLocal(): DOMMatrix | null {
    if (!this.alignChildren()) {
      return null;
    }

    const {position} = this.getPointAtPercentage(0.5);
    const matrix = new DOMMatrix().translateSelf(position.x, position.y);
    return this.rotateChildren()
      ? matrix.rotateSelf(0, 0, this.midpointAngle())
      : matrix;
  }

  /**
   * Whether {@link start} or {@link end} hide part of the curve.
   */
  protected isClipped(): boolean {
    return this.start() !== 0 || this.drawnEnd() !== 1;
  }

  /**
   * The path data of the part of the curve between {@link start} and
   * {@link end}.
   */
  @computed()
  protected visiblePathData(): string {
    let start = this.percentageToDistance(this.start());
    let end = this.percentageToDistance(this.drawnEnd());
    if (start > end) {
      [start, end] = [end, start];
    }

    const commands: string[] = [];
    let length = 0;
    let last: Vector2 | null = null;
    for (const segment of this.profile().segments) {
      const previousLength = length;
      length += segment.arcLength;
      if (length <= start || segment.arcLength === 0) continue;
      if (previousLength >= end) break;

      const relativeStart = clamp(
        0,
        1,
        (start - previousLength) / segment.arcLength,
      );
      const relativeEnd = clamp(
        0,
        1,
        (end - previousLength) / segment.arcLength,
      );
      if (relativeEnd > relativeStart) {
        const from = segment.getPoint(relativeStart).position;
        const move = last === null || !from.equals(last);
        commands.push(segment.toSVGCommands(relativeStart, relativeEnd, move));
        last = segment.getPoint(relativeEnd).position;
      }
    }
    return commands.join(' ');
  }

  protected override getCacheBBox(): BBox {
    const box = this.childrenBBox();
    const arrowSize =
      this.startArrow() || this.endArrow() ? this.arrowSize() : 0;
    const lineWidth = this.lineWidth();

    const coefficient = this.lineWidthCoefficient();

    return box.expand(Math.max(0, arrowSize, lineWidth * coefficient));
  }

  protected lineWidthCoefficient(): number {
    return this.lineCap() === 'square' ? 0.5 * 1.4143 : 0.5;
  }

  /**
   * Check if the path requires a profile.
   *
   * @remarks
   * The profile is only required if certain features are used. Otherwise, the
   * profile generation can be skipped, and the curve can be drawn directly
   * using the 2D context.
   */
  protected requiresProfile(): boolean {
    return (
      !this.start.isInitial() ||
      !this.startOffset.isInitial() ||
      !this.startArrow.isInitial() ||
      !this.end.isInitial() ||
      !this.endOffset.isInitial() ||
      !this.endArrow.isInitial() ||
      this.buildProgress() < 1
    );
  }

  protected override drawShape(context: CanvasRenderingContext2D) {
    super.drawShape(context);
    if (this.startArrow() || this.endArrow()) {
      this.drawArrows(context);
    }
  }

  private drawArrows(context: CanvasRenderingContext2D) {
    const {startPoint, startTangent, endPoint, endTangent, arrowSize} =
      this.curveDrawingInfo();
    if (arrowSize < 0.001) {
      return;
    }

    context.save();
    context.beginPath();
    if (this.endArrow()) {
      this.drawArrow(context, endPoint, endTangent.flipped, arrowSize);
    }
    if (this.startArrow()) {
      this.drawArrow(context, startPoint, startTangent, arrowSize);
    }
    context.fillStyle = resolveCanvasStyle(
      this.stroke(),
      context,
      this.getCacheBBox(),
    );
    context.closePath();
    context.fill();
    context.restore();
  }

  private drawArrow(
    context: CanvasRenderingContext2D | Path2D,
    center: Vector2,
    tangent: Vector2,
    arrowSize: number,
  ) {
    const normal = tangent.perpendicular;
    const origin = center.add(tangent.scale(-arrowSize / 2));

    moveTo(context, origin);
    lineTo(context, origin.add(tangent.add(normal).scale(arrowSize)));
    lineTo(context, origin.add(tangent.sub(normal).scale(arrowSize)));
    lineTo(context, origin);
    context.closePath();
  }
}
