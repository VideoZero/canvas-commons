import {
  PlaybackManager,
  ThreadGenerator,
  all,
  threads,
  waitFor,
} from '@canvas-commons/core';
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
import {Rect} from '../Rect';
import {mockScene2D} from './mockScene2D';

class Card extends Rect {
  public *enter(): ThreadGenerator {
    this.warnVisibleBeforeEntrance('enter() entrance');
    this.opacity(0);
    yield* this.opacity(1, 0.5);
  }

  public replaceContent() {
    Node.markAttached(this);
  }

  public label() {
    return this.warningLabel();
  }
}

function playbackManager() {
  return (useScene2D().playback as unknown as {playback: PlaybackManager})
    .playback;
}

/** Run the scene like a validator does: one generator step per frame. */
function play(factory: () => ThreadGenerator) {
  const manager = playbackManager();
  manager.frame = 0;
  const tasks = threads(factory);
  while (!tasks.next().done) {
    manager.frame++;
  }
}

describe('Node.warnVisibleBeforeEntrance', () => {
  mockScene2D();

  let warn: ReturnType<typeof vi.spyOn>;

  beforeAll(() => {
    playbackManager().fps = 10;
  });

  beforeEach(() => {
    Node.warnVisibleBeforeEntrance = true;
    warn = vi.spyOn(console, 'warn').mockReturnValue(undefined);
  });

  afterEach(() => {
    Node.warnVisibleBeforeEntrance = false;
    warn.mockRestore();
  });

  const view = () => useScene2D().getView();

  it('warns for an entrance after the node was visible', () => {
    const card = (<Card />) as Card;
    play(function* () {
      view().add(card);
      yield* waitFor(1.5);
      yield* card.enter();
      yield* card.enter();
    });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatchObject({
      message:
        'Card is already visible when its enter() entrance starts at 1.5s (added at 0.0s).',
      remarks:
        'Create it with <code>opacity={0}</code>, or add it to the scene right before animating it in.',
      inspect: card.key,
    });
  });

  it('accepts a node created hidden', () => {
    const card = (<Card opacity={0} />) as Card;
    play(function* () {
      view().add(card);
      yield* waitFor(1.5);
      yield* card.enter();
    });
    expect(warn).not.toHaveBeenCalled();
  });

  it('accepts a node added right before its entrance', () => {
    const card = (<Card />) as Card;
    const group = (<Node>{card}</Node>) as Node;
    play(function* () {
      yield* waitFor(1.5);
      view().add(group);
      yield* card.enter();
    });
    expect(warn).not.toHaveBeenCalled();
  });

  it('accepts a node whose parent is hidden', () => {
    const card = (<Card />) as Card;
    const group = (<Node opacity={0}>{card}</Node>) as Node;
    play(function* () {
      view().add(group);
      yield* waitFor(1);
      yield* all(card.enter(), group.opacity(1, 0.5));
    });
    expect(warn).not.toHaveBeenCalled();
  });

  it('accepts an entrance right after the content was replaced', () => {
    const card = (<Card />) as Card;
    play(function* () {
      view().add(card);
      yield* waitFor(1);
      card.replaceContent();
      yield* card.enter();
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

  it('ignores fades from a deliberate dim', () => {
    const node = (<Node opacity={0.2} />) as Node;
    play(function* () {
      view().add(node);
      yield* waitFor(1);
      yield* node.opacity(1, 0.5);
    });
    expect(warn).not.toHaveBeenCalled();
  });

  it('ignores fades of a node hidden by scale', () => {
    const node = (<Node scale={0} />) as Node;
    play(function* () {
      view().add(node);
      yield* waitFor(1);
      yield* all(node.scale(1, 0.4), node.opacity(1, 0.4));
    });
    expect(warn).not.toHaveBeenCalled();
  });

  it('labels nodes by their own node name or class name', () => {
    class Img2 extends Card {}
    class Transform3D extends Card {}
    expect(new Img2({}).label()).toBe('Img');
    expect(new Transform3D({}).label()).toBe('Transform3D');
    expect(new Card({}).label()).toBe('Card');
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
        yield* all(
          ...items.map((item, j) => item.opacity(j === i ? 1 : 0.3, 0.4)),
        );
      }
      yield* all(...items.map(item => item.opacity(1, 0.3)));
    });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatchObject({inspect: items[0].key});
  });

  it('keeps tweening opacity the same way', () => {
    const sample = (enabled: boolean) => {
      Node.warnVisibleBeforeEntrance = enabled;
      const node = (<Node opacity={0.2} />) as Node;
      const values: number[] = [];
      play(function* () {
        view().add(node);
        const task = node.opacity(
          0.9,
          0.5,
          value => value * value,
          (from, to, value) => from + (to - from) * Math.sqrt(value) * 0.5,
        );
        while (!task.next().done) {
          values.push(node.opacity());
          yield;
        }
        values.push(node.opacity());
      });
      return values;
    };
    const enabled = sample(true);
    const disabled = sample(false);
    expect(enabled.length).toBeGreaterThan(3);
    expect(enabled).toEqual(disabled);
    expect(enabled.at(-1)).toBe(0.9);
    expect(enabled[2]).toBeCloseTo(0.2 + 0.7 * 0.4 * 0.5);
  });

  it('does nothing while off', () => {
    Node.warnVisibleBeforeEntrance = false;
    const card = (<Card />) as Card;
    const node = (<Node />) as Node;
    play(function* () {
      view().add(card);
      view().add(node);
      yield* waitFor(1.5);
      yield* card.enter();
      yield* node.opacity(1, 0.5);
    });
    Node.warnVisibleBeforeEntrance = true;
    play(function* () {
      yield* card.enter();
    });
    expect(warn).not.toHaveBeenCalled();
  });
});
