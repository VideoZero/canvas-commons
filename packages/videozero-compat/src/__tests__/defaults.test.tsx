import {Layout, Node, Rect, Txt, attributionConfig} from '@canvas-commons/2d';
import {useLogger} from '@canvas-commons/core';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {AnimLayout} from '../AnimLayout';
import {AnimTxt} from '../AnimTxt';
import {
  VideoZeroAttributionFontFamily,
  applyVideoZeroDefaults,
  applyVideoZeroViewDefaults,
} from '../defaults';
import {VideoZeroFontFamily} from '../fonts';
import {generatorTest, mockScene2D} from './mockScene2D';

describe('applyVideoZeroDefaults', () => {
  mockScene2D();

  let restore: (() => void) | null = null;
  afterEach(() => {
    restore?.();
    restore = null;
    vi.restoreAllMocks();
  });

  it('changes nothing until it is called', () => {
    expect(Txt.defaultTextCenter).toBe('line');
    expect(Txt.defaultCenterLetterSpacing).toBe(false);
    expect(Txt.defaultSmooth).toBe(false);
    expect(Txt.warnTightLineHeight).toBe(false);
    expect(Node.warnVisibleBeforeEntrance).toBe(false);
    expect(new Txt({text: 'a'}).lineJoin()).toBe('miter');
    expect(Layout.warnIgnoredPosition).toBe(false);
    expect(new Rect({}).strokeFirst()).toBe(false);
    expect(attributionConfig.queryParam).toBe('attribution');
  });

  it('applies the VideoZero defaults and restores the previous ones', () => {
    restore = applyVideoZeroDefaults();
    expect(Txt.defaultTextCenter).toBe('cap');
    expect(Txt.defaultCenterLetterSpacing).toBe(true);
    expect(Txt.defaultSmooth).toBe(true);
    expect(AnimTxt.defaultSmooth).toBe(true);
    expect(new Txt({text: 'a'}).smooth()).toBe(true);
    expect(new AnimTxt({text: 'a'}).smooth()).toBe(true);
    expect(Txt.warnTightLineHeight).toBe(true);
    expect(Node.warnVisibleBeforeEntrance).toBe(true);
    expect(Layout.warnIgnoredPosition).toBe(true);
    expect(new Rect({}).strokeFirst()).toBe(true);
    expect(new Txt({text: 'a'}).strokeFirst()).toBe(true);
    expect(new Rect({strokeFirst: false}).strokeFirst()).toBe(false);
    expect(new AnimTxt({text: 'a'}).lineJoin()).toBe('round');
    expect(new Txt({text: 'a'}).lineJoin()).toBe('miter');
    expect(attributionConfig.queryParam).toBe('vz_attribution');
    expect(attributionConfig.render.fontFamily).toBe(
      VideoZeroAttributionFontFamily,
    );

    restore();
    restore = null;
    expect(Txt.defaultTextCenter).toBe('line');
    expect(Txt.defaultCenterLetterSpacing).toBe(false);
    expect(Txt.defaultSmooth).toBe(false);
    expect(new AnimTxt({text: 'a'}).smooth()).toBe(false);
    expect(Txt.warnTightLineHeight).toBe(false);
    expect(Node.warnVisibleBeforeEntrance).toBe(false);
    expect(Layout.warnIgnoredPosition).toBe(false);
    expect(new Rect({}).strokeFirst()).toBe(false);
    expect(attributionConfig.queryParam).toBe('attribution');
    expect(attributionConfig.render.fontFamily).toBe('sans-serif');
  });

  it(
    'sets the VideoZero font on the view',
    generatorTest(function* (view) {
      const txt = new Txt({text: 'a'});
      view.add(txt);
      expect(txt.fontFamily()).toBe('Roboto');
      applyVideoZeroViewDefaults(view);
      expect(txt.fontFamily()).toBe(VideoZeroFontFamily);
      expect(new Txt({text: 'b', fontFamily: 'Lato'}).fontFamily()).toBe(
        'Lato',
      );
    }),
  );

  it(
    'warns about a position a layout ignores, but not after layout animations',
    generatorTest(function* (view) {
      restore = applyVideoZeroDefaults();
      const warn = vi.spyOn(useLogger(), 'warn');
      const list = new AnimLayout({layout: true, gap: 10});
      const moved = new Rect({size: 50, x: 100});
      view.add(list);
      list.add([new Rect({size: 50}), moved]);

      const added = new Rect({size: 50});
      yield* list.addAnimated(added, 0.3);
      yield* list.reorderAnimated([...list.children()].reverse(), 0.3);
      yield* list.removeAnimated(added, 0.3);
      for (const child of list.children()) child.position();

      expect(warn.mock.calls.map(([payload]) => payload)).toEqual([
        expect.objectContaining({
          message:
            'Rect is positioned by its layout parent, so its x/y/position is ignored.',
          inspect: moved.key,
        }),
      ]);
    }),
  );
});
