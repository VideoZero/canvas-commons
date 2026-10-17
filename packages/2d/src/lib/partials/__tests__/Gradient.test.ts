import {BBox, Color, unwrap} from '@canvas-commons/core';
import {describe, expect, it} from 'vitest';
import {resolveCanvasStyle} from '../../utils';
import {Gradient} from '../Gradient';

function recordingContext() {
  const calls: [string, number[]][] = [];
  const gradient = {addColorStop: () => undefined};
  const record =
    (name: string) =>
    (...args: number[]) => {
      calls.push([name, args]);
      return gradient;
    };
  const context = {
    createLinearGradient: record('linear'),
    createRadialGradient: record('radial'),
    createConicGradient: record('conic'),
  } as unknown as CanvasRenderingContext2D;
  return {context, calls};
}

const STOPS = [
  {offset: 0, color: '#ff0000'},
  {offset: 1, color: '#0000ff'},
];
const BOX = new BBox(-100, -50, 200, 100);

function hex(gradient: Gradient | Color | null) {
  if (!(gradient instanceof Gradient)) throw new Error('not a gradient');
  return gradient.stops().map(stop => new Color(unwrap(stop.color)).hex());
}

describe('Gradient', () => {
  describe('relative to the painted box', () => {
    it('spans the box along its direction', () => {
      const {context, calls} = recordingContext();
      const gradient = new Gradient({
        from: [-1, 0],
        to: [1, 0],
        stops: STOPS,
        cssRelative: true,
      });

      resolveCanvasStyle(gradient, context, BOX);

      expect(calls).toEqual([['linear', [-100, 0, 100, 0]]]);
    });

    it('reaches the corners along a diagonal', () => {
      const {context, calls} = recordingContext();
      const gradient = new Gradient({
        from: [-1, -1],
        to: [1, 1],
        stops: STOPS,
        cssRelative: true,
      });

      gradient.canvasGradient(context, BOX);

      const half = 150 * Math.SQRT1_2;
      const [, [x0, y0, x1, y1]] = calls[0];
      expect(x0).toBeCloseTo(-half * Math.SQRT1_2);
      expect(y0).toBeCloseTo(-half * Math.SQRT1_2);
      expect(x1).toBeCloseTo(half * Math.SQRT1_2);
      expect(y1).toBeCloseTo(half * Math.SQRT1_2);
    });

    it('scales the radii by half the diagonal', () => {
      const {context, calls} = recordingContext();
      const gradient = new Gradient({
        type: 'radial',
        toRadius: 1,
        stops: STOPS,
        cssRelative: true,
      });

      gradient.canvasGradient(context, new BBox(0, 0, 60, 80));

      expect(calls).toEqual([['radial', [30, 40, 0, 30, 40, 50]]]);
    });

    it('keeps absolute coordinates without a box', () => {
      const {context, calls} = recordingContext();
      const gradient = new Gradient({
        from: [-1, 0],
        to: [1, 0],
        stops: STOPS,
        cssRelative: true,
      });

      gradient.canvasGradient(context);

      expect(calls).toEqual([['linear', [-1, 0, 1, 0]]]);
    });
  });

  describe('lerp', () => {
    const gradient = new Gradient({from: [0, 0], to: [10, 0], stops: STOPS});

    it('returns the ends unchanged', () => {
      const color = new Color('#00ff00');

      expect(Gradient.lerp(color, gradient, 0)).toBe(color);
      expect(Gradient.lerp(color, gradient, 1)).toBe(gradient);
    });

    it('spreads a color into a gradient', () => {
      const halfway = Gradient.lerp(new Color('#ff0000'), gradient, 0.5);

      expect(hex(halfway)[0]).toBe('#ff0000');
      expect(hex(halfway)[1]).not.toBe('#ff0000');
      expect(hex(halfway)[1]).not.toBe('#0000ff');
    });

    it('fades a gradient in from nothing', () => {
      const halfway = Gradient.lerp(null, gradient, 0.5);
      if (!(halfway instanceof Gradient)) throw new Error('not a gradient');

      const [first] = halfway.stops();
      expect(new Color(unwrap(first.color)).alpha()).toBeCloseTo(0.5);
      expect(new Color(unwrap(first.color)).hex('rgb')).toBe('#ff0000');
    });

    it('moves the geometry of matching gradients', () => {
      const other = new Gradient({from: [0, 10], to: [10, 10], stops: STOPS});

      const halfway = Gradient.lerp(gradient, other, 0.5);
      if (!(halfway instanceof Gradient)) throw new Error('not a gradient');

      expect(halfway.from().y).toBe(5);
    });

    it('switches between gradients that do not match', () => {
      const other = new Gradient({type: 'radial', stops: STOPS});

      expect(Gradient.lerp(gradient, other, 0.4)).toBe(gradient);
      expect(Gradient.lerp(gradient, other, 0.6)).toBe(other);
    });
  });
});
