import {Color, Vector2} from '@canvas-commons/core';
import {describe, expect, it} from 'vitest';
import {Layout} from '../../components/Layout';
import {Node} from '../../components/Node';
import {Rect} from '../../components/Rect';
import {Txt} from '../../components/Txt';
import {failOnSceneErrors} from '../../components/__tests__/failOnSceneErrors';
import {mockScene2D} from '../../components/__tests__/mockScene2D';
import {mockTextContext} from '../../components/__tests__/mockTextContext';
import {add} from '../../components/__tests__/sceneFixtures';
import {useScene2D} from '../../scenes';
import {splitText} from '../splitText';

function worldOf(node: Node): Vector2 {
  return Vector2.zero.transformAsPoint(node.localToWorld());
}

describe('splitText (headless)', () => {
  mockScene2D();

  it('has no pieces without a 2D canvas and still restores', () => {
    const txt = new Txt({text: 'hello'});
    add(txt);
    const split = splitText(txt);
    expect(split.pieces).toEqual([]);
    expect(txt.opacity()).toBe(0);
    split.restore();
    expect(txt.opacity()).toBe(1);
    expect(split.container.parent()).toBeNull();
  });
});

describe('splitText', () => {
  mockScene2D();
  failOnSceneErrors();
  mockTextContext(10);

  it('draws the pieces above the source in its place', () => {
    const view = useScene2D().getView();
    const before = new Rect({size: 10});
    const txt = new Txt({text: 'abc', fontSize: 10});
    const after = new Rect({size: 10});
    view.add([before, txt, after]);

    const split = splitText(txt);
    expect(split.pieces.map(piece => piece.text())).toEqual(['a', 'b', 'c']);
    expect(view.children()).toEqual([before, txt, split.container, after]);
    expect(txt.opacity()).toBe(0);

    const glyphs = txt.textGlyphs();
    split.pieces.forEach((piece, index) => {
      expect(piece.parent()).toBe(split.container);
      expect(split.homes[index].x).toBeCloseTo(glyphs[index].x, 5);
    });
  });

  it('follows the transform of the source', () => {
    const group = new Node({x: 40, rotation: 20});
    const txt = new Txt({
      text: 'abc',
      fontSize: 10,
      x: 100,
      y: -30,
      rotation: 30,
      scale: 2,
    });
    group.add(txt);
    add(group);

    const split = splitText(txt);
    const check = () => {
      const glyphs = txt.textGlyphs();
      split.pieces.forEach((piece, index) => {
        expect(split.homes[index].x).toBeCloseTo(glyphs[index].x, 5);
        const expected = split.homes[index].transformAsPoint(
          txt.localToWorld(),
        );
        expect(worldOf(piece).x).toBeCloseTo(expected.x, 3);
        expect(worldOf(piece).y).toBeCloseTo(expected.y, 3);
      });
    };
    check();
    txt.position([-60, 20]);
    txt.rotation(-45);
    check();
  });

  it('keeps the pieces out of the flex layout of the parent', () => {
    const row = new Layout({layout: true, gap: 10, width: 400});
    const txt = new Txt({text: 'abc', fontSize: 10});
    const box = new Rect({size: 20});
    row.add([txt, box]);
    add(row);
    const at = box.position();

    const split = splitText(txt, {by: 'word'});
    expect(split.pieces.map(piece => piece.text())).toEqual(['abc']);
    expect(box.position().x).toBeCloseTo(at.x, 5);
    expect(split.pieces[0].position().x).toBeCloseTo(txt.textWords()[0].x, 5);
  });

  it('groups the pieces by line', () => {
    const txt = new Txt({
      text: 'aaa bbb ccc',
      fontSize: 10,
      lineHeight: 20,
      width: 65,
    });
    add(txt);
    expect(txt.lineCount()).toBe(3);

    const words = splitText(txt, {by: 'word'});
    expect(words.lines.map(line => line.map(piece => piece.text()))).toEqual([
      ['aaa'],
      ['bbb'],
      ['ccc'],
    ]);
    expect(words.lineIndexOf(2)).toBe(2);
    words.restore();

    const lines = splitText(txt, {by: 'line'});
    expect(lines.pieces.map(piece => piece.text())).toEqual([
      'aaa',
      'bbb',
      'ccc',
    ]);
    lines.pieces.forEach((piece, index) => {
      expect(lines.lineBoxes[index].height).toBeCloseTo(20, 5);
      expect(lines.lineBoxes[index].center.y).toBeCloseTo(
        lines.homes[index].y,
        0,
      );
      expect(piece.size().x).toBeCloseTo(30, 5);
    });
  });

  it('masks every line to its own box when clipped', () => {
    const txt = new Txt({
      text: 'aaa bbb',
      fontSize: 10,
      lineHeight: 20,
      width: 45,
    });
    add(txt);
    const plain = splitText(txt).pieces.map(worldOf);
    useScene2D().getView().removeChildren();
    add(txt);

    const split = splitText(txt, {clip: true, clipPadding: 2});
    const masks = split.container.children();
    expect(masks).toHaveLength(2);
    masks.forEach((mask, line) => {
      expect(mask).toBeInstanceOf(Layout);
      expect(mask instanceof Layout && mask.clip()).toBe(true);
      expect(mask.children()).toEqual(split.lines[line]);
      expect(split.lineBoxes[line].height).toBeCloseTo(24, 5);
      expect(split.lineBoxes[line].width).toBeCloseTo(34, 5);
    });
    split.pieces.forEach((piece, index) => {
      expect(worldOf(piece).x).toBeCloseTo(plain[index].x, 5);
      expect(worldOf(piece).y).toBeCloseTo(plain[index].y, 5);
    });
  });

  it('mounts the pieces of a nested text next to its root', () => {
    const inner = new Txt({text: 'bc', fill: 'red'});
    const root = new Txt({fontSize: 10, children: ['a', inner]});
    add(root);
    const whole = splitText(root).pieces.map(worldOf);
    useScene2D().getView().removeChildren();
    add(root);

    const split = splitText(inner);
    expect(split.container.parent()).toBe(root.parent());
    expect(split.pieces.map(piece => piece.text())).toEqual(['b', 'c']);
    split.pieces.forEach((piece, index) => {
      expect(worldOf(piece).x).toBeCloseTo(whole[index + 1].x, 5);
    });
    split.restore();
    expect(inner.opacity()).toBe(1);
  });

  it('copies the style of the source once by default', () => {
    const txt = new Txt({text: 'ab', fontSize: 10, fill: 'white'});
    add(txt);
    const split = splitText(txt);
    txt.fill('red');
    txt.fontWeight(700);
    split.pieces.forEach(piece => {
      expect(piece.fill()).toEqual(new Color('white'));
      expect(piece.fontWeight()).toBe(500);
    });
  });

  it('keeps the pieces bound to the style of the source', () => {
    const txt = new Txt({text: 'ab', fontSize: 10, fill: 'white'});
    add(txt);
    const split = splitText(txt, {followStyle: true});
    expect(split.followStyle).toBe(true);
    txt.fill('red');
    txt.fontWeight(700);
    txt.fontSize(20);
    txt.fontFamily('Lora');
    split.pieces.forEach(piece => {
      expect(piece.fill()).toEqual(new Color('red'));
      expect(piece.fontWeight()).toBe(700);
      expect(piece.fontSize()).toBe(20);
      expect(piece.fontFamily()).toBe('Lora');
      expect(piece.opacity()).toBe(1);
    });

    split.pieces[0].fill('blue');
    txt.fill('green');
    expect(split.pieces[0].fill()).toEqual(new Color('blue'));
    expect(split.pieces[1].fill()).toEqual(new Color('green'));
  });

  it('keeps the pieces of a nested text bound to that text', () => {
    const inner = new Txt({text: 'bc', fill: 'red', opacity: 0.5});
    const root = new Txt({fontSize: 10, fill: 'white', children: ['a', inner]});
    add(root);
    const split = splitText(root, {followStyle: true});
    expect(split.pieces.map(piece => piece.text())).toEqual(['a', 'b', 'c']);
    expect(split.pieces[1].opacity()).toBe(0.5);

    inner.fill('blue');
    inner.opacity(0.25);
    root.fill('black');
    expect(split.pieces[0].fill()).toEqual(new Color('black'));
    expect(split.pieces[1].fill()).toEqual(new Color('blue'));
    expect(split.pieces[2].opacity()).toBe(0.25);
  });

  it('restores the opacity the source had', () => {
    const txt = new Txt({text: 'abc', fontSize: 10, opacity: 0.5});
    add(txt);
    const split = splitText(txt);
    expect(split.opacity).toBe(0.5);
    expect(split.container.opacity()).toBe(0.5);
    split.restore();
    expect(txt.opacity()).toBe(0.5);
    expect(split.container.parent()).toBeNull();
  });
});
