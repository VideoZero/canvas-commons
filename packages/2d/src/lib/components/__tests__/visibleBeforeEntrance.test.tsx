import {
  PlaybackManager,
  ThreadGenerator,
  all,
  threads,
  useLogger,
  waitFor,
} from '@motion-canvas/core';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {useScene2D} from '../../scenes';
import {Node} from '../Node';
import {Txt} from '../Txt';
import {mockScene2D} from './mockScene2D';

/** Run the scene like the validator does: one generator step per frame. */
function play(factory: () => ThreadGenerator) {
  const manager = (useScene2D().playback as any).playback as PlaybackManager;
  manager.frame = 0;
  for (const _ of threads(factory)) {
    manager.frame++;
  }
}

describe('Node.warnVisibleBeforeEntrance', () => {
  mockScene2D();

  const spyOnWarn = () => vi.spyOn(useLogger(), 'warn');
  let warn: ReturnType<typeof spyOnWarn>;

  beforeAll(() => {
    ((useScene2D().playback as any).playback as PlaybackManager).fps = 10;
    // split() measures characters through DOM ranges, which jsdom lacks.
    vi.spyOn(Txt.prototype, 'split').mockImplementation(function (this: Txt) {
      (this as any).isSplit = true;
      return this;
    });
  });

  beforeEach(() => {
    Node.warnVisibleBeforeEntrance = true;
    warn = spyOnWarn();
  });

  afterEach(() => {
    Node.warnVisibleBeforeEntrance = false;
    warn.mockRestore();
  });

  const view = () => useScene2D().getView();

  it('warns for a Txt entrance helper after the text was visible', () => {
    const txt = (<Txt>From sunlight to your table</Txt>) as Txt;
    play(function* () {
      view().add(txt);
      yield* waitFor(1.5);
      yield* txt.fadeUp();
      yield* txt.fadeUp();
    });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatchObject({
      message:
        'Txt "From sunlight to your…" is already visible when its fadeUp() entrance starts at 1.5s (added at 0.0s).',
      remarks:
        'Create it with <code>opacity={0}</code>, or add it to the scene right before animating it in.',
      inspect: txt.key,
    });
  });

  it('accepts text created hidden', () => {
    const txt = (<Txt opacity={0}>Hello</Txt>) as Txt;
    play(function* () {
      view().add(txt);
      yield* waitFor(1.5);
      yield* txt.typewriter();
    });
    expect(warn).not.toHaveBeenCalled();
  });

  it('accepts text added right before its entrance', () => {
    const txt = (<Txt>Hello</Txt>) as Txt;
    const group = (<Node>{txt}</Node>) as Node;
    play(function* () {
      yield* waitFor(1.5);
      view().add(group);
      yield* txt.wordByWord();
    });
    expect(warn).not.toHaveBeenCalled();
  });

  it('accepts text whose parent is hidden', () => {
    const txt = (<Txt>Hello</Txt>) as Txt;
    const group = (<Node opacity={0}>{txt}</Node>) as Node;
    play(function* () {
      view().add(group);
      yield* waitFor(1);
      yield* all(txt.scaleIn(), group.opacity(1, 0.5));
    });
    expect(warn).not.toHaveBeenCalled();
  });

  it('accepts text that was empty until its entrance', () => {
    const txt = (<Txt />) as Txt;
    play(function* () {
      view().add(txt);
      yield* waitFor(1);
      txt.text('Hello');
      yield* txt.typewriter();
    });
    expect(warn).not.toHaveBeenCalled();
  });

  it('ignores exit helpers', () => {
    const txt = (<Txt>Hello</Txt>) as Txt;
    play(function* () {
      view().add(txt);
      yield* waitFor(1.5);
      yield* txt.fadeOut();
      yield* waitFor(1);
      yield* txt.fadeUp();
    });
    expect(warn).not.toHaveBeenCalled();
  });

  it('warns for a fade-in that does nothing', () => {
    const node = (<Node />) as Node;
    play(function* () {
      view().add(node);
      yield* waitFor(1);
      yield* node.opacity(1, 0.5);
    });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatchObject({
      message:
        'Node is already visible when its opacity(1) fade-in starts at 1.0s, so the fade does nothing (added at 0.0s).',
      inspect: node.key,
    });
  });

  it('warns for a first fade-in of a visible node', () => {
    const node = (<Node opacity={0.2} />) as Node;
    play(function* () {
      view().add(node);
      yield* waitFor(1);
      yield* node.opacity(1, 0.5);
    });
    expect(warn.mock.calls[0][0].message).toBe(
      'Node is already visible when its opacity(1) fade-in starts at 1.0s (added at 0.0s).',
    );
  });

  it('ignores later and instant opacity changes', () => {
    const instant = (<Node />) as Node;
    const dimmed = (<Node />) as Node;
    play(function* () {
      view().add(instant);
      view().add(dimmed);
      yield* waitFor(1);
      yield* instant.opacity(1, 0);
      dimmed.opacity(0.3);
      yield* dimmed.opacity(0.3, 0.3);
      yield* dimmed.opacity(1, 0.3);
    });
    expect(warn).not.toHaveBeenCalled();
  });

  it('warns at most once for a highlight loop', () => {
    const items = [0, 1, 2].map(() => (<Node />) as Node);
    play(function* () {
      view().add(items);
      yield* waitFor(1);
      for (let i = 0; i < items.length; i++) {
        yield* all(...items.map((it, j) => it.opacity(j === i ? 1 : 0.3, 0.4)));
      }
      // Restore all.
      yield* all(...items.map(it => it.opacity(1, 0.3)));
    });
    // Only item 0's first highlight (1 -> 1) looks like a no-op fade.
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0].inspect).toBe(items[0].key);
  });

  it('keeps tweening opacity the same way', () => {
    const sample = (flag: boolean) => {
      Node.warnVisibleBeforeEntrance = flag;
      const node = (<Node opacity={0.2} />) as Node;
      const values: number[] = [];
      play(function* () {
        view().add(node);
        const task = node.opacity(
          0.9,
          0.5,
          v => v * v,
          (from, to, v) => from + (to - from) * Math.sqrt(v) * 0.5,
        );
        for (const _ of task) {
          values.push(node.opacity());
          yield;
        }
        values.push(node.opacity());
      });
      return values;
    };
    const on = sample(true);
    const off = sample(false);
    expect(on.length).toBeGreaterThan(3);
    expect(on).toEqual(off);
    expect(on.at(-1)).toBe(0.9);
    expect(on[2]).toBeCloseTo(0.2 + 0.7 * 0.4 * 0.5);
  });

  it('does nothing while off', () => {
    Node.warnVisibleBeforeEntrance = false;
    const attachedAt = (Node as any).attachedAt as WeakMap<Node, number>;
    const txt = (<Txt>Hello</Txt>) as Txt;
    const node = (<Node />) as Node;
    play(function* () {
      view().add(txt);
      view().add(node);
      yield* waitFor(1.5);
      yield* txt.fadeUp();
      yield* node.opacity(1, 0.5);
    });
    expect(warn).not.toHaveBeenCalled();
    expect(attachedAt.has(txt)).toBe(false);
    expect(attachedAt.has(node)).toBe(false);
  });
});
