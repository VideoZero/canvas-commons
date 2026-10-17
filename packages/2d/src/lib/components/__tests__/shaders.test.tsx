import {createSignal} from '@canvas-commons/core';
import {describe, expect, test} from 'vitest';
import {Node, Rect} from '..';
import {mockScene2D} from './mockScene2D';

describe('shaders', () => {
  mockScene2D({experimentalFeatures: true});

  test('accept a signal on a node', () => {
    const fragment = createSignal('void main() {}');
    const node = <Node shaders={() => fragment()} />;

    expect(node.shaders()).toEqual([{fragment: 'void main() {}'}]);
    fragment('void main() { /* changed */ }');
    expect(node.shaders()).toEqual([
      {fragment: 'void main() { /* changed */ }'},
    ]);
  });

  test('accept a signal for fill and stroke shaders', () => {
    const fragment = createSignal<string | null>(null);
    const rect = (
      <Rect fillShaders={() => fragment()} strokeShaders={fragment} />
    ) as Rect;

    expect(rect.fillShaders()).toEqual([]);
    fragment('void main() {}');
    expect(rect.fillShaders()).toEqual([{fragment: 'void main() {}'}]);
    expect(rect.strokeShaders()).toEqual([{fragment: 'void main() {}'}]);
  });
});
