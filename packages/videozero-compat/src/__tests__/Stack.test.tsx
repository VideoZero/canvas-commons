import {Layout, Rect, is} from '@canvas-commons/2d';
import {createRef} from '@canvas-commons/core';
import {describe, expect, it} from 'vitest';
import {HStack, VStack} from '../Stack';
import {generatorTest, mockScene2D} from './mockScene2D';

describe('HStack and VStack', () => {
  mockScene2D();

  it(
    'lay out their children in a row and in a column',
    generatorTest(function* (view) {
      const row = createRef<HStack>();
      const column = createRef<VStack>();
      const a = createRef<Rect>();
      const b = createRef<Rect>();
      view.add(
        <>
          <HStack ref={row} gap={10}>
            <Rect ref={a} size={50} />
            <Rect size={50} />
          </HStack>
          <VStack ref={column} gap={10}>
            <Rect ref={b} size={50} />
            <Rect size={50} />
          </VStack>
        </>,
      );

      expect(row().direction()).toBe('row');
      expect(column().direction()).toBe('column');
      expect(row().layoutEnabled()).toBe(true);
      expect(column().layoutEnabled()).toBe(true);
      expect(row().size()).toEqual(expect.objectContaining({x: 110, y: 50}));
      expect(column().size()).toEqual(expect.objectContaining({x: 50, y: 110}));
      expect(a().position()).toEqual(expect.objectContaining({x: -30, y: 0}));
      expect(b().position()).toEqual(expect.objectContaining({x: 0, y: -30}));
    }),
  );

  it(
    'accept layout props like gap and padding',
    generatorTest(function* (view) {
      const stack = createRef<VStack>();
      view.add(<VStack ref={stack} gap={10} padding={20} />);
      expect(stack().gap.x()).toBe(10);
      expect(stack().padding.top()).toBe(20);
    }),
  );

  it(
    'are layouts that can be told apart with is()',
    generatorTest(function* (view) {
      const row = createRef<HStack>();
      const column = createRef<VStack>();
      view.add(
        <>
          <Layout layout />
          <HStack ref={row} />
          <VStack ref={column} />
        </>,
      );

      expect(row()).toBeInstanceOf(Layout);
      expect(column()).toBeInstanceOf(Layout);
      expect(view.findAll(is(HStack))).toEqual([row()]);
      expect(view.findAll(is(VStack))).toEqual([column()]);
    }),
  );
});
