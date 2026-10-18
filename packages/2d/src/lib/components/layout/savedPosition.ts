import {SignalValue} from '@canvas-commons/core';
import type {Layout} from '../Layout';

/** The raw `x` and `y` of a node, as set before a layout animation. */
export type SavedPosition = [
  SignalValue<number> | undefined,
  SignalValue<number> | undefined,
];

export function savePosition(node: Layout): SavedPosition {
  return [node.x.context.raw(), node.y.context.raw()];
}

/** Set the raw `x` and `y` of a node back to the saved values. */
export function applyPosition(node: Layout, [x, y]: SavedPosition): void {
  if (x === undefined) node.x.context.reset();
  else node.x.context.setter(x);
  if (y === undefined) node.y.context.reset();
  else node.y.context.setter(y);
}

/**
 * Put back the `x` and `y` a layout animation overwrote, once the node's
 * layout parent positions it again. A node that ends up placing itself keeps
 * the position the animation left it at.
 */
export function restorePosition(node: Layout, saved: SavedPosition): void {
  if (!node.isLayoutRoot()) applyPosition(node, saved);
}
