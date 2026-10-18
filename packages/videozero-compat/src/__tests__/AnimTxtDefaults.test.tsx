import {Layout, Rect, Txt} from '@canvas-commons/2d';
import {
  Color,
  ThreadGenerator,
  all,
  createSignal,
  linear,
  waitFor,
} from '@canvas-commons/core';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {AnimTxt} from '../AnimTxt';
import {VideoZeroFontFamily, resolveVideoZeroFontFamily} from '../fonts';
import {failOnSceneErrors, generatorTest, mockScene2D} from './mockScene2D';
import {mockTextContext} from './mockTextContext';

/** Run `animation`, and `probe` once `at` seconds of it have passed. */
function* probeAt(
  animation: ThreadGenerator,
  at: number,
  probe: () => void,
): ThreadGenerator {
  yield* all(
    animation,
    (function* () {
      yield* waitFor(at);
      probe();
    })(),
  );
}

const Red = new Color('#ff0000');
const Green = new Color('#00ff00');
const Blue = new Color('#0000ff');

describe('AnimTxt VideoZero defaults', () => {
  mockScene2D();
  failOnSceneErrors();
  mockTextContext(10);

  describe('escaped newlines', () => {
    afterEach(() => {
      AnimTxt.escapedNewlines = true;
    });

    it(
      'breaks the line at a literal backslash-n',
      generatorTest(function* (view) {
        const prop = new AnimTxt({text: 'ab\\ncd', fontSize: 10});
        const child = new AnimTxt({children: 'ab\\ncd', fontSize: 10});
        const plain = new Txt({text: 'ab\\ncd', fontSize: 10});
        view.add([prop, child, plain]);
        expect(prop.text()).toBe('ab\ncd');
        expect(prop.lineCount()).toBe(2);
        expect(child.lineCount()).toBe(2);
        expect(plain.text()).toBe('ab\\ncd');
        expect(plain.lineCount()).toBe(1);
      }),
    );

    it(
      'breaks the line in later, reactive and tweened text',
      generatorTest(function* (view) {
        const txt = new AnimTxt({text: 'ab', fontSize: 10});
        view.add(txt);
        txt.text('a\\nb');
        expect(txt.lineCount()).toBe(2);

        const source = createSignal('x\\ny\\nz');
        txt.text(source);
        expect(txt.text()).toBe('x\ny\nz');
        source('x');
        expect(txt.lineCount()).toBe(1);

        yield* txt.text('c\\nd', 0.2);
        expect(txt.text()).toBe('c\nd');
        expect(txt.lineCount()).toBe(2);
      }),
    );

    it(
      'breaks the line in nested text',
      generatorTest(function* (view) {
        const nested = new Txt({text: 'c\\nd'});
        const txt = new AnimTxt({fontSize: 10, children: ['ab\\n', nested]});
        view.add(txt);
        expect(txt.text()).toBe('ab\nc\nd');
        expect(txt.lineCount()).toBe(3);
      }),
    );

    it(
      'can be turned off',
      generatorTest(function* (view) {
        AnimTxt.escapedNewlines = false;
        const txt = new AnimTxt({text: 'ab\\ncd', fontSize: 10});
        view.add(txt);
        expect(txt.lineCount()).toBe(1);
      }),
    );
  });

  describe('numeric line height', () => {
    afterEach(() => {
      AnimTxt.lineHeightMultiplierLimit = 4;
    });

    it(
      'reads a number up to 4 as a multiplier',
      generatorTest(function* (view) {
        const txt = new AnimTxt({text: 'a', fontSize: 10, lineHeight: 1.5});
        const pixels = new AnimTxt({text: 'a', fontSize: 10, lineHeight: 20});
        const plain = new Txt({text: 'a', fontSize: 10, lineHeight: 1.5});
        view.add([txt, pixels, plain]);
        expect(txt.lineHeight()).toBe('150%');
        expect(txt.resolvedLineHeight()).toBeCloseTo(15);
        expect(pixels.lineHeight()).toBe(20);
        expect(plain.resolvedLineHeight()).toBe(1.5);

        txt.lineHeight(2);
        expect(txt.resolvedLineHeight()).toBeCloseTo(20);
      }),
    );

    it(
      'reads inherited and nested numbers as multipliers',
      generatorTest(function* (view) {
        const txt = new AnimTxt({text: 'a', fontSize: 10});
        view.add(new Layout({lineHeight: 1.5, children: txt}));
        expect(txt.lineHeight()).toBe('150%');

        const nested = new Txt({text: 'b', lineHeight: 2});
        view.add(new AnimTxt({children: [nested]}));
        expect(nested.lineHeight()).toBe('200%');
      }),
    );

    it(
      'tweens between multipliers, percentages and pixels',
      generatorTest(function* (view) {
        const txt = new AnimTxt({text: 'a', fontSize: 10, lineHeight: 1});
        view.add(txt);
        yield* probeAt(txt.lineHeight(2, 1, linear), 0.5, () => {
          expect(txt.resolvedLineHeight()).toBeCloseTo(15, 0);
        });
        expect(txt.lineHeight()).toBe('200%');
        expect(txt.resolvedLineHeight()).toBeCloseTo(20);

        yield* probeAt(txt.lineHeight(40, 1, linear), 0.5, () => {
          expect(txt.resolvedLineHeight()).toBeGreaterThan(25);
          expect(txt.resolvedLineHeight()).toBeLessThan(35);
        });
        expect(txt.lineHeight()).toBe(40);
      }),
    );

    it(
      'reads every number as pixels without a limit',
      generatorTest(function* (view) {
        AnimTxt.lineHeightMultiplierLimit = null;
        const txt = new AnimTxt({text: 'a', fontSize: 10, lineHeight: 1.5});
        view.add(txt);
        expect(txt.lineHeight()).toBe(1.5);
      }),
    );
  });

  describe('default font', () => {
    afterEach(() => {
      AnimTxt.defaultFontFamily = VideoZeroFontFamily;
    });

    it(
      'uses the Inter stack when nothing sets a font',
      generatorTest(function* (view) {
        const txt = new AnimTxt({text: 'a'});
        const nested = new Txt({text: 'b'});
        const parent = new AnimTxt({children: [nested]});
        const plain = new Txt({text: 'c'});
        view.add([txt, parent, plain]);
        expect(txt.fontFamily()).toBe(VideoZeroFontFamily);
        expect(txt.canvasFont()).toContain(VideoZeroFontFamily);
        expect(nested.fontFamily()).toBe(VideoZeroFontFamily);
        expect(plain.fontFamily()).toBe('Roboto');
      }),
    );

    it(
      'uses the Inter stack inside containers without layout',
      generatorTest(function* (view) {
        view.fontFamily('Lora');
        const txt = new AnimTxt({text: 'a'});
        const plain = new Txt({text: 'b'});
        view.add(new Rect({layout: false, children: [txt, plain]}));
        expect(plain.fontFamily()).toBe('Roboto');
        expect(txt.fontFamily()).toBe(VideoZeroFontFamily);
      }),
    );

    it(
      'inherits a font set on an ancestor or on itself',
      generatorTest(function* (view) {
        const inner = new AnimTxt({text: 'a'});
        const box = new Rect({children: new Layout({children: inner})});
        view.add(box);
        expect(inner.fontFamily()).toBe(VideoZeroFontFamily);
        box.fontFamily('Lora');
        expect(inner.fontFamily()).toBe('Lora');
        view.fontFamily('Lato');
        expect(inner.fontFamily()).toBe('Lora');
        expect(new AnimTxt({fontFamily: 'Lato'}).fontFamily()).toBe('Lato');

        const outside = new Rect({
          layout: false,
          fontFamily: 'Lora',
          children: new AnimTxt({text: 'b'}),
        });
        view.add(outside);
        expect((outside.children()[0] as AnimTxt).fontFamily()).toBe('Lora');
      }),
    );

    it(
      'keeps the Canvas Commons default when turned off',
      generatorTest(function* (view) {
        AnimTxt.defaultFontFamily = null;
        const txt = new AnimTxt({text: 'a'});
        view.add(txt);
        expect(txt.fontFamily()).toBe('Roboto');
        view.fontFamily('Lora');
        expect(txt.fontFamily()).toBe('Lora');
      }),
    );
  });

  describe('font aliases', () => {
    let warn: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      warn = vi.spyOn(console, 'warn').mockReturnValue(undefined);
    });

    afterEach(() => {
      warn.mockRestore();
      for (const key of Object.keys(AnimTxt.fonts)) delete AnimTxt.fonts[key];
    });

    it(
      'resolves semantic names through AnimTxt.fonts',
      generatorTest(function* (view) {
        AnimTxt.fonts.warmPlayful = '"Fraunces", serif';
        Object.assign(AnimTxt.fonts, {mono: '"JetBrains Mono", monospace'});
        const txt = new AnimTxt({text: 'a', fontFamily: 'warmPlayful'});
        view.add(txt);
        expect(txt.fontFamily()).toBe('"Fraunces", serif');
        expect(txt.canvasFont()).toContain('"Fraunces", serif');

        txt.fontFamily('mono');
        expect(txt.fontFamily()).toBe('"JetBrains Mono", monospace');

        const inherited = new AnimTxt({text: 'b'});
        view.add(new Layout({fontFamily: 'warmPlayful', children: inherited}));
        expect(inherited.fontFamily()).toBe('"Fraunces", serif');

        const nested = new Txt({text: 'c', fontFamily: 'mono'});
        view.add(new AnimTxt({children: [nested]}));
        expect(nested.fontFamily()).toBe('"JetBrains Mono", monospace');

        expect(new Txt({fontFamily: 'mono'}).fontFamily()).toBe('mono');
        expect(warn).not.toHaveBeenCalled();
      }),
    );

    it('keeps stacks, generic families and font names', () => {
      expect(resolveVideoZeroFontFamily('Inter, sans-serif')).toBe(
        'Inter, sans-serif',
      );
      expect(resolveVideoZeroFontFamily('"Lora"')).toBe('"Lora"');
      expect(resolveVideoZeroFontFamily('serif')).toBe('serif');
      expect(resolveVideoZeroFontFamily('Arial')).toBe('Arial');
      expect(resolveVideoZeroFontFamily('Noto Sans SC')).toBe('"Noto Sans SC"');
      expect(warn).not.toHaveBeenCalled();
    });

    it('warns once about an unknown semantic name', () => {
      AnimTxt.fonts.body = 'Inter, sans-serif';
      expect(resolveVideoZeroFontFamily('warmFormal')).toBe('warmFormal');
      expect(resolveVideoZeroFontFamily('warmFormal')).toBe('warmFormal');
      expect(warn).toHaveBeenCalledTimes(1);
      const logged = JSON.stringify(warn.mock.calls[0]);
      expect(logged).toContain('warmFormal');
      expect(logged).toContain('body');
    });
  });

  describe('split pieces', () => {
    it(
      'follow the style of the text after an entrance',
      generatorTest(function* (view) {
        const txt = new AnimTxt({text: 'abc', fontSize: 10, opacity: 0});
        view.add(txt);
        yield* txt.fadeUp(0.2);
        expect(txt.chars).toHaveLength(3);
        yield* txt.fill(Red, 0.2);
        txt.fontWeight(700);
        txt.chars.forEach(piece => {
          expect(piece.fill()).toEqual(Red);
          expect(piece.fontWeight()).toBe(700);
        });
      }),
    );

    it(
      'follow a style tweened during a helper',
      generatorTest(function* (view) {
        const txt = new AnimTxt({text: 'abc', fontSize: 10, opacity: 0});
        view.add(txt);
        yield* all(txt.typewriter(), txt.fill(Red, 0.3));
        txt.chars.forEach(piece => expect(piece.fill()).toEqual(Red));

        yield* probeAt(all(txt.fadeOut(0.4), txt.fill(Blue, 0.2)), 0.3, () => {
          const pieces = view
            .children()
            .flatMap(child => child.children())
            .filter((child): child is Txt => child instanceof Txt);
          expect(pieces).toHaveLength(3);
          pieces.forEach(piece => expect(piece.fill()).toEqual(Blue));
        });
      }),
    );

    it(
      'follow the style after splitChars, unless set on the piece',
      generatorTest(function* (view) {
        AnimTxt.fonts.title = '"Fraunces", serif';
        const txt = new AnimTxt({
          text: 'abc',
          fontSize: 10,
          fontFamily: 'title',
        });
        view.add(txt);
        txt.splitChars();
        expect(txt.chars[0].fontFamily()).toBe('"Fraunces", serif');
        txt.chars[0].fill(Blue);
        txt.fill(Green);
        txt.fontSize(20);
        expect(txt.chars[0].fill()).toEqual(Blue);
        expect(txt.chars[1].fill()).toEqual(Green);
        expect(txt.chars[2].fontSize()).toBe(20);
        delete AnimTxt.fonts.title;
      }),
    );

    it(
      'follow the fill again after outline()',
      generatorTest(function* (view) {
        const txt = new AnimTxt({text: 'ab', fontSize: 10, opacity: 0});
        view.add(txt);
        yield* txt.outline();
        txt.fill(Red);
        txt.chars.forEach(piece => expect(piece.fill()).toEqual(Red));
      }),
    );
  });
});
