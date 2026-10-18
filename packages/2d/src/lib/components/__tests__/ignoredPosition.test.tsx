import {ThreadGenerator, useLogger} from '@canvas-commons/core';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {Layout} from '../Layout';
import {Node} from '../Node';
import {Rect} from '../Rect';
import {Txt} from '../Txt';
import {generatorTest} from './generatorTest';
import {mockScene2D} from './mockScene2D';
import {mockTextContext} from './mockTextContext';
import {add} from './sceneFixtures';

describe('Layout.warnIgnoredPosition', () => {
  mockScene2D();
  mockTextContext();

  afterEach(() => {
    Layout.warnIgnoredPosition = false;
    vi.restoreAllMocks();
  });

  function warnings(read: () => void): string[] {
    const warn = vi.spyOn(useLogger(), 'warn');
    Layout.warnIgnoredPosition = true;
    read();
    return warn.mock.calls.map(([payload]) =>
      typeof payload === 'string' ? payload : payload.message,
    );
  }

  it('warns once for a positioned layout child', () => {
    const child = (<Rect x={5} />) as Rect;
    const free = (<Rect />) as Rect;
    add(
      <Layout layout>
        {child}
        {free}
      </Layout>,
    );

    expect(
      warnings(() => {
        child.x();
        child.y();
        child.position();
        free.x();
      }),
    ).toEqual([
      'Rect is positioned by its layout parent, so its x/y/position is ignored.',
    ]);
  });

  it('warns for y and position set on a layout child', () => {
    const byY = (<Rect y={5} />) as Rect;
    const byPosition = (<Rect position={[3, 4]} />) as Rect;
    add(
      <Layout layout>
        {byY}
        {byPosition}
      </Layout>,
    );

    expect(
      warnings(() => {
        byY.position();
        byPosition.position();
      }),
    ).toHaveLength(2);
  });

  it('warns through a plain Node, which layout looks through', () => {
    const child = (<Rect x={5} />) as Rect;
    add(
      <Layout layout>
        <Node>{child}</Node>
      </Layout>,
    );
    expect(warnings(() => child.x())).toHaveLength(1);
  });

  it('points at the node and suggests how to fix it', () => {
    const child = (<Rect x={5} />) as Rect;
    add(<Layout layout>{child}</Layout>);
    const warn = vi.spyOn(useLogger(), 'warn');
    Layout.warnIgnoredPosition = true;
    child.x();

    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({
        inspect: child.key,
        remarks: expect.stringContaining('layoutSelf={false}'),
      }),
    );
  });

  it('is off by default', () => {
    const warn = vi.spyOn(useLogger(), 'warn');
    const child = (<Rect x={5} />) as Rect;
    add(<Layout layout>{child}</Layout>);
    child.x();
    expect(warn).not.toHaveBeenCalled();
  });

  it('stays quiet for nodes that place themselves', () => {
    const root = (<Layout layout x={10} />) as Layout;
    const optedOut = (<Rect layoutSelf={false} x={10} />) as Rect;
    const outside = (<Rect x={10} />) as Rect;
    const nested = (<Txt x={10}>inner</Txt>) as Txt;
    add(root);
    add(
      <Layout layout>
        {optedOut}
        <Layout layoutChildren={false}>{outside}</Layout>
        <Txt>outer {nested}</Txt>
      </Layout>,
    );

    expect(
      warnings(() => {
        for (const node of [root, optedOut, outside, nested]) {
          node.x();
          node.y();
        }
      }),
    ).toEqual([]);
  });

  it('stays quiet when a layout child moves through translate', () => {
    const child = (<Rect translate={[5, 0]} />) as Rect;
    add(<Layout layout>{child}</Layout>);
    expect(warnings(() => child.position())).toEqual([]);
  });
});

describe('Layout.warnIgnoredPosition after layout animations', () => {
  mockScene2D();

  afterEach(() => {
    Layout.warnIgnoredPosition = false;
    vi.restoreAllMocks();
  });

  function row(count: number): [Layout, Rect[]] {
    const items = Array.from(
      {length: count},
      () => (<Rect width={50} height={50} />) as Rect,
    );
    const layout = (
      <Layout layout direction="row" gap={10}>
        {items}
      </Layout>
    ) as Layout;
    add(layout);
    return [layout, items];
  }

  function quietAfter(
    animate: (layout: Layout, items: Rect[]) => ThreadGenerator,
  ) {
    return generatorTest(function* () {
      const [layout, items] = row(3);
      const warn = vi.spyOn(useLogger(), 'warn');
      Layout.warnIgnoredPosition = true;
      yield* animate(layout, items);
      for (const node of layout.childrenAs<Layout>()) {
        node.x();
        node.y();
      }
      expect(warn).not.toHaveBeenCalled();
    });
  }

  it(
    'stays quiet after an animated add',
    quietAfter(layout => layout.add(<Rect width={50} height={50} />, 0.5)),
  );
  it(
    'stays quiet after an animated insert',
    quietAfter(layout =>
      layout.insert(<Rect width={50} height={50} />, 1, 0.5),
    ),
  );
  it(
    'stays quiet after an animated remove',
    quietAfter((_, items) => items[1].remove(0.5)),
  );
  it(
    'stays quiet after editLayout',
    quietAfter(layout =>
      layout.editLayout(0.5, node => node.direction('column')),
    ),
  );
  it(
    'stays quiet after freezeLayout and thawLayout',
    quietAfter(function* (layout, items) {
      layout.freezeLayout();
      items[0].x(-200);
      yield* layout.thawLayout(0.5);
    }),
  );
  it(
    'stays quiet after transitionTo another layout',
    quietAfter(function* (layout, items) {
      const target = (<Layout layout />) as Layout;
      add(target);
      yield* items[0].transitionTo(target, 0.5);
      items[0].x();
      yield* items[0].transitionTo(layout, 0.5);
    }),
  );
});
