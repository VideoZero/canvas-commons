import {describe, expect, it} from 'vitest';
import {Layout} from '../Layout';
import {Node} from '../Node';
import {Rect} from '../Rect';
import {generatorTest} from './generatorTest';
import {mockScene2D} from './mockScene2D';
import {add} from './sceneFixtures';

describe('Layout.transitionTo', () => {
  mockScene2D();

  it(
    'leaves a node moved out of a layout at its own position',
    generatorTest(function* () {
      const item = (<Rect width={50} height={50} />) as Rect;
      add(
        <Layout layout direction="row" gap={10}>
          <Rect width={50} height={50} />
          {item}
        </Layout>,
      );
      const target = (<Node x={100} />) as Node;
      add(target);
      yield* item.transitionTo(target, 0.5);
      expect(item.isLayoutRoot()).toBe(true);
      expect(item.position.abs()).toEqual(target.position.abs());
    }),
  );
});
