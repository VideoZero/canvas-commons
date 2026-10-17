import {Node, Rect, Txt, attributionConfig} from '@canvas-commons/2d';
import {afterEach, describe, expect, it} from 'vitest';
import {AnimTxt} from '../AnimTxt';
import {
  VideoZeroAttributionFontFamily,
  VideoZeroFontFamily,
  applyVideoZeroDefaults,
  applyVideoZeroViewDefaults,
} from '../defaults';
import {generatorTest, mockScene2D} from './mockScene2D';

describe('applyVideoZeroDefaults', () => {
  mockScene2D();

  let restore: (() => void) | null = null;
  afterEach(() => {
    restore?.();
    restore = null;
  });

  it('changes nothing until it is called', () => {
    expect(Txt.defaultTextCenter).toBe('line');
    expect(Txt.warnTightLineHeight).toBe(false);
    expect(Node.warnVisibleBeforeEntrance).toBe(false);
    expect(AnimTxt.defaultLineJoin).toBeNull();
    expect(new Rect({}).strokeFirst()).toBe(false);
    expect(attributionConfig.queryParam).toBe('attribution');
  });

  it('applies the VideoZero defaults and restores the previous ones', () => {
    restore = applyVideoZeroDefaults();
    expect(Txt.defaultTextCenter).toBe('cap');
    expect(Txt.warnTightLineHeight).toBe(true);
    expect(Node.warnVisibleBeforeEntrance).toBe(true);
    expect(AnimTxt.defaultLineJoin).toBe('round');
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
    expect(Txt.warnTightLineHeight).toBe(false);
    expect(Node.warnVisibleBeforeEntrance).toBe(false);
    expect(AnimTxt.defaultLineJoin).toBeNull();
    expect(new Rect({}).strokeFirst()).toBe(false);
    expect(attributionConfig.queryParam).toBe('attribution');
    expect(attributionConfig.render.fontFamily).toBe('sans-serif');
  });

  it(
    'sets the VideoZero font on the view',
    generatorTest(function* (view) {
      const txt = new AnimTxt({text: 'a'});
      view.add(txt);
      expect(txt.fontFamily()).toBe('Roboto');
      applyVideoZeroViewDefaults(view);
      expect(txt.fontFamily()).toBe(VideoZeroFontFamily);
      expect(new Txt({text: 'b', fontFamily: 'Lato'}).fontFamily()).toBe(
        'Lato',
      );
    }),
  );
});
