import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {Line} from '../Line';
import {Rect} from '../Rect';
import {mockScene2D} from './mockScene2D';

class RecordingPath {
  public readonly commands: string[] = [];

  public moveTo(x: number, y: number) {
    this.commands.push(`M${x},${y}`);
  }

  public lineTo(x: number, y: number) {
    this.commands.push(`L${x},${y}`);
  }

  public closePath() {
    this.commands.push('Z');
  }

  public addPath(path: RecordingPath) {
    this.commands.push(...path.commands);
  }
}

class TestLine extends Line {
  public pathData() {
    return this.getPathData();
  }

  public commands(): string[] {
    const {path} = this.curveDrawingInfo();
    return path instanceof RecordingPath ? path.commands : [];
  }
}

class TestRect extends Rect {
  public pathData() {
    return this.getPathData();
  }
}

// jsdom has no Path2D.
describe('curve drawing', () => {
  mockScene2D();
  const original = globalThis.Path2D;
  beforeAll(() => {
    globalThis.Path2D = RecordingPath as unknown as typeof Path2D;
  });
  afterAll(() => {
    globalThis.Path2D = original;
  });

  function line(start: number, end: number) {
    return new TestLine({
      points: [
        [0, 0],
        [100, 0],
      ],
      lineCap: 'round',
      start,
      end,
    });
  }

  it('draws the visible part of a curve', () => {
    expect(line(0, 0.5).commands()).toEqual(['M0,0', 'L50,0']);
  });

  it('draws nothing when no part is visible', () => {
    expect(line(0, 0).commands()).toEqual([]);
    expect(line(0.5, 0.5).commands()).toEqual([]);
    expect(line(1, 1).commands()).toEqual([]);
  });

  it('describes only the visible part as path data', () => {
    expect(line(0, 0.5).pathData()).toBe('M 0 0 L 50 0');
    expect(line(0.25, 0.75).pathData()).toBe('M 25 0 L 75 0');
  });

  it('describes only the visible part of a rect as path data', () => {
    const rect = new TestRect({size: 100});
    const full = rect.pathData();
    rect.end(0.25);

    expect(rect.pathData()).not.toBe(full);
    expect(rect.pathData()).toBe('M -50 -50 L 50 -50');
  });
});
