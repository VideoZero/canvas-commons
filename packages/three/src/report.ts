import type {Node} from '@canvas-commons/2d';
import {useLogger} from '@canvas-commons/core';

/**
 * @internal
 */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Log an error thrown by a user callback (`onUpdate`, `create`, `update`).
 *
 * @remarks
 * Callbacks run inside computed values. Letting the throw escape would leave
 * the computed without a value and cascade into every ancestor's sync, so the
 * whole viewport would go blank over one broken node. The error is logged
 * against the node instead and the sync carries on without that callback's
 * changes.
 *
 * @internal
 */
export function reportCallbackError(
  node: Node,
  callback: string,
  error: unknown,
) {
  useLogger().error({
    message: `${callback} threw: ${errorMessage(error)}`,
    stack: error instanceof Error ? error.stack : undefined,
    inspect: node.key,
  });
}

/**
 * Warn that a 3D-derived value was read before any load of the runtime had
 * started, i.e. from generator code before the first render.
 *
 * @internal
 */
export function warnReadBeforeLoad(node: Node, method: string) {
  useLogger().warn({
    message: `${method} was read before Three.js loaded and returned zero.`,
    remarks:
      'In generator code, `yield stage()` on the Three node (or `yield loadThree()`) first. A signal function evaluated during rendering needs no wait: it re-evaluates once the runtime arrives.',
    inspect: node.key,
  });
}
