import {
  BBox,
  Color,
  Matrix2D,
  PossibleColor,
  PossibleSpacing,
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
  unwrap,
  useLogger,
  useRandom,
  waitFor,
} from '@motion-canvas/core';
import {computed, signal} from '../decorators';
import {PathMorpher, defaultMorpher} from '../morphers';
import {DesiredLength, PossibleCanvasStyle} from '../partials';
import {Gradient} from '../partials/Gradient';
import {applyTransformDiff, getTransformDiff} from '../utils/diff';
import {resolveSvgPaintServer} from '../utils/svgPaintServer';
import {Circle, CircleProps} from './Circle';
import {Curve} from './Curve';
import {Img, ImgProps} from './Img';
import {Layout} from './Layout';
import {Line, LineProps} from './Line';
import {Node, NodeProps} from './Node';
import {Path, PathProps} from './Path';
import {Rect, RectProps} from './Rect';
import {Shape, ShapeProps} from './Shape';
import {View2D} from './View2D';

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

export interface SVGProps extends ShapeProps {
  svg: SignalValue<string>;
  morpher?: PathMorpher;
}

/**
A Node for drawing and animating SVG images.

@remarks
If you're not interested in animating SVG, you can use {@link Img} instead.
 */
/** The order {@link SVG.build} and {@link SVG.unbuild} sequence children in. */
export type SVGBuildOrder = 'forward' | 'reverse' | 'random';

export interface SVGBuildOptions {
  /**
   * How much of a child's draw the next one starts within, from `0` (strictly
   * one after another) to `1` (all at once). The total duration is unchanged
   * either way: less overlap means each child draws faster.
   *
   * @defaultValue 0.5
   */
  overlap?: number;
  /**
   * The order children are sequenced in. `'random'` is seeded by the scene, so
   * a shuffled build plays the same way every time it runs.
   *
   * @defaultValue 'forward'
   */
  order?: SVGBuildOrder;
  /**
   * Whether a fill-only child borrows an outline to draw with.
   *
   * @remarks
   * Exported artwork is mostly solid shapes with no stroke of their own. With
   * an outline they read as drawn — a line traces the shape and the fill rises
   * behind it, then the line goes. Without one there is nothing to trace, so
   * the fill simply crossfades in over the child's whole slot. Children that
   * carry their own stroke always draw it, either way.
   *
   * @defaultValue true
   */
  outline?: boolean;
  /**
   * The width of the line a fill-only child borrows, in that child's own
   * units.
   *
   * @remarks
   * A borrowed line is measured in the document's coordinates, not in pixels,
   * so what one unit is worth on screen depends on the document. Artwork
   * authored at roughly its display size draws about a pixel wide and needs
   * nothing set here; a document whose coordinates are far from its display
   * size — a typeset formula, whose glyph outlines are a thousand units to the
   * em — would trace with an invisible hairline unless it says how wide its
   * own pen should be.
   *
   * @defaultValue 1
   */
  outlineWidth?: number;
}

/** A curve's paint as the document declared it, before a build touched it. */
interface AuthoredPaint {
  fill: SignalValue<PossibleCanvasStyle> | null;
  stroke: SignalValue<PossibleCanvasStyle> | null;
  lineWidth: number;
  strokeFirst: boolean;
}

export class SVG extends Shape {
  @lazy(() => {
    const element = document.createElement('div');
    // Off-distribution `color` so `getComputedStyle(...).fill === ...color`
    // in `getElementStyle()` unambiguously means the element used
    // `currentColor` (i.e. not coincidence).
    element.style.color = SVG.currentColorSentinel;
    View2D.shadowRoot.appendChild(element);
    return element;
  })
  protected static containerElement: HTMLDivElement;
  private static readonly currentColorSentinel = '#010203';
  private static svgNodesPool: Record<string, SVGDocumentData> = {};

  /**
   * The default {@link PathMorpher} used by all SVG-based components
   * (Path, Latex, Icon) when no `morpher` prop is provided.
   *
   * @example
   * ```ts
   * SVG.defaultMorpher = zrenderMorpher();
   * ```
   */
  public static defaultMorpher: PathMorpher = defaultMorpher();

  /**
   * SVG string to be rendered
   */
  @signal()
  public declare readonly svg: SimpleSignal<string, this>;

  /**
   * Child to wrap all SVG node
   */
  public wrapper: Node;

  /** See {@link authoredPaint}. */
  private readonly authoredPaints = new WeakMap<Curve, AuthoredPaint>();

