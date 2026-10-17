import {Color, unwrap} from '@canvas-commons/core';
import {describe, expect, it} from 'vitest';
import {Gradient} from '../../partials';
import {canvasStyleParser} from '../CanvasUtils';
import {parseCSSGradient} from '../parseCSSGradient';

function parse(value: string): Gradient {
  const gradient = parseCSSGradient(value);
  if (!gradient) throw new Error(`not parsed: ${value}`);
  return gradient;
}

function offsets(gradient: Gradient) {
  return gradient.stops().map(stop => unwrap(stop.offset));
}

function colors(gradient: Gradient) {
  return gradient.stops().map(stop => new Color(unwrap(stop.color)).hex());
}

function direction(gradient: Gradient) {
  const vector = gradient.to().sub(gradient.from()).normalized;
  return [vector.x, vector.y];
}

describe('parseCSSGradient', () => {
  it('returns null for a value that is not a gradient', () => {
    expect(parseCSSGradient('red')).toBeNull();
    expect(parseCSSGradient('linear-gradient(to nowhere, red, blue)')).toBe(
      null,
    );
    expect(parseCSSGradient('linear-gradient(nonsense)')).toBeNull();
  });

  describe('linear', () => {
    it('runs to the bottom by default', () => {
      const gradient = parse('linear-gradient(red, blue)');

      expect(gradient.type()).toBe('linear');
      expect(gradient.cssRelative()).toBe(true);
      expect(direction(gradient)[0]).toBeCloseTo(0);
      expect(direction(gradient)[1]).toBeCloseTo(1);
    });

    it.each([
      ['to right', 1, 0],
      ['to top', 0, -1],
      ['to top left', -Math.SQRT1_2, -Math.SQRT1_2],
      ['90deg', 1, 0],
      ['0.5turn', 0, 1],
      ['-90deg', -1, 0],
    ])('reads the direction %s', (config, x, y) => {
      const [dx, dy] = direction(
        parse(`linear-gradient(${config}, red, blue)`),
      );

      expect(dx).toBeCloseTo(x);
      expect(dy).toBeCloseTo(y);
    });
  });

  describe('stops', () => {
    it('spreads stops without a position evenly', () => {
      expect(offsets(parse('linear-gradient(red, lime, blue)'))).toEqual([
        0, 0.5, 1,
      ]);
      expect(
        offsets(parse('linear-gradient(red 20%, lime, white, blue 80%)')),
      ).toEqual([0.2, 0.4, 0.6000000000000001, 0.8]);
    });

    it('keeps the positions in order', () => {
      expect(offsets(parse('linear-gradient(red 50%, blue 20%)'))).toEqual([
        0.5, 0.5,
      ]);
    });

    it('reads a stop with two positions as two stops', () => {
      const gradient = parse('linear-gradient(red 10% 30%, blue)');

      expect(offsets(gradient)).toEqual([0.1, 0.3, 1]);
      expect(colors(gradient)).toEqual(['#ff0000', '#ff0000', '#0000ff']);
    });

    it('reads any color the color parser does', () => {
      const gradient = parse(
        'linear-gradient(45deg, rebeccapurple, rgb(255, 0, 0) 40%, hsl(120deg 100% 50%))',
      );

      expect(colors(gradient)).toEqual(['#663399', '#ff0000', '#00ff00']);
      expect(offsets(gradient)).toEqual([0, 0.4, 1]);
    });
  });

  it('fits a radial gradient to the corners', () => {
    const gradient = parse('radial-gradient(circle at center, red, blue)');

    expect(gradient.type()).toBe('radial');
    expect(gradient.fromRadius()).toBe(0);
    expect(gradient.toRadius()).toBe(1);
  });

  it('starts a conic gradient at the top', () => {
    const gradient = parse('conic-gradient(red, blue 90deg, lime)');

    expect(gradient.type()).toBe('conic');
    expect(gradient.angle()).toBeCloseTo(-Math.PI / 2);
    expect(offsets(gradient)).toEqual([0, 0.25, 1]);
  });

  it('turns a conic gradient by its starting angle', () => {
    expect(parse('conic-gradient(from 90deg, red, blue)').angle()).toBeCloseTo(
      0,
    );
  });

  it('lets shapes take a gradient as a string', () => {
    expect(canvasStyleParser('linear-gradient(red, blue)')).toBeInstanceOf(
      Gradient,
    );
    expect(canvasStyleParser('red')).toBeInstanceOf(Color);
  });
});
