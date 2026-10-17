/**
 * A drawable bone between two joints of a {@link SkeletonTemplate}.
 */
export interface BoneDef {
  name: string;
  /**
   * The joint role at the near end, which the bone rotates about.
   */
  pivot: string;
  /**
   * The joint role at the far end.
   */
  end: string;
  /**
   * How the `'bones'` render mode draws the bone.
   */
  kind?: 'line' | 'circle';
  /**
   * The line width for `'line'` bones.
   */
  width?: number;
  /**
   * The radius for `'circle'` bones.
   */
  radius?: number;
}

/**
 * A chain of joints that can be solved with inverse kinematics.
 */
export interface ChainDef {
  name: string;
  /**
   * The joint roles from base to effector.
   */
  joints: string[];
}

/**
 * A joint hierarchy described by role, so that one template can be retargeted
 * onto any character whose reference points use the same roles.
 */
export interface SkeletonTemplate {
  id: string;
  /**
   * The role of the root joint.
   */
  root: string;
  /**
   * The parent role of each joint role, with the root mapping to `null`.
   * Parents must be listed before their children.
   */
  parents: Record<string, string | null>;
  /**
   * The bones drawn by the `'bones'` render mode.
   */
  bones: BoneDef[];
  /**
   * The chains that can be solved with {@link fabrik}.
   */
  chains: ChainDef[];
}
