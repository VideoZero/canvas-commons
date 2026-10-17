import {createRef} from '@canvas-commons/core';
import {describe, expect, it} from 'vitest';
import {useScene2D} from '../../scenes';
import {Layout, LayoutProps} from '../Layout';
import {Node, NodeProps} from '../Node';
import {Rect} from '../Rect';
import {View2D} from '../View2D';
import {mockScene2D} from './mockScene2D';

class NodeSurface extends Node {
  public readonly surface: View2D;

  public constructor(props: NodeProps) {
    super(props);
    this.surface = new View2D({assetHash: '', size: [400, 300]});
  }

  public override view(): View2D {
    return this.surface;
  }
}

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

  it('keeps a surface out of the flex layout around it', () => {
    const view = useScene2D().getView();
    const surface = createRef<Surface>();
    const parent = (
      <Layout layout>
        <Rect width={100} height={100} />
        <Surface ref={surface} x={30} width={200} height={100} />
      </Layout>
    ) as Layout;
    view.add(parent);

    expect(parent.size.x()).toBe(100);
    expect(surface().isLayoutRoot()).toBe(true);
    expect(surface().position.x()).toBe(30);
  });

  it('lays out the content of a surface against the surface', () => {
    const view = useScene2D().getView();
    const content = createRef<Rect>();
    view.add(
      <Layout layout>
        <Rect width={100} height={100} />
        <Surface width={200} height={100}>
          <Rect ref={content} x={10} width={50} height={50} />
        </Surface>
      </Layout>,
    );

    expect(content().isLayoutRoot()).toBe(true);
    expect(content().position.x()).toBe(10);
  });

  it('sizes a flex surface by its own content', () => {
    const view = useScene2D().getView();
    const surface = createRef<Surface>();
    const first = createRef<Rect>();
    view.add(
      <Layout layout direction={'column'} width={1000}>
        <Surface ref={surface} layout>
          <Rect ref={first} width={50} height={50} />
          <Rect width={50} height={50} />
        </Surface>
      </Layout>,
    );

    expect(surface().size.x()).toBe(100);
    expect(first().position.x()).toBe(-25);
  });

  it('resolves percent sizes of the content against the surface', () => {
    const view = useScene2D().getView();
    const content = createRef<Rect>();
    view.add(
      <Layout layout width={1000} height={800}>
        <NodeSurface>
          <Rect ref={content} width={'50%'} height={'50%'} />
        </NodeSurface>
      </Layout>,
    );

    expect(content().isLayoutRoot()).toBe(true);
    expect(content().size()).toEqual({x: 200, y: 150});
  });
});
