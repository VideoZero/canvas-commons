import {
  BBox,
  Matrix2D,
  PossibleSpacing,
  RAD2DEG,
  SerializedVector2,
  SignalValue,
  SimpleSignal,
  ThreadGenerator,
  TimingFunction,
  Vector2,
  all,
  clamp,
  clampRemap,
  delay,
  easeInOutSine,
  easeOutCubic,
  easeOutSine,
  isReactive,
  lazy,
  linear,
  sequence,
  threadable,
  tween,
  useLogger,
  useRandom,
  waitFor,
} from '@canvas-commons/core';
import {computed, signal} from '../decorators';
import {PathMorpher, defaultMorpher} from '../morphers';
import {DesiredLength, Gradient, PossibleCanvasStyle} from '../partials';
import {applyTransformDiff, getTransformDiff} from '../utils/diff';
import {getDomContainer} from '../utils/domContainer';
import {resolveSVGPaintServer} from '../utils/svgPaintServer';
import {fadeColor} from '../utils/fadeColor';
import {Circle, CircleProps} from './Circle';
import {Curve} from './Curve';
import {Img, ImgProps} from './Img';
import {Layout} from './Layout';
import {Line, LineProps} from './Line';
import {Node, NodeProps} from './Node';
import {Path, PathProps} from './Path';
import {Rect, RectProps} from './Rect';
import {Shape, ShapeProps} from './Shape';

const DEFAULT_FONT_SIZE = 16;
const FALLBACK_SIZE = 100;

/**
 * Represent SVG shape.
 * This only used single time because `node` may have reference to parent SVG renderer.
 */
export interface SVGShape {
  id: string;
  shape: Node;
}

/**
 * Data of SVGShape.
 * This can used many times  because it do not reference parent SVG.
 * This must build into SVGShape
 */
export interface SVGShapeData {
  id: string;
  type: new (props: NodeProps) => Node;
  props: ShapeProps;
  children?: SVGShapeData[];
}

/**
 * Represent SVG document that contains SVG shapes.
 * This only used single time because `nodes` have reference to parent SVG renderer.
 */
export interface SVGDocument {
  size: Vector2;
  nodes: SVGShape[];
}

/**
 * Data of SVGDocument.
 * This can used many times because it do not reference parent SVG.
 * This must build into SVGDocument
 */
export interface SVGDocumentData {
  size: Vector2;
  nodes: SVGShapeData[];
}

/**
 * The order {@link SVG.build} and {@link SVG.unbuild} sequence shapes in.
 */
export type SVGBuildOrder = 'forward' | 'reverse' | 'random';

export interface SVGBuildOptions {
  /**
   * How much of the drawing of a shape the next one starts within, from `0`
   * (one after another) to `1` (all at once).
   *
   * @remarks
   * The total duration stays the same, so less overlap draws each shape
   * faster.
   *
   * @defaultValue 0.5
   */
  overlap?: number;
  /**
   * The order to sequence shapes in.
   *
   * @remarks
   * `'random'` is seeded by the scene, so a shuffled build plays the same way
   * every time.
   *
   * @defaultValue 'forward'
   */
  order?: SVGBuildOrder;
  /**
   * Whether a shape with a fill but no stroke borrows an outline to draw.
   *
   * @remarks
   * With an outline, a line traces the shape, its fill fades in behind it, and
   * the line goes. Without one, the fill fades in over the whole time of the
   * shape. Shapes with a stroke of their own always trace it.
   *
   * @defaultValue true
   */
  outline?: boolean;
  /**
   * The width of a borrowed outline, in the units of the document.
   *
   * @remarks
   * A document whose units are far from its display size needs a wider one,
   * such as a typeset formula with a thousand units to the em.
   *
   * @defaultValue 1
   */
  outlineWidth?: number;
}

/** The paint of a curve as the document set it, before a build changed it. */
interface AuthoredPaint {
  fill: SignalValue<PossibleCanvasStyle> | undefined;
  stroke: SignalValue<PossibleCanvasStyle> | undefined;
  lineWidth: SignalValue<number> | undefined;
  strokeFirst: SignalValue<boolean> | undefined;
  end: SignalValue<number> | undefined;
}

export interface SVGProps extends ShapeProps {
  svg: SignalValue<string>;
  morpher?: PathMorpher;
}

/**
A Node for drawing and animating SVG images.

@remarks
If you're not interested in animating SVG, you can use {@link Img} instead.
 */
export class SVG extends Shape {
  @lazy(() => {
    // A shadow root keeps the page's stylesheets from restyling the SVG.
    const host = document.createElement('div');
    getDomContainer().appendChild(host);
    const element = document.createElement('div');
    element.style.color = SVG.currentColorSentinel;
    host.attachShadow({mode: 'open'}).appendChild(element);
    return element;
  })
  protected static containerElement: HTMLDivElement;
  // What a computed paint resolves to when it says `currentColor`.
  private static readonly currentColorSentinel = 'rgb(1, 2, 3)';
  private static svgNodesPool: Record<string, SVGDocumentData> = {};

