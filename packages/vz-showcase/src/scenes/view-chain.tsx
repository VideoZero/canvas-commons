import {
  Layout,
  Rect,
  RectProps,
  Txt,
  View2D,
  makeScene2D,
} from '@canvas-commons/2d';
import {createRef, waitFor} from '@canvas-commons/core';
import {Colors, Mono, Sans, caption, intro} from '../shared/ui';

/**
 * A node that presents its own view to its descendants, like the surface of
 * a 3D mesh in the three package.
 */
class Surface extends Rect {
  public readonly surface = new View2D({assetHash: '', size: [400, 300]});

  public constructor(props: RectProps) {
    super(props);
  }

  public override view(): View2D {
    return this.surface;
  }
}

export default makeScene2D(function* (view) {
  yield* intro(
    view,
    'view-chain',
    'Node.view() resolves through the parents; a node with its own view is a layout boundary the outer flex skips.',
  );
  caption(
    view,
    'Flex row: a box and a Surface that overrides view() (x=260, y=150)',
  );
  const row = createRef<Layout>();
  const surface = createRef<Surface>();
  view.add(
    <Rect
      ref={row}
      layout
      direction="row"
      gap={20}
      padding={20}
      radius={14}
      fill={Colors.panel}
      stroke={Colors.panelLight}
      lineWidth={2}
      y={-60}
    >
      <Rect width={140} height={140} radius={10} fill={Colors.accent} />
      <Surface
        ref={surface}
        x={260}
        y={150}
        width={240}
        height={120}
        radius={10}
        fill={Colors.orange}
        layout
        justifyContent="center"
        alignItems="center"
      >
        <Txt
          text="Surface"
          fontFamily={Sans}
          fontWeight={700}
          fontSize={28}
          fill={Colors.background}
        />
      </Surface>
    </Rect>,
  );
  const root = (surface() as unknown as {isLayoutRoot?: () => boolean})
    .isLayoutRoot;
  view.add(
    <Txt
      y={210}
      fontFamily={Mono}
      fontSize={20}
      fill={Colors.text}
      text={() =>
        `row width: ${row().size().x.toFixed(0)} px · surface is layout root: ${
          root ? String(root.call(surface())) : 'n/a'
        }`
      }
    />,
  );
  yield* waitFor(1);
  yield* surface().position.x(180, 1.5).to(300, 1.5);
  yield* waitFor(1.5);
});