  protected readonly morpher: PathMorpher;

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
   * All Curve descendants in document order.
   *
   * @remarks
   * Used by {@link enter} to determine child sequencing.
   * Cached via `@computed` and recomputed when the SVG document changes.
   */
  @computed()
  public orderedCurveDescendants(): Curve[] {
    return this.wrapper.findAll((node): node is Curve => node instanceof Curve);
  }

  /**
   * Animate the SVG on, sequencing child strokes with overlap.
   *
   * @remarks
   * Each child curve draws its stroke progressively. Filled children get an
   * outline stroke phase followed by a fill crossfade. Children are staggered
   * with 50% overlap by default.
   *
   * @param duration - Total animation duration in seconds.
   * @param timingFunction - Easing for each child's stroke. Left out, a stroke
   *                         being traced across a shape runs at a constant
   *                         speed and a curve drawing on its own eases out —
   *                         passing one applies it to both. The fill crossfade
   *                         behind the stroke always eases out.
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
   * Animate the SVG off — {@link build} played backwards.
   *
   * @remarks
   * Each child's fill crossfades out and its stroke retracts to nothing,
   * leaving the document invisible but intact: a later {@link build} restores
   * the paint the document was authored with, so the two can alternate.
   *
   * `order` describes the build being undone, not the order children come off
   * in: `unbuild` runs it backwards, so the same options that built a document
   * rewind it exactly.
   *
   * @param duration - Total animation duration in seconds.
   * @param timingFunction - Easing for each child's stroke.
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
   * {@link build} and {@link unbuild} both overwrite fill, stroke and line
   * width while they run, so neither can read the document's own paint off the
   * node once the other has touched it. The first call to see a curve records
   * it; every call after that reads it back from here. Entries die with the
   * curves when the `svg` signal replaces the document.
   */
  private authoredPaint(curve: Curve): AuthoredPaint {
    let paint = this.authoredPaints.get(curve);
    if (!paint) {
      paint = {
        fill: curve.fill(),
        stroke: curve.stroke(),
        lineWidth: curve.lineWidth(),
        strokeFirst: curve.strokeFirst(),
      };
      this.authoredPaints.set(curve, paint);
    }
    return paint;
  }

  /**
   * Draw every child on (`draw`) or off, staggered.
   *
   * @remarks
   * The shared body of {@link build} and {@link unbuild} — the two are the same
   * sequence with the stroke and the fill crossfade running in opposite
   * directions, so they stay in step by being one implementation.
   */
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
    const n = curves.length;
    if (n === 0) return;

    // A stroke tracing across a filled shape reads as a pen moving at a steady
    // speed, while a curve drawing on its own is a normal entrance and eases.
    // An easing passed by the caller means both.
    const traceEasing = timingFunction ?? linear;
    const curveEasing = timingFunction ?? easeOutCubic;

    const containerFill = this.fill();
    const children = curves.map(curve => {
      const authored = this.authoredPaint(curve);
      const fill = authored.fill ?? containerFill ?? null;
      // A fill-only child (the common case in exported artwork) has no line to
      // draw, so it borrows one for the stroke phase and gives it back.
      const fade = SVG.fadeColor(fill);
      return {
        curve,
        authored,
        fill,
        // The color the fill crossfades through. A gradient or a pattern is not
        // a color and cannot carry an alpha, so a gradient lends its middle
        // stop and the real paint is swapped back in at the end of the fade.
        fade,
        hasFill: fill !== null,
        borrowed: authored.stroke === null && outline && fade !== null,
        // Nothing to trace: crossfade the fill across the child's whole slot.
        fillOnly: authored.stroke === null && !(outline && fade !== null),
      };
    });

    if (draw) {
      curves.forEach(curve => {
        curve.end(0);
        curve.fill(null);
      });
    }

    const clamped = clamp(0, 1, overlap);
    const perChild = duration / (n - clamped * (n - 1));
    const stagger = perChild * (1 - clamped);

    // Undoing a build runs its order backwards, so the same options rewind it.
    const sequenced = SVG.inOrder(children, order);
    if (!draw) sequenced.reverse();

