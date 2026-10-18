import {Latex} from '@canvas-commons/2d';
import {BBox} from '@canvas-commons/core';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {AnimLatex, VideoZeroFragmentPadding} from '../AnimLatex';
import {mockScene2D} from './mockScene2D';

describe('AnimLatex', () => {
  mockScene2D();

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const methods = [
    'getFragmentBBox',
    'getLocalFragmentBBox',
    'getAbsoluteFragmentBBox',
  ] as const;

  it.each(methods)('pads %s by 8 unless a padding is passed', method => {
    const box = [new BBox(0, 0, 10, 10)];
    const base = vi.spyOn(Latex.prototype, method).mockReturnValue(box);
    const tex = new AnimLatex({tex: '{{a}}x'});

    expect(tex[method]('a')).toBe(box);
    expect(base).toHaveBeenLastCalledWith('a', VideoZeroFragmentPadding);
    tex[method]('a', 0);
    expect(base).toHaveBeenLastCalledWith('a', 0);
    expect(VideoZeroFragmentPadding).toBe(8);
  });

  it('is a Latex', () => {
    expect(new AnimLatex({tex: 'x'})).toBeInstanceOf(Latex);
  });
});
