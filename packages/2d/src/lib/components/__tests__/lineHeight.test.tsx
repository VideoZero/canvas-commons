import {useLogger} from '@canvas-commons/core';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {Txt, TxtProps} from '../Txt';
import {mockScene2D} from './mockScene2D';
import {mockTextContext} from './mockTextContext';
import {recordingTextContext} from './recordingTextContext';
import {add} from './sceneFixtures';

class Probe extends Txt {
  public probeDraw() {
    this.draw(recordingTextContext().context);
  }
}

function probe(props: TxtProps): Probe {
  const node = new Probe(props);
  add(node);
  return node;
}

describe('Txt.warnTightLineHeight', () => {
  mockScene2D();
  mockTextContext();

  afterEach(() => {
    Txt.warnTightLineHeight = false;
    vi.restoreAllMocks();
  });

  function warnings(...nodes: Probe[]): string[] {
    const warn = vi.spyOn(useLogger(), 'warn');
    Txt.warnTightLineHeight = true;
    nodes.forEach(node => node.probeDraw());
    return warn.mock.calls.map(([payload]) =>
      typeof payload === 'string' ? payload : payload.message,
    );
  }

  it('reads a numeric line height as pixels', () => {
    const node = probe({fontSize: 112, lineHeight: 1.25, text: 'TWO\nLINES'});
    expect(node.resolvedLineHeight()).toBe(1.25);
    expect(node.textLines().lines[1].top).toBeCloseTo(1.25);
  });

  it('warns once when lines overlap', () => {
    const node = probe({fontSize: 112, lineHeight: 20, text: 'TWO\nLINES'});
    expect(warnings(node, node)).toEqual([
      'Txt "TWO LINES" has a 20px line height at font size 112, so its lines overlap.',
    ]);
  });

  it('warns about a multiplier written as a number', () => {
    const node = probe({fontSize: 48, lineHeight: 1.2, text: 'TWO\nLINES'});
    expect(warnings(node)).toHaveLength(1);
  });

  it('stays quiet for usual line heights, one line and empty text', () => {
    expect(
      warnings(
        probe({fontSize: 112, lineHeight: '125%', text: 'TWO\nLINES'}),
        probe({fontSize: 112, lineHeight: '90%', text: 'TWO\nLINES'}),
        probe({fontSize: 112, lineHeight: 100, text: 'TWO\nLINES'}),
        probe({fontSize: 112, lineHeight: 20, text: 'ONE LINE'}),
        probe({fontSize: 112, lineHeight: 20}),
      ),
    ).toEqual([]);
  });

  it('is off by default', () => {
    const warn = vi.spyOn(useLogger(), 'warn');
    probe({fontSize: 112, lineHeight: 20, text: 'TWO\nLINES'}).probeDraw();
    expect(warn).not.toHaveBeenCalled();
  });
});