    yield* sequence(
      stagger,
      ...sequenced.map(
        ({curve, authored, fill, fade, hasFill, borrowed, fillOnly}) => {
          const strokeDur = hasFill && !fillOnly ? perChild * 0.7 : perChild;
          const fillDur = hasFill && !fillOnly ? perChild * 0.3 : perChild;

          function* strokePhase(): ThreadGenerator {
            if (borrowed) curve.lineWidth(outlineWidth);
            if (draw) {
              yield curve.end(
                1,
                strokeDur,
                hasFill ? traceEasing : curveEasing,
              );
              yield* waitFor(strokeDur);
            } else {
              yield* curve.end(
                0,
                strokeDur,
                hasFill ? traceEasing : curveEasing,
              );
            }
          }

          function* fillPhase(): ThreadGenerator {
            if (!fade) {
              // A pattern, or a gradient with no stops: nothing to fade
              // through, so the paint simply appears or goes.
              curve.fill(draw ? fill : null);
              yield* waitFor(fillDur);
              return;
            }
            const alpha = fade.alpha();
            yield* tween(fillDur, t => {
              const progress = draw ? easeOutSine(t) : 1 - easeOutSine(t);
              curve.fill(fade.alpha(alpha * progress));
              if (borrowed)
                curve.lineWidth(Math.max(0, outlineWidth * (1 - progress)));
            });
            curve.fill(draw ? fill : null);
          }

          function* anim(): ThreadGenerator {
            if (!hasFill) {
              yield* strokePhase();
              return;
            }
            if (fillOnly) {
              // The child has neither a stroke of its own nor a borrowed one:
              // the fill is the whole animation. `end` still has to be put back
              // where a draw found it, since build() rewound it to 0.
              if (draw) curve.end(1);
              yield* fillPhase();
              if (!draw) curve.end(0);
              return;
            }
            if (borrowed) {
              curve.strokeFirst(true);
              curve.stroke(fade);
            }
            if (draw) {
              yield* strokePhase();
              yield* fillPhase();
              // Hand the document its own paint back, so the node ends the
              // animation exactly as it was authored.
              curve.lineWidth(authored.lineWidth);
              if (borrowed) {
                curve.stroke(authored.stroke);
                curve.strokeFirst(authored.strokeFirst);
              }
            } else {
              yield* fillPhase();
              yield* strokePhase();
            }
          }
          return anim();
        },
      ),
    );
  }

  /**
   * A color standing in for a paint while it fades.
   * Gradients lend their middle stop; anything unparseable lends nothing.
   */
  private static fadeColor(
    paint: SignalValue<PossibleCanvasStyle> | null,
  ): Color | null {
    if (paint === null || paint === undefined) return null;
    if (paint instanceof Gradient) {
      const stops = paint.stops();
      const stop = stops[Math.floor(stops.length / 2)];
      if (!stop) return null;
      try {
        return new Color(unwrap(stop.color));
      } catch {
        return null;
      }
    }
    try {
      return new Color(paint as PossibleColor);
    } catch {
      return null;
    }
  }

  /** A fresh array of the children, sequenced the way `order` asks for. */
  private static inOrder<T>(children: T[], order: SVGBuildOrder): T[] {
    if (order === 'reverse') return [...children].reverse();
    if (order !== 'random') return [...children];
    // useRandom is seeded per scene, so a shuffled build renders the same way
    // every time it plays.
    const random = useRandom();
    const shuffled = [...children];
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
    if (
      from instanceof Path &&
      to instanceof Path &&
      from.data() !== to.data()
    ) {
      const fromData = from.data();
      const toData = to.data();
      const interpolator = this.morpher.createInterpolator(fromData, toData);

      yield tween(
        duration,
        value => {
          const progress = timing(value);
          from.data.context.setter(interpolator(progress));
        },
        () => {
          from.data(toData);
        },
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
  private wrapperScale(): Vector2 {
    return this.calculateWrapperScale(
      this.document().size,
      this.getCurrentSize(),
    );
  }

  /**
   * Get the current `SVGDocument`.
   */
  @computed()
  private document(): SVGDocument {
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
   * Convert SVG colors in Shape properties to Motion Canvas colors.
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
    const result: ShapeProps = {
      fill: fill === 'currentColor' ? this.fill : SVG.processSVGColor(fill),
      stroke:
        stroke === undefined || stroke === 'currentColor'
          ? this.stroke
          : SVG.processSVGColor(stroke),
      lineWidth: lineWidth || this.lineWidth,
      strokeFirst: strokeFirst ?? this.strokeFirst,
      ...rest,
    };

    return result;
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

    let viewBox = new BBox();
    let size = new Vector2();

    let hasViewBox = svgRoot.hasAttribute('viewBox');
    let hasSize =
      svgRoot.hasAttribute('width') || svgRoot.hasAttribute('height');

    if (hasViewBox) {
      try {
        const {x, y, width, height} = svgRoot.viewBox.baseVal;
        viewBox = new BBox(x, y, width, height);

        if (!hasSize) size = viewBox.size;
      } catch {
        hasViewBox = false;
        useLogger().warn('Unable to extract size from svgRoot.viewBox.baseVal');
      }
    }

    if (hasSize) {
      try {
        size = new Vector2(
          svgRoot.width.baseVal.value,
          svgRoot.height.baseVal.value,
        );

        if (!hasViewBox) viewBox = new BBox(0, 0, size.width, size.height);
      } catch {
        hasSize = false;
        useLogger().warn(
          'Unable to extract size from (svgRoot.width.baseVal.value, svgRoot.height.baseVal.value)',
        );
      }
    }

    if (!hasViewBox && !hasSize) {
      try {
        viewBox = new BBox(svgRoot.getBBox());
      } catch {
        // getBBox() can fail on iOS Safari - try attaching to document.body
        const tempContainer = document.createElement('div');
        tempContainer.style.position = 'absolute';
        tempContainer.style.visibility = 'hidden';
        tempContainer.style.pointerEvents = 'none';
        tempContainer.appendChild(svgRoot.cloneNode(true));
        document.body.appendChild(tempContainer);
        try {
          const tempSvg = tempContainer.querySelector('svg')!;
          viewBox = new BBox(tempSvg.getBBox());
        } catch {
          useLogger().warn(
            'SVG getBBox() failed. Add explicit viewBox or width/height attributes to your SVG.',
          );
          viewBox = new BBox(0, 0, 100, 100);
        } finally {
          document.body.removeChild(tempContainer);
        }
      }
      size = viewBox.size;
    }

    const scale = size.div(viewBox.size);
    const center = viewBox.center;

    const rootTransform = new DOMMatrix()
      .scaleSelf(scale.x, scale.y)
      .translateSelf(-center.x, -center.y);

    const nodes = Array.from(
      SVG.extractGroupNodes(svgRoot, svgRoot, rootTransform, {}),
    );

    const builder: SVGDocumentData = {
      size,
      nodes,
    };
    SVG.svgNodesPool[svg] = builder;
    return builder;
  }

  /**
   * Get position, rotation and scale from Matrix transformation as Shape properties
   * @param transform - Matrix transformation
   * @returns MotionCanvas Shape properties
   */
  protected static getMatrixTransformation(transform: DOMMatrix): ShapeProps {
    const matrix2 = new Matrix2D(transform);

    const position = matrix2.translation;
    const rotation = matrix2.rotation;
    // matrix.scaling can give incorrect result when matrix contain skew operation
    const scale = {
      x: matrix2.x.magnitude,
      y: matrix2.y.magnitude,
    };
    if (matrix2.determinant < 0) {
      if (matrix2.values[0] < matrix2.values[3]) scale.x = -scale.x;
      else scale.y = -scale.y;
    }
    return {
      position,
      rotation,
      scale,
    };
  }

  /**
   * Convert an SVG color into a Motion Canvas color.
   * @param color - SVG color.
   * @returns Motion Canvas color.
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
    // `getComputedStyle` returns "none" for the initial/default value;
    // treat that as "no dash" rather than parsing it into [NaN].
    if (value === 'none') return null;

    const list = value.split(/,|\s+/).filter(s => s.length > 0);
    if (list.length === 0) return null;
    if (list.some(str => str.endsWith('%'))) {
      useLogger().warn(`SVG: percentage line dash are ignored`);
      return null;
    }
    return list.map(str => parseFloat(str));
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
   * Convert the SVG element's style to a Motion Canvas Shape properties.
   * @param element - An SVG element whose style should be converted.
   * @param inheritedStyle - The parent style that should be inherited.
   * @param svgRoot - Root SVG element, used to resolve `url(#id)` paint
   *   references (linear/radial gradients) declared in `<defs>`.
   */
  private static getElementStyle(
    element: SVGGraphicsElement,
    inheritedStyle: ShapeProps,
    svgRoot: Element,
  ): ShapeProps {
    // Read styles via getComputedStyle so we pick up values declared via
    // inline `style="..."` attributes, `<style>` blocks (resolved through
    // classes), and cascaded/inherited rules — not just plain SVG
    // attributes. The parsed SVG is mounted inside View2D.shadowRoot
    // (see `containerElement`), so the browser fully resolves the cascade
    // for us. Falls back to `inheritedStyle` when computed-style returns
    // a missing/none value so an unset child doesn't override the parent.
    const cs = window.getComputedStyle(element);

    // SVG paint values that mean "no paint" should not fall through to the
    // inherited value — the SVG explicitly opted out. We treat them as
    // null so Motion Canvas's Shape renders them with no fill/stroke.
    // `url(#id)` paint-server refs get resolved into a real Motion Canvas
    // `Gradient` instance via `resolvePaintServer`; falls back to the
    // inherited paint when the referenced element isn't a gradient (or
    // can't be parsed).
    const paint = (
      val: string | null,
      rawAttr: string | null,
      uaDefault: string,
      inherited: any,
    ) => {
      if (!val) return inherited;
      // MathJax (and similar) emit `<defs><path/></defs>` + `<use href>`.
      // When extracting through `<use>` we recurse into the referenced
      // `<path>`, but `getComputedStyle` on that path reflects the
      // def-site cascade (typically UA default), not the use-site
      // cascade we want. When the element has no explicit paint
      // attribute and the computed value is just the UA default, prefer
      // the inheritedStyle passed down from the use site. This must
      // come before the `none`/`transparent` short-circuit below, since
      // for stroke the UA default *is* `none`.
      if (!rawAttr && val === uaDefault) return inherited;
      if (val === 'none' || val === 'transparent') return null;
      if (val.startsWith('url(')) {
        return resolveSvgPaintServer(val, svgRoot) ?? inherited;
      }
      // `currentColor` resolves to the computed `color`. The container
      // sets `color` to a sentinel so this match is unambiguous, not
      // coincidental. Returning the literal string lets per-instance
      // `processElementStyle()` substitute `this.fill` / `this.stroke`
      // (parse results are statically cached across instances, so the
      // substitution has to stay deferred).
      if (val === cs.color) return 'currentColor';
      return val;
    };

    const numAttr = (
      raw: string | null,
      rawAttr: string | null,
      uaDefault: number,
      inherited: any,
    ) => {
      if (raw == null || raw === '') return inherited;
      const n = parseFloat(raw);
      if (!Number.isFinite(n)) return inherited;
      // Same `<use>` def-site cascade leak as in `paint()`: if the
      // element has no explicit attribute and the value equals the SVG
      // UA default, prefer the inherited value from the use site.
      if (!rawAttr && n === uaDefault) return inherited;
      return n;
    };

    return {
      fill: paint(
        cs.fill,
        element.getAttribute('fill'),
        'rgb(0, 0, 0)',
        inheritedStyle.fill,
      ),
      stroke: paint(
        cs.stroke,
        element.getAttribute('stroke'),
        'none',
        inheritedStyle.stroke,
      ),
      lineWidth: numAttr(
        cs.strokeWidth,
        element.getAttribute('stroke-width'),
        1,
        inheritedStyle.lineWidth,
      ),
      lineCap: this.parseLineCap(cs.strokeLinecap) ?? inheritedStyle.lineCap,
      lineJoin:
        this.parseLineJoin(cs.strokeLinejoin) ?? inheritedStyle.lineJoin,
      lineDash:
        this.parseLineDash(cs.strokeDasharray) ?? inheritedStyle.lineDash,
      lineDashOffset:
        this.parseDashOffset(cs.strokeDashoffset) ??
        inheritedStyle.lineDashOffset,
      opacity: this.parseOpacity(cs.opacity) ?? inheritedStyle.opacity,
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
    const style = SVG.getElementStyle(child, inheritedStyle, svgRoot);
    const id = child.id ?? '';
    if (child.tagName === 'g') {
      yield* SVG.extractGroupNodes(child, svgRoot, transformMatrix, style);
    } else if (child.tagName === 'svg' && child instanceof SVGSVGElement) {
      let nestedTransform = transformMatrix;

      if (child.hasAttribute('viewBox')) {
        const vb = child.viewBox.baseVal;
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

      // Pass the `<use>` element's own resolved style (not the use's
      // parent's `inheritedStyle`) so the referenced element inherits
      // from the use site — matching SVG's `<use>` shadow-tree semantics.
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
          ...style,
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
          ...style,
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
    } else if (child.tagName === 'svg') {
      // Handle nested <svg> elements (used by MathJax for stretchy brackets
      // in cases/matrix environments). These have their own coordinate system
      // defined by viewBox that we need to account for.
      const nestedSvg = child as unknown as SVGSVGElement;
      let nestedTransform = transformMatrix;

      // Apply viewBox transformation if present
      if (nestedSvg.hasAttribute('viewBox')) {
        try {
          const vb = nestedSvg.viewBox.baseVal;
          const width = SVG.parseNumberAttribute(child, 'width') || vb.width;
          const height = SVG.parseNumberAttribute(child, 'height') || vb.height;

          // Calculate scale from viewBox to actual size
          const scaleX = width / vb.width;
          const scaleY = height / vb.height;

          // Apply viewBox origin offset and scale
          nestedTransform = nestedTransform
            .scaleSelf(scaleX, scaleY)
            .translateSelf(-vb.x, -vb.y);
        } catch {
          // viewBox parsing failed, continue with basic transform
        }
      }

      yield* SVG.extractGroupNodes(child, svgRoot, nestedTransform, style);
    }
  }
}
