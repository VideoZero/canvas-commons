import {Layout, LayoutProps, nodeName} from '@canvas-commons/2d';

/** The props of an {@link HStack}: a {@link Layout} without `layout` and `direction`. */
export interface HStackProps extends Omit<
  LayoutProps,
  'layout' | 'direction'
> {}

/** The props of a {@link VStack}: a {@link Layout} without `layout` and `direction`. */
export interface VStackProps extends Omit<
  LayoutProps,
  'layout' | 'direction'
> {}

/**
 * A {@link Layout} that lays out its children in a row.
 *
 * @remarks
 * The same as `<Layout layout direction="row">`.
 *
 * @example
 * ```tsx
 * <HStack gap={20} alignItems="center">
 *   <Rect size={100} fill="red" />
 *   <Rect size={100} fill="blue" />
 * </HStack>
 * ```
 */
@nodeName('HStack')
export class HStack extends Layout {
  public constructor(props: HStackProps) {
    super({...props, layout: true, direction: 'row'});
  }
}

/**
 * A {@link Layout} that lays out its children in a column.
 *
 * @remarks
 * The same as `<Layout layout direction="column">`.
 *
 * @example
 * ```tsx
 * <VStack gap={20} alignItems="start">
 *   <Txt text="Title" />
 *   <Txt text="Subtitle" />
 * </VStack>
 * ```
 */
@nodeName('VStack')
export class VStack extends Layout {
  public constructor(props: VStackProps) {
    super({...props, layout: true, direction: 'column'});
  }
}
