import {Circle, Line, Node, SVG} from '@canvas-commons/2d';
import {SimpleSignal, Vector2, createSignal} from '@canvas-commons/core';
import type {ParsedCharacter} from '../svg';
import type {SkeletonTemplate} from './types';

export interface RigOptions {
  /**
   * The scale applied to the character's own coordinates.
   */
  scale?: number;
  /**
   * Whether to draw primitive bones or the character's sliced SVG art.
   */
  render?: 'bones' | 'svg';
  /**
   * The parts to draw in the `'svg'` render mode.
   *
   * @remarks
   * Defaults to every part. Useful to avoid drawing nested parts twice, for
   * example when a `head` group already contains the eyes.
   */
  renderParts?: string[];
  /**
   * The color of the bones in the `'bones'` render mode.
   */
  boneColor?: string;
  /**
   * Whether to overlay the live skeleton on top of the art.
   */
  debug?: boolean;
}

export interface RigDebugOptions {
  jointColor?: string;
  boneColor?: string;
  jointRadius?: number;
}

const DEG = 180 / Math.PI;

/**
 * A live rig: a container {@link Node} with one world-space position signal per
 * joint.
 *
 * @remarks
 * Pose the rig by writing joint positions with {@link Rig.set}, or bind all of
 * them at once with {@link bindPose}. The bones or the SVG art follow
 * reactively. Joints live in the space of {@link Rig.node}, so inverse
 * kinematics targets such as a planted foot are expressed directly.
 *
 * @example
 * ```tsx
 * const rig = new Rig(parseCharacterSvg(heroSvg), BIPED, {render: 'svg'});
 * view.add(rig.node);
 * rig.set('leftWrist', new Vector2(-120, -40));
 * ```
 */
export class Rig {
  /**
   * The container node holding the bones or the art.
   */
  public readonly node = new Node({});
  /**
   * The world-space position of each joint, by role.
   */
  public readonly joints: Record<string, SimpleSignal<Vector2>> = {};
  /**
   * The wrapper node of each part drawn in the `'svg'` render mode.
   */
  public readonly partWrappers: Record<string, Node> = {};
  public readonly scale: number;
  private readonly rootPoint: Vector2;

  public constructor(
    public readonly char: ParsedCharacter,
    public readonly template: SkeletonTemplate,
    options: RigOptions = {},
  ) {
    this.scale = options.scale ?? 1;
    this.rootPoint = char.referencePoints[template.root]?.pos ?? new Vector2();

    for (const role of Object.keys(template.parents)) {
      if (!char.referencePoints[role]) continue;
      this.joints[role] = createSignal(this.restOffset(role));
    }

    if ((options.render ?? 'bones') === 'svg') {
      this.buildSvgParts(options.renderParts);
    } else {
      this.buildBones(options.boneColor ?? '#1e293b');
    }

    if (options.debug) this.addDebugOverlay();
  }

  /**
   * Overlay the live skeleton: every bone as a thin line and every joint as a
   * dot.
   *
   * @example
   * ```ts
   * const overlay = rig.addDebugOverlay({jointColor: 'yellow'});
   * overlay.remove();
   * ```
   *
   * @param options - The overlay styling.
   *
   * @returns The overlay node.
   */
  public addDebugOverlay(options: RigDebugOptions = {}): Node {
    const jointColor = options.jointColor ?? '#ef4444';
    const boneColor = options.boneColor ?? 'rgba(239,68,68,0.55)';
    const radius = (options.jointRadius ?? 5) * this.scale;
    const overlay = new Node({});
    for (const bone of this.template.bones) {
      if (!this.joints[bone.pivot] || !this.joints[bone.end]) continue;
      overlay.add(
        new Line({
          points: () => [this.get(bone.pivot), this.get(bone.end)],
          stroke: boneColor,
          lineWidth: 2,
          lineCap: 'round',
        }),
      );
    }
    for (const role of Object.keys(this.joints)) {
      overlay.add(
        new Circle({
          position: () => this.get(role),
          size: radius * 2,
          fill: jointColor,
        }),
      );
    }
    this.node.add(overlay);
    return overlay;
  }

