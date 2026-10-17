import {
  ComponentChildren,
  Layout,
  LayoutProps,
  Node,
  nodeName,
} from '@canvas-commons/2d';
import {
  ThreadGenerator,
  TimingFunction,
  Vector2,
  easeInOutCubic,
  threadable,
  tween,
} from '@canvas-commons/core';

/**
 * The size and world position of every layout node of a tree, recorded by
 * {@link AnimLayout.recordFlipState}.
 *
 * @remarks
 * VideoZero also recorded the `desiredSize`; {@link AnimLayout.tweenFlip}
 * restores the sizes the nodes had when it started instead.
 */
export type FlipState = Map<
  Layout,
  {computedSize: Vector2; absolutePosition: Vector2}
>;

type LengthSignal = Layout['width'];
type RawLength = ReturnType<LengthSignal['context']['raw']>;

function restoreRaw(signal: LengthSignal, value: RawLength) {
  if (value === undefined) signal.context.reset();
  else signal.context.setter(value);
}

function rootOf(node: Layout): Layout {
  let root = node;
  while (!root.isLayoutRoot()) {
    const parent = root.findAncestor((n): n is Layout => n instanceof Layout);
    if (!parent) break;
    root = parent;
  }
  return root;
}

/**
 * A {@link Layout} with the FLIP animation shorthands of VideoZero.
 *
 * @remarks
 * `addAnimated`, `insertAnimated`, `removeAnimated` and `reorderAnimated`
 * delegate to the animated overloads of `add`, `insert`, `remove` and
 * `reorder` of Canvas Commons. {@link recordFlipState} and {@link tweenFlip}
 * animate any layout change made between the two calls.
 *
 * @example
 * ```tsx
 * const list = createRef<AnimLayout>();
 * view.add(
 *   <AnimLayout ref={list} layout gap={20}>
 *     <Rect size={100} fill="red" />
 *   </AnimLayout>,
 * );
 * yield* list().addAnimated(<Rect size={100} fill="blue" />, 0.5);
 *
 * const before = list().recordFlipState();
 * list().gap(60);
 * yield* list().tweenFlip(before, 0.5);
 * ```
 */
@nodeName('AnimLayout')
export class AnimLayout extends Layout {
  public constructor(props: LayoutProps) {
    super(props);
  }

  /**
   * Add the given node(s) as the last children, scaling them in while the
   * siblings slide to their new slots.
   *
   * @param node - The node(s) to add.
   * @param duration - The duration of the animation in seconds.
   * @param timing - The timing function of the animation.
   */
  @threadable()
  public *addAnimated(
    node: ComponentChildren,
    duration: number,
    timing: TimingFunction = easeInOutCubic,
  ): ThreadGenerator {
    yield* this.add(node, duration, timing);
  }

  /**
   * Insert the given node(s) at the index, scaling them in while the siblings
   * slide to their new slots.
   *
   * @param node - The node(s) to insert.
   * @param index - The index to insert at.
   * @param duration - The duration of the animation in seconds.
   * @param timing - The timing function of the animation.
   */
  @threadable()
  public *insertAnimated(
    node: ComponentChildren,
    index: number,
    duration: number,
    timing: TimingFunction = easeInOutCubic,
  ): ThreadGenerator {
    yield* this.insert(node, index, duration, timing);
  }

  /**
   * Remove the given child, scaling it out while its slot collapses.
   *
   * @param node - The child to remove.
   * @param duration - The duration of the animation in seconds.
   * @param timing - The timing function of the animation.
   */
  @threadable()
  public *removeAnimated(
    node: Layout,
    duration: number,
    timing: TimingFunction = easeInOutCubic,
  ): ThreadGenerator {
    yield* node.remove(duration, timing);
  }

  /**
   * Rearrange the children, sliding each one into its new slot.
   *
   * @param newOrder - The current children in their new order.
   * @param duration - The duration of the animation in seconds.
   * @param timing - The timing function of the animation.
   */
  @threadable()
  public *reorderAnimated(
    newOrder: Node[],
    duration: number,
    timing: TimingFunction = easeInOutCubic,
  ): ThreadGenerator {
    yield* this.reorder(newOrder, duration, timing);
  }

  /** Hold this node's slot in the flex layout. Pair with {@link releaseSize}. */
  public lockSize() {
    this.lockLayout();
  }

  /** Undo one {@link lockSize}. */
  public releaseSize() {
    this.releaseLayout();
  }

  /** The outermost layout node this node is laid out with. */
  public layoutRoot(): Layout {
    return rootOf(this);
  }

  /**
   * Record the size and world position of every layout node of this node's
   * layout tree, to animate a change with {@link tweenFlip}.
   *
   * @param recursive - Record the whole layout tree this node is part of
   *                    instead of only this node and its descendants.
   */
  public recordFlipState(recursive = true): FlipState {
    const root = recursive ? rootOf(this) : this;
    const state: FlipState = new Map();
    const nodes = [
      root,
      ...root.findAll((n): n is Layout => n instanceof Layout),
    ];
    for (const node of nodes) {
      state.set(node, {
        computedSize: new Vector2(node.size()),
        absolutePosition: node.position.abs(),
      });
    }
    return state;
  }

  /**
   * Animate every recorded layout node from the size and world position in
   * `from` to the ones it has now.
   *
   * @remarks
   * Nodes moved to another parent in between animate in world space. Nodes
   * that weren't recorded jump to their place. Canceling the animation puts
   * every node at its final place.
   *
   * @example
   * ```ts
   * const before = list().recordFlipState();
   * list().direction('column');
   * yield* list().tweenFlip(before, 0.6);
   * ```
   *
   * @param from - The state recorded before the change.
   * @param time - The duration of the animation in seconds.
   * @param timing - The timing function of the animation.
   */
  @threadable()
  public *tweenFlip(
    from: FlipState,
    time: number,
    timing: TimingFunction = easeInOutCubic,
  ): ThreadGenerator {
    const to = this.recordFlipState();
    const items = [...to].flatMap(([node, post]) => {
      const pre = from.get(node);
      return pre
        ? [
            {
              node,
              pre,
              post,
              translate: node.translate(),
              width: node.width.context.raw(),
              height: node.height.context.raw(),
            },
          ]
        : [];
    });

    // Ancestors come first, so each child is placed after its parent moved.
    const place = (item: (typeof items)[number], world: Vector2) => {
      const parent = item.node.parent();
      const toLocal = parent ? parent.worldToLocal() : new DOMMatrix();
      const delta = world
        .transformAsPoint(toLocal)
        .sub(item.node.position.abs().transformAsPoint(toLocal));
      // `translate` sits after the node's own rotation, scale, and skew.
      item.node.translate(
        item.translate.add(
          delta.transform(item.node.localToParent().inverse()),
        ),
      );
    };

    for (const item of items) {
      item.node.lockLayout();
      item.node.size(item.pre.computedSize);
    }
    try {
      yield* tween(time, raw => {
        const t = timing(raw);
        for (const item of items) {
          item.node.size(
            Vector2.lerp(item.pre.computedSize, item.post.computedSize, t),
          );
        }
        for (const item of items) {
          place(
            item,
            Vector2.lerp(
              item.pre.absolutePosition,
              item.post.absolutePosition,
              t,
            ),
          );
        }
      });
    } finally {
      for (const item of items) {
        item.node.releaseLayout();
        restoreRaw(item.node.width, item.width);
        restoreRaw(item.node.height, item.height);
        item.node.translate(item.translate);
      }
    }
  }
}