  /**
   * The morpher an SVG uses when it is not given one.
   *
   * @remarks
   * Set it before creating the nodes it should apply to: each node reads it
   * once, when it is constructed. It covers every SVG-based node, including
   * `Latex` and `Icon`.
   *
   * @example
   * ```ts
   * import {SVG, manimMorpher} from '@canvas-commons/2d';
   *
   * SVG.defaultMorpher = manimMorpher();
   * ```
   */
  public static defaultMorpher: PathMorpher = defaultMorpher();

  /**
   * SVG string to be rendered
   */
  @signal()
  declare public readonly svg: SimpleSignal<string, this>;

  /**
   * Child to wrap all SVG node
   */
  public wrapper: Node;

  protected readonly morpher: PathMorpher;

  private readonly authoredPaints = new WeakMap<Curve, AuthoredPaint>();

  private lastTweenTargetSrc: string | null = null;
  private lastTweenTargetDocument: SVGDocument | null = null;

  public constructor(props: SVGProps) {
    const {morpher, ...rest} = props;
    super(rest);
    this.morpher = morpher ?? SVG.defaultMorpher;
    this.wrapper = new Node({});
    this.wrapper.children(this.documentNodes);
    this.wrapper.scale(this.wrapperScale);
    this.add(this.wrapper);
  }

  /**
   * All curves in the document, in document order.
   */
  @computed()
  public orderedCurveDescendants(): Curve[] {
    return this.wrapper.findAll((node): node is Curve => node instanceof Curve);
  }

  /**
   * Draw the document on, one shape after another.
   *
   * @remarks
   * Each shape traces its stroke and then fades its fill in. A shape with a
   * fill but no stroke traces a borrowed outline; see
   * {@link SVGBuildOptions.outline}.
   *
   * @example
   * ```tsx
   * const svg = createRef<SVG>();
   * view.add(<SVG ref={svg} svg={logo} />);
   * yield* svg().build(2, undefined, {order: 'random', overlap: 0.8});
   * ```
   *
   * @param duration - The duration of the whole animation in seconds.
   * @param timingFunction - The easing of each trace. Without one, a trace
   *                         around a filled shape runs at a constant speed
   *                         and any other eases out.
   * @param options - See {@link SVGBuildOptions}.
   */
  @threadable()
  public *build(
    duration = 4,
    timingFunction?: TimingFunction,
    options: SVGBuildOptions = {},
  ): ThreadGenerator {
    yield* this.sequenceBuild(true, duration, timingFunction, options);
  }

  /**
   * Draw the document off: {@link build} played backwards.
   *
   * @remarks
   * Each shape fades its fill out and retracts its stroke, which leaves the
   * document invisible but intact. A later {@link build} draws it on with the
   * paint it was authored with.
   *
   * `order` names the build to undo, so the options of a build undo it.
   *
   * @example
   * ```tsx
   * yield* svg().build(2, undefined, {order: 'reverse'});
   * yield* svg().unbuild(2, undefined, {order: 'reverse'});
   * ```
   *
   * @param duration - The duration of the whole animation in seconds.
   * @param timingFunction - The easing of each trace.
   * @param options - See {@link SVGBuildOptions}.
   */
  @threadable()
  public *unbuild(
    duration = 4,
    timingFunction?: TimingFunction,
    options: SVGBuildOptions = {},
  ): ThreadGenerator {
    yield* this.sequenceBuild(false, duration, timingFunction, options);
  }

  /**
   * The paint a curve was authored with.
   *
   * @remarks
   * Builds change the paint of the curves they draw, so the first one to see
   * a curve records it for the ones that follow.
   */
  private authoredPaint(curve: Curve): AuthoredPaint {
    let paint = this.authoredPaints.get(curve);
    if (!paint) {
      paint = {
        fill: curve.fill.context.raw(),
        stroke: curve.stroke.context.raw(),
        lineWidth: curve.lineWidth.context.raw(),
        strokeFirst: curve.strokeFirst.context.raw(),
        end: curve.end.context.raw(),
      };
      this.authoredPaints.set(curve, paint);
    }
    return paint;
  }

  private static restore<T>(
    signal: {context: {setter(value: SignalValue<T>): unknown}},
    value: SignalValue<T> | undefined,
  ) {
    if (value !== undefined) signal.context.setter(value);
  }

