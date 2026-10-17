import {nodeName} from '@canvas-commons/2d';
import type * as THREE from 'three';
import {Object3DNode, Object3DNodeProps} from './Object3DNode';
import {ThreeModule} from './loader';

export interface Group3DProps extends Object3DNodeProps {}

/**
 * An empty 3D node that groups other 3D nodes so they move, turn and fade
 * together.
 *
 * @example
 * ```tsx
 * <Group3D ref={rig} rotationY={0}>
 *   <Mesh3D geometry="box" size={200} x={-150} />
 *   <Mesh3D geometry="sphere" size={200} x={150} />
 * </Group3D>
 * // ...
 * yield* rig().rotationY(360, 4);
 * ```
 */
@nodeName('Group3D')
export class Group3D extends Object3DNode {
  public constructor(props?: Group3DProps) {
    super(props ?? {});
  }

  protected override createObject(three: ThreeModule): THREE.Object3D {
    return new three.Group();
  }
}
