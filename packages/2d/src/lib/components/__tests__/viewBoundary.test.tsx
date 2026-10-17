import {createRef} from '@canvas-commons/core';
import {describe, expect, it} from 'vitest';
import {useScene2D} from '../../scenes';
import {Layout, LayoutProps} from '../Layout';
import {Node} from '../Node';
import {Rect} from '../Rect';
import {View2D} from '../View2D';
import {mockScene2D} from './mockScene2D';

class Surface extends Layout {
  public readonly surface: View2D;

  public constructor(props: LayoutProps) {
    super(props);
    this.surface = new View2D({assetHash: '', size: [400, 300]});
  }

  public override view(): View2D {
    return this.surface;
  }
}

describe('view boundaries', () => {
  mockScene2D();

  it('resolves the view through the parent chain', () => {
    const view = useScene2D().getView();
    const surface = createRef<Surface>();
    const inner = createRef<Rect>();
    const outer = createRef<Rect>();
    view.add(
      <Layout>
        <Rect ref={outer} />
        <Surface ref={surface}>
          <Node>
            <Rect ref={inner} />
          </Node>
        </Surface>
      </Layout>,
    );

    expect(outer().view()).toBe(view);
    expect(inner().view()).toBe(surface().surface);

    inner().remove();
    expect(inner().view()).toBe(view);
  });
});