  /**
   * The rest position of a joint relative to the root joint, scaled.
   *
   * @param role - The joint role.
   */
  public restOffset(role: string): Vector2 {
    const point = this.char.referencePoints[role];
    return point
      ? point.pos.sub(this.rootPoint).scale(this.scale)
      : new Vector2();
  }

  /**
   * Move a joint. Unknown roles are ignored.
   *
   * @param role - The joint role.
   * @param world - The new position.
   */
  public set(role: string, world: Vector2) {
    this.joints[role]?.(world);
  }

  /**
   * The current position of a joint, or the origin for unknown roles.
   *
   * @param role - The joint role.
   */
  public get(role: string): Vector2 {
    return this.joints[role]?.() ?? new Vector2();
  }

  /**
   * The rest length of the bone between two joints.
   *
   * @param pivot - The joint role at the near end.
   * @param end - The joint role at the far end.
   */
  public boneLength(pivot: string, end: string): number {
    return this.restOffset(end).sub(this.restOffset(pivot)).magnitude;
  }

  /**
   * Replace the art of a part while keeping its bone binding.
   *
   * @remarks
   * `svg` is a standalone SVG using the character's viewBox and coordinates,
   * for example a different face for another expression. Unknown parts are
   * ignored.
   *
   * @example
   * ```ts
   * rig.setPart('head', happyHeadSvg);
   * ```
   *
   * @param name - The part name.
   * @param svg - The new art.
   */
  public setPart(name: string, svg: string) {
    const wrapper = this.partWrappers[name];
    if (!wrapper) return;
    const pivotRole = this.char.parts[name]?.pivotRef ?? this.template.root;
    wrapper.children([this.makePartArt(pivotRole, svg)]);
  }

  private bindTransform(pivot: string, end: string) {
    const rest = this.restOffset(end).sub(this.restOffset(pivot));
    const restAngle = Math.atan2(rest.y, rest.x);
    return {
      position: () => this.get(pivot),
      rotation: () => {
        const current = this.get(end).sub(this.get(pivot));
        return (Math.atan2(current.y, current.x) - restAngle) * DEG;
      },
      restVector: rest,
    };
  }

  private buildBones(color: string) {
    for (const bone of this.template.bones) {
      if (!this.joints[bone.pivot] || !this.joints[bone.end]) continue;
      const {position, rotation, restVector} = this.bindTransform(
        bone.pivot,
        bone.end,
      );
      const wrapper = new Node({position, rotation});
      if (bone.kind === 'circle') {
        wrapper.add(
          new Circle({
            position: restVector,
            size: (bone.radius ?? 12) * 2 * this.scale,
            fill: color,
          }),
        );
      } else {
        wrapper.add(
          new Line({
            points: [Vector2.zero, restVector],
            lineWidth: (bone.width ?? 6) * this.scale,
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
      const transform =
        this.joints[end] && end !== part.pivotRef
          ? this.bindTransform(part.pivotRef, end)
          : {position: () => this.get(part.pivotRef), rotation: () => 0};

      const wrapper = new Node({
        position: transform.position,
        rotation: transform.rotation,
      });
      wrapper.add(this.makePartArt(part.pivotRef, part.groupSvg));
      this.node.add(wrapper);
      this.partWrappers[name] = wrapper;
    }
  }

  private makePartArt(pivotRole: string, svg: string): SVG {
    // The SVG node centers its viewBox on its origin; shift it so that the
    // pivot lands on the origin and the wrapper rotates the art about it.
    const [vx, vy, vw, vh] = this.char.viewBox;
    const pivot =
      this.char.referencePoints[pivotRole]?.pos ??
      new Vector2(vx + vw / 2, vy + vh / 2);
    return new SVG({
      svg,
      size: [vw * this.scale, vh * this.scale],
      position: [
        -(pivot.x - (vx + vw / 2)) * this.scale,
        -(pivot.y - (vy + vh / 2)) * this.scale,
      ],
    });
  }
}