  @threadable()
  protected *sequenceBuild(
    draw: boolean,
    duration: number,
    timingFunction: TimingFunction | undefined,
    {
      overlap = 0.5,
      order = 'forward',
      outline = true,
      outlineWidth = 1,
    }: SVGBuildOptions,
  ): ThreadGenerator {
    const curves = this.orderedCurveDescendants();
    if (curves.length === 0) return;

    const traceEasing = timingFunction ?? linear;
    const curveEasing = timingFunction ?? easeOutCubic;

    const shapes = curves.map(curve => {
      const authored = this.authoredPaint(curve);
      if (draw) SVG.restore(curve.fill, authored.fill);
      SVG.restore(curve.stroke, authored.stroke);
      SVG.restore(curve.lineWidth, authored.lineWidth);
      SVG.restore(curve.strokeFirst, authored.strokeFirst);
      const fill = curve.fill();
      const fade = fadeColor(fill);
      const stroked = curve.stroke() !== null && curve.lineWidth() > 0;
      return {
        curve,
        authored,
        fade,
        hasFill: fill !== null,
        borrowed: !stroked && outline && fade !== null,
        fillOnly: !stroked && !(outline && fade !== null),
      };
    });

    if (draw) {
      for (const {curve} of shapes) {
        curve.end(0);
        curve.fill(null);
      }
    }

    const clamped = clamp(0, 1, overlap);
    const perShape = duration / (shapes.length - clamped * (shapes.length - 1));
    const stagger = perShape * (1 - clamped);
    const sequenced = SVG.inOrder(shapes, order);
    if (!draw) sequenced.reverse();

    yield* sequence(
      stagger,
      ...sequenced.map(
        ({curve, authored, fade, hasFill, borrowed, fillOnly}) => {
          const traced = hasFill && !fillOnly;
          const strokeDuration = traced ? perShape * 0.7 : perShape;
          const fillDuration = traced ? perShape * 0.3 : perShape;
          const easing = hasFill ? traceEasing : curveEasing;

          function* strokePhase(): ThreadGenerator {
            if (borrowed) curve.lineWidth(outlineWidth);
            if (draw) {
              yield curve.end(1, strokeDuration, easing);
              yield* waitFor(strokeDuration);
            } else {
              yield* curve.end(0, strokeDuration, easing);
            }
          }

          function* fillPhase(): ThreadGenerator {
            if (!fade) {
              if (draw) SVG.restore(curve.fill, authored.fill);
              else curve.fill(null);
              yield* waitFor(fillDuration);
              return;
            }
            const alpha = fade.alpha();
            yield* tween(fillDuration, value => {
              const progress = draw
                ? easeOutSine(value)
                : 1 - easeOutSine(value);
              curve.fill(fade.alpha(alpha * progress));
              if (borrowed) {
                curve.lineWidth(Math.max(0, outlineWidth * (1 - progress)));
              }
            });
            if (draw) SVG.restore(curve.fill, authored.fill);
            else curve.fill(null);
          }

          function* animate(): ThreadGenerator {
            if (!hasFill) {
              yield* strokePhase();
            } else if (fillOnly) {
              if (draw) curve.end(1);
              yield* fillPhase();
              if (!draw) curve.end(0);
            } else {
              if (borrowed) {
                curve.strokeFirst(true);
                curve.stroke(fade);
              }
              if (draw) {
                yield* strokePhase();
                yield* fillPhase();
              } else {
                yield* fillPhase();
                yield* strokePhase();
              }
            }

            if (draw) {
              SVG.restore(curve.end, authored.end);
              SVG.restore(curve.lineWidth, authored.lineWidth);
              SVG.restore(curve.stroke, authored.stroke);
              SVG.restore(curve.strokeFirst, authored.strokeFirst);
            } else if (borrowed) {
              SVG.restore(curve.lineWidth, authored.lineWidth);
              SVG.restore(curve.stroke, authored.stroke);
              SVG.restore(curve.strokeFirst, authored.strokeFirst);
            }
          }
          return animate();
        },
      ),
    );
  }

