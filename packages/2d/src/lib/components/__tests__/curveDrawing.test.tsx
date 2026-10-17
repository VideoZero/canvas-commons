import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {Line} from '../Line';
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
  public commands(): string[] {
    const {path} = this.curveDrawingInfo();
    return path instanceof RecordingPath ? path.commands : [];
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
});
