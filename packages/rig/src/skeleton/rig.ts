import {Circle, Line, Node, SVG} from '@motion-canvas/2d';
import {SimpleSignal, Vector2, createSignal} from '@motion-canvas/core';
import type {ParsedCharacter} from '../svg';
import type {SkeletonTemplate} from './types';

export interface RigOptions {
  scale?: number;
  render?: 'bones' | 'svg';
  /** For 'svg' render: which part names to draw (avoids double-drawing nested
   *  parts, e.g. a panda 'head' group already contains its eyes). */
  renderParts?: string[];
  boneColor?: string;
  /** Overlay the live skeleton (bones + joints) on top of the art. */
  debug?: boolean;
}

const DEG = 180 / Math.PI;

/**
 * A live rig: a container {@link Node} plus one world-space position signal per
 * joint. Pose the rig by writing joint positions (`set`); the bound bones/art
 * follow reactively. Build joint positions however you like — FK, the bundled
 * {@link fabrik} solver, hand-authored, or motion-captured.
 */
export class Rig {
  readonly node = new Node({});
  readonly joints: Record<string, SimpleSignal<Vector2>> = {};
  /** Wrapper node per rendered 'svg' part — used by {@link setPart}. */
  readonly partWrappers: Record<string, Node> = {};
  readonly scale: number;
  private readonly rootPoint: Vector2;

  constructor(
    readonly char: ParsedCharacter,
    readonly template: SkeletonTemplate,
    opts: RigOptions = {},
  ) {
    this.scale = opts.scale ?? 1;
    const rp = char.referencePoints;
    const rootPos = rp[template.root]?.pos;
    this.rootPoint = rootPos ? new Vector2(rootPos.x, rootPos.y) : new Vector2();

    // One signal per template joint that the character actually defines,
    // initialised to its rest position (relative to the root, scaled).
    for (const role of Object.keys(template.parents)) {
      if (!rp[role]) continue;
      this.joints[role] = createSignal(this.restOffset(role));
    }

    if ((opts.render ?? 'bones') === 'svg') {
      this.buildSvgParts(opts.renderParts);
    } else {
      this.buildBones(opts.boneColor ?? '#1e293b');
    }

    if (opts.debug) this.addDebugOverlay();
  }

  /**
   * Overlay the live skeleton — every template bone as a thin line and every
   * joint as a dot — on top of whatever is being rendered. Useful to inspect
   * an 'svg' rig (whose bones are otherwise invisible) or to verify a solve.
   * Returns the overlay node so callers can toggle/remove it.
   */
  addDebugOverlay(opts: {jointColor?: string; boneColor?: string; jointRadius?: number} = {}): Node {
    const jointColor = opts.jointColor ?? '#ef4444';
    const boneColor = opts.boneColor ?? 'rgba(239,68,68,0.55)';
    const r = (opts.jointRadius ?? 5) * this.scale;
    const overlay = new Node({});
    for (const b of this.template.bones) {
      if (!this.joints[b.pivot] || !this.joints[b.end]) continue;
      overlay.add(
        new Line({points: () => [this.get(b.pivot), this.get(b.end)], stroke: boneColor, lineWidth: 2, lineCap: 'round'}),
      );
    }
    for (const role of Object.keys(this.joints)) {
      overlay.add(new Circle({position: () => this.get(role), size: r * 2, fill: jointColor}));
    }
    this.node.add(overlay);
    return overlay;
  }

  /** Rest position of a joint relative to the root, in scene px. */
  restOffset(role: string): Vector2 {
    const p = this.char.referencePoints[role];
    return p ? p.pos.sub(this.rootPoint).scale(this.scale) : new Vector2();
  }

  set(role: string, world: Vector2) {
    this.joints[role]?.(world);
  }
  get(role: string): Vector2 {
    return this.joints[role]?.() ?? new Vector2();
  }
  /** Length of a bone, in scene px (from the rest pose). */
  boneLength(pivot: string, end: string): number {
    return this.restOffset(end).sub(this.restOffset(pivot)).magnitude;
  }

  // ── bone → world transform shared by both render modes ────────────────
  // A part is placed at its pivot joint and rotated by however far the current
  // pivot→end direction has turned from its rest direction.
  private bindTransform(pivot: string, end: string) {
    const rest = this.restOffset(end).sub(this.restOffset(pivot));
    const restAngle = Math.atan2(rest.y, rest.x);
    return {
      position: () => this.get(pivot),
      rotation: () => {
        const cur = this.get(end).sub(this.get(pivot));
        return (Math.atan2(cur.y, cur.x) - restAngle) * DEG;
      },
      restVec: rest,
    };
  }

  private buildBones(color: string) {
    for (const b of this.template.bones) {
      if (!this.joints[b.pivot] || !this.joints[b.end]) continue;
      const {position, rotation, restVec} = this.bindTransform(b.pivot, b.end);
      const wrapper = new Node({position, rotation});
      if (b.kind === 'circle') {
        wrapper.add(
          new Circle({position: [restVec.x, restVec.y], size: (b.radius ?? 12) * 2 * this.scale, fill: color}),
        );
      } else {
        wrapper.add(
          new Line({
            points: [[0, 0], [restVec.x, restVec.y]],
            lineWidth: (b.width ?? 6) * this.scale,
            stroke: color,
            lineCap: 'round',
          }),
        );
      }
      this.node.add(wrapper);
    }
  }

  private buildSvgParts(renderParts?: string[]) {
    const names = renderParts ?? Object.keys(this.char.parts);
    for (const name of names) {
      const part = this.char.parts[name];
      if (!part || !this.joints[part.pivotRef]) continue;

      const end = part.endRef ?? part.pivotRef;
      const hasEnd = !!this.joints[end] && end !== part.pivotRef;
      const {position, rotation} = hasEnd
        ? this.bindTransform(part.pivotRef, end)
        : {position: () => this.get(part.pivotRef), rotation: () => 0};

      const wrapper = new Node({position, rotation});
      wrapper.add(this.makePartArt(part.pivotRef, part.groupSvg));
      this.node.add(wrapper);
      this.partWrappers[name] = wrapper;
    }
  }

  // Build the (pivot-aligned) SVG art node for a part. The sliced <SVG> centres
  // the whole viewBox at its own origin, so we shift it until the part's pivot
  // reference point lands on the origin — then the wrapper rotates it about
  // that pivot like a bone.
  private makePartArt(pivotRole: string, svg: string): SVG {
    const [vx, vy, vw, vh] = this.char.viewBox;
    const pivotPos = this.char.referencePoints[pivotRole].pos;
    return new SVG({
      svg,
      size: [vw * this.scale, vh * this.scale],
      position: [-(pivotPos.x - (vx + vw / 2)) * this.scale, -(pivotPos.y - (vy + vh / 2)) * this.scale],
    });
  }

  /**
   * Hot-swap a part's art while keeping its bone binding — e.g. change a face
   * for a different expression, or swap a held prop. `svg` is a standalone SVG
   * (same viewBox as the character) drawn in the character's coordinates; it is
   * re-aligned to the part's pivot automatically. No-op for unknown parts.
   */
  setPart(name: string, svg: string) {
    const wrapper = this.partWrappers[name];
    if (!wrapper) return;
    const pivotRole = this.char.parts[name]?.pivotRef ?? this.template.root;
    wrapper.children([this.makePartArt(pivotRole, svg)]);
  }
}