  /** A copy of `items` in the order `order` asks for. */
  private static inOrder<T>(items: T[], order: SVGBuildOrder): T[] {
    if (order === 'reverse') return [...items].reverse();
    if (order !== 'random') return [...items];
    const random = useRandom();
    const shuffled = [...items];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = random.nextInt(0, i + 1);
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  /**
   * Get all SVG nodes with the given id.
   * @param id - An id to query.
   */
  public getChildrenById(id: string) {
    return this.document()
      .nodes.filter(node => node.id === id)
      .map(({shape}) => shape);
  }

  protected override desiredSize(): SerializedVector2<DesiredLength> {
    const docSize = this.document().size;
    const scale = this.calculateWrapperScale(
      docSize,
      super.desiredSize() as SerializedVector2<number | null>,
    );
    return docSize.mul(scale);
  }

  protected getCurrentSize() {
    return {
      x: this.width.isInitial() ? null : this.width(),
      y: this.height.isInitial() ? null : this.height(),
    };
  }

  protected calculateWrapperScale(
    documentSize: Vector2,
    parentSize: SerializedVector2<number | null>,
  ) {
    const result = new Vector2(1, 1);
    if (parentSize.x && parentSize.y) {
      result.x = parentSize.x / documentSize.width;
      result.y = parentSize.y / documentSize.height;
    } else if (parentSize.x && !parentSize.y) {
      result.x = parentSize.x / documentSize.width;
      result.y = result.x;
    } else if (!parentSize.x && parentSize.y) {
      result.y = parentSize.y / documentSize.height;
      result.x = result.y;
    }
    return result;
  }

  /**
   * Convert `SVGDocumentData` to `SVGDocument`.
   * @param data - `SVGDocumentData` to convert.
   */
  protected buildDocument(data: SVGDocumentData): SVGDocument {
    return {
      size: data.size,
      nodes: data.nodes.map(ch => this.buildShape(ch)),
    };
  }

  /**
   * Convert `SVGShapeData` to `SVGShape`.
   * @param data - `SVGShapeData` to convert.
   */
  protected buildShape({id, type, props, children}: SVGShapeData): SVGShape {
    return {
      id,
      shape: new type({
        children: children?.map(ch => this.buildShape(ch).shape),
        ...this.processElementStyle(props),
      }),
    };
  }

  /**
   * Convert an SVG string to `SVGDocument`.
   * @param svg - An SVG string to be parsed.
   */
  protected parseSVG(svg: string): SVGDocument {
    return this.buildDocument(SVG.parseSVGData(svg));
  }

  /**
   * Create a tweening list to tween between two SVG nodes.
   * @param from - The initial node,
   * @param to - The final node.
   * @param duration - The duration of the tween.
   * @param timing - The timing function.
   */
  protected *generateTransformer(
    from: Node,
    to: Node,
    duration: number,
    timing: TimingFunction,
  ): Generator<ThreadGenerator> {
    yield from.position(to.position(), duration, timing);
    yield from.scale(to.scale(), duration, timing);
    yield from.rotation(to.rotation(), duration, timing);
    yield from.skew(to.skew(), duration, timing);
    if (
      from instanceof Path &&
      to instanceof Path &&
      from.data() !== to.data()
    ) {
      const toData = to.data();
      const interpolator = this.morpher.createInterpolator(from.data(), toData);

      yield from.data(toData, duration, timing, (_from, _to, value) =>
        interpolator(value),
      );
    }
    if (from instanceof Layout && to instanceof Layout) {
      yield from.size(to.size(), duration, timing);
    }
    if (from instanceof Shape && to instanceof Shape) {
      yield from.fill(to.fill(), duration, timing);
      yield from.stroke(to.stroke(), duration, timing);
      yield from.lineWidth(to.lineWidth(), duration, timing);
    }

    const fromChildren = from.children();
    const toChildren = to.children();
    for (let i = 0; i < fromChildren.length; i++) {
      yield* this.generateTransformer(
        fromChildren[i],
        toChildren[i],
        duration,
        timing,
      );
    }
  }

  @threadable()
  protected *tweenSvg(
    value: SignalValue<string>,
    time: number,
    timingFunction: TimingFunction,
  ) {
    const newValue = isReactive(value) ? value() : value;
    let newSVG: SVGDocument;
    try {
      newSVG = this.parseSVG(newValue);
    } catch (e) {
      useLogger().warn(`Failed to parse SVG during tween: ${e}`);
      newSVG = {size: new Vector2(0, 0), nodes: []};
    }
    const currentSVG = this.document();

    if (currentSVG.nodes.length === 0 || newSVG.nodes.length === 0) {
      this.svg.context.setter(newValue);
      return;
    }

    const diff = getTransformDiff(currentSVG.nodes, newSVG.nodes);

    this.lastTweenTargetSrc = newValue;
    this.lastTweenTargetDocument = newSVG;

    applyTransformDiff(currentSVG.nodes, diff, ({shape, ...rest}) => ({
      ...rest,
      shape: shape.clone(),
    }));
    this.wrapper.children(currentSVG.nodes.map(shape => shape.shape));
    for (const item of currentSVG.nodes) {
      item.shape.parent(this.wrapper);
    }

    const beginning = 0.2;
    const ending = 0.8;
    const overlap = 0.15;

    const transformator: ThreadGenerator[] = [];
    const transformatorTime = (ending - beginning) * time;
    const transformatorDelay = beginning * time;

    for (const item of diff.transformed) {
      transformator.push(
        ...this.generateTransformer(
          item.from.current.shape,
          item.to.current.shape,
          transformatorTime,
          timingFunction,
        ),
      );
    }

    const autoWidth = this.width.isInitial();
    const autoHeight = this.height.isInitial();
    this.wrapper.scale(
      this.calculateWrapperScale(currentSVG.size, this.getCurrentSize()),
    );

    const baseTween = tween(
      time,
      value => {
        const progress = timingFunction(value);
        const remapped = clampRemap(beginning, ending, 0, 1, progress);

        const scale = this.wrapper.scale();
        if (autoWidth) {
          this.width(
            easeInOutSine(remapped, currentSVG.size.x, newSVG.size.x) * scale.x,
          );
        }

        if (autoHeight) {
          this.height(
            easeInOutSine(remapped, currentSVG.size.y, newSVG.size.y) * scale.y,
          );
        }

        const deletedOpacity = clampRemap(
          0,
          beginning + overlap,
          1,
          0,
          progress,
        );
        for (const {current} of diff.deleted) {
          current.shape.opacity(deletedOpacity);
        }

        const insertedOpacity = clampRemap(ending - overlap, 1, 0, 1, progress);
        for (const {current} of diff.inserted) {
          current.shape.opacity(insertedOpacity);
        }
      },
      () => {
        this.wrapper.children(this.documentNodes);
        if (autoWidth) this.width.reset();
        if (autoHeight) this.height.reset();

        for (const {current} of diff.deleted) current.shape.dispose();
        for (const {from} of diff.transformed) {
          from.current.shape.dispose();
        }
        this.wrapper.scale(this.wrapperScale);
      },
    );
    yield* all(
      this.wrapper.scale(
        this.calculateWrapperScale(newSVG.size, this.getCurrentSize()),
        time,
        timingFunction,
      ),
      baseTween,
      delay(transformatorDelay, all(...transformator)),
    );
  }

  @computed()
  protected wrapperScale(): Vector2 {
    return this.calculateWrapperScale(
      this.document().size,
      this.getCurrentSize(),
    );
  }

  /**
   * Get the current `SVGDocument`.
   */
  @computed()
  protected document(): SVGDocument {
    try {
      const src = this.svg();
      if (this.lastTweenTargetDocument && src === this.lastTweenTargetSrc) {
        return this.lastTweenTargetDocument;
      }
      return this.parseSVG(src);
    } catch (e) {
      useLogger().warn(`Failed to parse SVG document: ${e}`);
      return {
        size: new Vector2(0, 0),
        nodes: [],
      };
    } finally {
      this.lastTweenTargetSrc = null;
      this.lastTweenTargetDocument = null;
    }
  }

  /**
   * Get current document nodes.
   */
  @computed()
  protected documentNodes() {
    return this.document().nodes.map(node => node.shape);
  }

  /**
   * Convert SVG colors in Shape properties to Canvas Commons colors.
   * @param param - Shape properties.
   * @returns Converted Shape properties.
   */
  private processElementStyle({
    fill,
    stroke,
    lineWidth,
    strokeFirst,
    ...rest
  }: ShapeProps): ShapeProps {
    return {
      fill: fill === 'currentColor' ? this.fill : SVG.processSVGColor(fill),
      stroke:
        stroke === undefined || stroke === 'currentColor'
          ? this.stroke
          : SVG.processSVGColor(stroke),
      lineWidth: lineWidth || this.lineWidth,
      strokeFirst: strokeFirst ?? this.strokeFirst,
      ...rest,
    };
  }

  /**
   * Parse an SVG string as `SVGDocumentData`.
   * @param svg - And SVG string to be parsed.
   * @returns `SVGDocumentData` that can be used to build SVGDocument.
   */
  protected static parseSVGData(svg: string) {
    const cached = SVG.svgNodesPool[svg];
    if (cached && (cached.size.x > 0 || cached.size.y > 0)) return cached;

    SVG.containerElement.innerHTML = svg;

    const svgRoot = SVG.containerElement.querySelector('svg');

    if (!svgRoot) {
      useLogger().error({
        message: 'Invalid SVG',
        object: svg,
      });
      return {
        size: new Vector2(0, 0),
        nodes: [],
      } as SVGDocumentData;
    }

    let viewBox = SVG.readViewBox(svgRoot);
    let size: Vector2;
    if (svgRoot.hasAttribute('width') || svgRoot.hasAttribute('height')) {
      size = new Vector2(
        SVG.readLength(svgRoot, 'width'),
        SVG.readLength(svgRoot, 'height'),
      );
      viewBox ??= new BBox(0, 0, size.width, size.height);
    } else {
      viewBox ??= SVG.measureContent(svgRoot);
      size = viewBox.size;
    }

    const scale = size.div(viewBox.size);
    const center = viewBox.center;

    const rootTransform = new DOMMatrix()
      .scaleSelf(scale.x, scale.y)
      .translateSelf(-center.x, -center.y);

    const nodes = Array.from(
      SVG.extractGroupNodes(
        svgRoot,
        svgRoot,
        rootTransform,
        SVG.getElementStyle(svgRoot, {}),
      ),
    );

    const builder: SVGDocumentData = {
      size,
      nodes,
    };
    SVG.svgNodesPool[svg] = builder;
    return builder;
  }

  /**
   * Get position, rotation, scale and skew from Matrix transformation as Shape
   * properties.
   *
   * A node applies skew last, so a QR decomposition keeps the shear.
   *
   * @param transform - Matrix transformation
   * @returns CanvasCommons Shape properties
   */
  protected static getMatrixTransformation(transform: DOMMatrix): ShapeProps {
    const matrix = new Matrix2D(transform);
    const scaleX = matrix.x.magnitude;
    const degenerate = scaleX === 0;

    return {
      position: matrix.translation,
      rotation: matrix.rotation,
      scale: {
        x: scaleX,
        y: degenerate ? matrix.y.magnitude : matrix.determinant / scaleX,
      },
      skew: {
        x: degenerate
          ? 0
          : Math.atan(matrix.x.dot(matrix.y) / (scaleX * scaleX)) * RAD2DEG,
        y: 0,
      },
    };
  }

  /**
   * Convert an SVG color into a Canvas Commons color.
   * @param color - SVG color.
   * @returns Canvas Commons color.
   */
  private static processSVGColor(
    color: SignalValue<PossibleCanvasStyle> | undefined,
  ): SignalValue<PossibleCanvasStyle> | undefined {
    if (color === 'transparent' || color === 'none') {
      return null;
    }

    return color;
  }

  /**
   * Get the final transformation matrix for the given SVG element.
   * @param element - SVG element.
   * @param parentTransform - The transformation matrix of the parent.
   */
  private static getElementTransformation(
    element: SVGGraphicsElement,
    parentTransform: DOMMatrix,
  ) {
    const transform = element.transform.baseVal.consolidate();
    const transformMatrix = (
      transform ? parentTransform.multiply(transform.matrix) : parentTransform
    ).translate(
      SVG.parseNumberAttribute(element, 'x'),
      SVG.parseNumberAttribute(element, 'y'),
    );
    return transformMatrix;
  }

  private static readViewBox(svg: SVGSVGElement): BBox | null {
    if (!svg.hasAttribute('viewBox')) return null;
    try {
      const {x, y, width, height} = svg.viewBox.baseVal;
      return new BBox(x, y, width, height);
    } catch {
      // Safari can fail to expose the parsed viewBox.
    }

    const values = (svg.getAttribute('viewBox') ?? '')
      .trim()
      .split(/[\s,]+/)
      .map(value => parseFloat(value));
    if (values.length !== 4 || !values.every(Number.isFinite)) {
      useLogger().warn(`SVG: invalid viewBox "${svg.getAttribute('viewBox')}"`);
      return null;
    }
    const [x, y, width, height] = values;
    return new BBox(x, y, width, height);
  }

  private static readLength(
    svg: SVGSVGElement,
    name: 'width' | 'height',
  ): number {
    try {
      return svg[name].baseVal.value;
    } catch {
      // Safari can fail to expose the parsed length; jsdom never does.
    }

    const match = (svg.getAttribute(name) ?? '')
      .trim()
      .match(/^([+-]?[\d.]+(?:e[+-]?\d+)?)(px|em|ex|pt|pc|in|cm|mm)?$/i);
    if (!match) return 0;
    const value = parseFloat(match[1]);
    const fontSize =
      parseFloat(window.getComputedStyle(svg).fontSize) || DEFAULT_FONT_SIZE;
    switch (match[2]?.toLowerCase()) {
      case 'em':
        return value * fontSize;
      case 'ex':
        return (value * fontSize) / 2;
      case 'pt':
        return (value * 4) / 3;
      case 'pc':
        return value * 16;
      case 'in':
        return value * 96;
      case 'cm':
        return (value * 96) / 2.54;
      case 'mm':
        return (value * 96) / 25.4;
      default:
        return value;
    }
  }

  private static measureContent(svg: SVGSVGElement): BBox {
    try {
      return new BBox(svg.getBBox());
    } catch {
      // Safari can refuse to measure an element outside the document.
    }

    const container = document.createElement('div');
    container.style.position = 'absolute';
    container.style.visibility = 'hidden';
    container.style.pointerEvents = 'none';
    const clone = svg.cloneNode(true);
    container.appendChild(clone);
    document.body.appendChild(container);
    try {
      if (clone instanceof SVGSVGElement) {
        return new BBox(clone.getBBox());
      }
    } catch {
      // Handled below.
    } finally {
      container.remove();
    }

    useLogger().warn(
      'SVG: could not measure the document. Give the root element a viewBox or a width and height.',
    );
    return new BBox(0, 0, FALLBACK_SIZE, FALLBACK_SIZE);
  }

  private static parseLineCap(name: string | null): CanvasLineCap | null {
    if (!name) return null;
    if (name === 'butt' || name === 'round' || name === 'square') return name;

    useLogger().warn(`SVG: invalid line cap "${name}"`);
    return null;
  }

  private static parseLineJoin(name: string | null): CanvasLineJoin | null {
    if (!name) return null;
    if (name === 'bevel' || name === 'miter' || name === 'round') return name;

    if (name === 'arcs' || name === 'miter-clip') {
      useLogger().warn(`SVG: line join is not supported "${name}"`);
    } else {
      useLogger().warn(`SVG: invalid line join "${name}"`);
    }
    return null;
  }

  private static parseLineDash(value: string | null): number[] | null {
    if (!value) return null;
    if (value === 'none') return [];

    const list = value.split(/[\s,]+/).filter(str => str.length > 0);
    if (list.some(str => str.endsWith('%'))) {
      useLogger().warn(`SVG: percentage line dash are ignored`);
      return null;
    }
    const dash = list.map(str => parseFloat(str));
    return dash.every(Number.isFinite) ? dash : null;
  }

  private static parseDashOffset(value: string | null): number | null {
    if (!value) return null;
    const trimmed = value.trim();
    if (trimmed.endsWith('%')) {
      useLogger().warn(`SVG: percentage line dash offset are ignored`);
    }
    return parseFloat(trimmed);
  }

  private static parseOpacity(value: string | null): number | null {
    if (!value) return null;
    if (value.endsWith('%')) return parseFloat(value) / 100;
    return parseFloat(value);
  }

  /**
   * Read a presentation property the element sets itself.
   *
   * @remarks
   * The element's `style` wins over its attribute. Without either, the
   * computed style still reveals a value set by a stylesheet rule, such as one
   * in the document's own `<style>`: inherited properties set that way differ
   * from the parent's, and `opacity` differs from its initial value. Anything
   * else is left to `inheritedStyle`, which follows a `<use>` to its target
   * where the computed style would follow the target's own ancestors.
   */
  private static getPresentationProperty(
    element: SVGGraphicsElement,
    name: string,
  ): string | null {
    const own =
      element.style.getPropertyValue(name) || element.getAttribute(name);
    if (own) {
      return own === 'inherit' ? null : own;
    }

    const computed = window.getComputedStyle(element).getPropertyValue(name);
    if (!computed) return null;
    if (name === 'opacity') {
      return computed === '1' ? null : computed;
    }

    const parent = element.parentElement;
    const inherited = parent
      ? window.getComputedStyle(parent).getPropertyValue(name)
      : '';
    if (computed === inherited) return null;
    return computed === SVG.currentColorSentinel ? 'currentColor' : computed;
  }

  private static getPaint(
    element: SVGGraphicsElement,
    name: 'fill' | 'stroke',
  ): SignalValue<PossibleCanvasStyle> | undefined {
    const value = this.getPresentationProperty(element, name);
    if (value === null) return undefined;
    if (!value.startsWith('url(')) return value;

    let root: Element = element;
    while (root.parentElement instanceof SVGElement) {
      root = root.parentElement;
    }
    return resolveSVGPaintServer(value, root);
  }

  /**
   * Move gradients in user space into a node whose origin is `origin`.
   */
  private static paintAt(style: ShapeProps, origin: Vector2): ShapeProps {
    const move = (paint: ShapeProps['fill']) =>
      paint instanceof Gradient && !paint.cssRelative()
        ? new Gradient({
            type: paint.type(),
            from: paint.from().sub(origin),
            to: paint.to().sub(origin),
            angle: paint.angle(),
            fromRadius: paint.fromRadius(),
            toRadius: paint.toRadius(),
            stops: paint.stops(),
          })
        : paint;
    return {...style, fill: move(style.fill), stroke: move(style.stroke)};
  }

  /**
   * Convert the SVG element's style to a Canvas Commons Shape properties.
   * @param element - An SVG element whose style should be converted.
   * @param inheritedStyle - The parent style that should be inherited.
   */
  protected static getElementStyle(
    element: SVGGraphicsElement,
    inheritedStyle: ShapeProps,
  ): ShapeProps {
    const lineWidth = parseFloat(
      this.getPresentationProperty(element, 'stroke-width') ?? '',
    );

    return {
      fill: this.getPaint(element, 'fill') ?? inheritedStyle.fill,
      stroke: this.getPaint(element, 'stroke') ?? inheritedStyle.stroke,
      lineWidth: Number.isFinite(lineWidth)
        ? lineWidth
        : inheritedStyle.lineWidth,
      lineCap:
        this.parseLineCap(
          this.getPresentationProperty(element, 'stroke-linecap'),
        ) ?? inheritedStyle.lineCap,
      lineJoin:
        this.parseLineJoin(
          this.getPresentationProperty(element, 'stroke-linejoin'),
        ) ?? inheritedStyle.lineJoin,
      lineDash:
        this.parseLineDash(
          this.getPresentationProperty(element, 'stroke-dasharray'),
        ) ?? inheritedStyle.lineDash,
      lineDashOffset:
        this.parseDashOffset(
          this.getPresentationProperty(element, 'stroke-dashoffset'),
        ) ?? inheritedStyle.lineDashOffset,
      opacity:
        this.parseOpacity(this.getPresentationProperty(element, 'opacity')) ??
        inheritedStyle.opacity,
      layout: false,
    };
  }

  /**
   * Extract `SVGShapeData` list from the SVG element's children.
   * This will not extract the current element's shape.
   * @param element - An element whose children will be extracted.
   * @param svgRoot - The SVG root ("svg" tag) of the element.
   * @param parentTransform - The transformation matrix applied to the parent.
   * @param inheritedStyle - The style of the current SVG `element` that the children should inherit.
   */
  private static *extractGroupNodes(
    element: SVGElement,
    svgRoot: Element,
    parentTransform: DOMMatrix,
    inheritedStyle: ShapeProps,
  ): Generator<SVGShapeData> {
    for (const child of element.children) {
      if (!(child instanceof SVGGraphicsElement)) continue;

      yield* this.extractElementNodes(
        child,
        svgRoot,
        parentTransform,
        inheritedStyle,
      );
    }
  }

  /**
   * Parse a number from an SVG element attribute.
   * @param element - SVG element whose attribute will be parsed.
   * @param name - The name of the attribute to parse.
   * @returns a parsed number or `0` if the attribute is not defined.
   */
  private static parseNumberAttribute(
    element: SVGElement,
    name: string,
  ): number {
    return parseFloat(element.getAttribute(name) ?? '0');
  }

  /**
   * Extract `SVGShapeData` list from the SVG element.
   * This will also recursively extract shapes from its children.
   * @param child - An SVG element to extract.
   * @param svgRoot - The SVG root ("svg" tag) of the element.
   * @param parentTransform - The transformation matrix applied to the parent.
   * @param inheritedStyle - The style of the parent SVG element that the element should inherit.
   */
  private static *extractElementNodes(
    child: SVGGraphicsElement,
    svgRoot: Element,
    parentTransform: DOMMatrix,
    inheritedStyle: ShapeProps,
  ): Generator<SVGShapeData> {
    const transformMatrix = SVG.getElementTransformation(
      child,
      parentTransform,
    );
    const style = SVG.getElementStyle(child, inheritedStyle);
    const id = child.id ?? '';
    if (child.tagName === 'g') {
      yield* SVG.extractGroupNodes(child, svgRoot, transformMatrix, style);
    } else if (child.tagName === 'svg' && child instanceof SVGSVGElement) {
      let nestedTransform = transformMatrix;

      const vb = SVG.readViewBox(child);
      if (vb) {
        const width = SVG.parseNumberAttribute(child, 'width') || vb.width;
        const height = SVG.parseNumberAttribute(child, 'height') || vb.height;

        const scaleX = vb.width > 0 ? width / vb.width : 1;
        const scaleY = vb.height > 0 ? height / vb.height : 1;

        nestedTransform = nestedTransform
          .scale(scaleX, scaleY)
          .translate(-vb.x, -vb.y);
      }

      yield* SVG.extractGroupNodes(child, svgRoot, nestedTransform, style);
    } else if (child.tagName === 'use') {
      const hrefElement = svgRoot.querySelector(
        (child as SVGUseElement).href.baseVal,
      );
      if (!(hrefElement instanceof SVGGraphicsElement)) {
        useLogger().warn(`invalid SVG use tag. element "${child.outerHTML}"`);
        return;
      }

      yield* SVG.extractElementNodes(
        hrefElement,
        svgRoot,
        transformMatrix,
        style,
      );
    } else if (child.tagName === 'path') {
      const data = child.getAttribute('d');
      if (!data) {
        useLogger().warn('blank path data at ' + child.id);
        return;
      }
      const transformation = transformMatrix;
      yield {
        id: id || 'path',
        type: Path as unknown as new (props: NodeProps) => Node,
        props: {
          data,
          tweenAlignPath: true,
          ...SVG.getMatrixTransformation(transformation),
          ...style,
        } as PathProps,
      };
    } else if (child.tagName === 'rect') {
      const width = SVG.parseNumberAttribute(child, 'width');
      const height = SVG.parseNumberAttribute(child, 'height');
      const rx = SVG.parseNumberAttribute(child, 'rx');
      const ry = SVG.parseNumberAttribute(child, 'ry');

      const bbox = new BBox(0, 0, width, height);
      const center = bbox.center;
      const transformation = transformMatrix.translate(center.x, center.y);

      yield {
        id: id || 'rect',
        type: Rect,
        props: {
          width,
          height,
          radius: [rx, ry],
          ...SVG.getMatrixTransformation(transformation),
          ...SVG.paintAt(
            style,
            center.add([
              SVG.parseNumberAttribute(child, 'x'),
              SVG.parseNumberAttribute(child, 'y'),
            ]),
          ),
        } as RectProps,
      };
    } else if (['circle', 'ellipse'].includes(child.tagName)) {
      const cx = SVG.parseNumberAttribute(child, 'cx');
      const cy = SVG.parseNumberAttribute(child, 'cy');
      const size: PossibleSpacing =
        child.tagName === 'circle'
          ? SVG.parseNumberAttribute(child, 'r') * 2
          : [
              SVG.parseNumberAttribute(child, 'rx') * 2,
              SVG.parseNumberAttribute(child, 'ry') * 2,
            ];

      const transformation = transformMatrix.translate(cx, cy);

      yield {
        id: id || child.tagName,
        type: Circle,
        props: {
          size,
          ...SVG.paintAt(style, new Vector2(cx, cy)),
          ...SVG.getMatrixTransformation(transformation),
        } as CircleProps,
      };
    } else if (['line', 'polyline', 'polygon'].includes(child.tagName)) {
      const numbers =
        child.tagName === 'line'
          ? ['x1', 'y1', 'x2', 'y2'].map(attr =>
              SVG.parseNumberAttribute(child, attr),
            )
          : child
              .getAttribute('points')!
              .match(/-?[\d.e+-]+/g)!
              .map(value => parseFloat(value));
      const points = numbers.reduce<number[][]>((accum, current) => {
        let last = accum.at(-1);
        if (!last || last.length === 2) {
          last = [];
          accum.push(last);
        }
        last.push(current);
        return accum;
      }, []);

      if (child.tagName === 'polygon') points.push(points[0]);

      yield {
        id: id || child.tagName,
        type: Line as unknown as new (props: NodeProps) => Node,
        props: {
          points,
          ...style,
          ...SVG.getMatrixTransformation(transformMatrix),
        } as LineProps,
      };
    } else if (child.tagName === 'image') {
      const x = SVG.parseNumberAttribute(child, 'x');
      const y = SVG.parseNumberAttribute(child, 'y');
      const width = SVG.parseNumberAttribute(child, 'width');
      const height = SVG.parseNumberAttribute(child, 'height');
      const href = child.getAttribute('href') ?? '';

      const bbox = new BBox(x, y, width, height);
      const center = bbox.center;
      const transformation = transformMatrix.translate(center.x, center.y);

      yield {
        id: id || child.tagName,
        type: Img,
        props: {
          src: href,
          ...style,
          ...SVG.getMatrixTransformation(transformation),
        } as ImgProps,
      };
    }
  }
}
