export interface BoneDef {
  name: string;
  pivot: string; // joint role at the near end (rotation centre)
  end: string; // joint role at the far end
  kind?: 'line' | 'circle'; // how 'bones' render mode draws it
  width?: number; // line width
  radius?: number; // circle radius (kind: 'circle')
}

export interface ChainDef {
  name: string;
  joints: string[]; // base → … → effector, by role
}

export interface SkeletonTemplate {
  id: string;
  root: string; // root joint role
  /** Parent role for each joint role (root maps to null). */
  parents: Record<string, string | null>;
  /** Drawable bones (used by 'bones' render mode). */
  bones: BoneDef[];
  /** IK chains that can be solved with {@link fabrik}. */
  chains: ChainDef[];
}
