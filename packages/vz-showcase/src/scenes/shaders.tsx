import {Rect, Txt, makeScene2D} from '@canvas-commons/2d';
import {createSignal, waitFor} from '@canvas-commons/core';
import tile from '../shaders/tile.glsl';
import {Colors, Mono, Sans, caption, intro} from '../shared/ui';

export default makeScene2D(function* (view) {
  yield* intro(
    view,
    'shaders',
    'Shader textures are sampled bilinearly (no mipmaps), so shaders that scale or displace UVs stay crisp; signals accepted for shaders props.',
    'fix',
  );
  caption(
    view,
    'A shader tiling its node: texture(sourceTexture, fract(uv * tiles))',
  );
  const tiles = createSignal(1);
  view.add(
    <Rect
      y={-10}
      width={720}
      height={360}
      fill={Colors.panel}
      layout
      direction="column"
      justifyContent="center"
      alignItems="center"
      gap={12}
      shaders={{
        fragment: tile,
        uniforms: {tiles},
      }}
    >
      <Txt
        text="Crisp text?"
        fontFamily={Sans}
        fontWeight={800}
        fontSize={96}
        fill={Colors.text}
      />
      <Txt
        text="sampled through a shader"
        fontFamily={Mono}
        fontSize={30}
        fill={Colors.yellow}
      />
      <Rect width={600} height={14} fill={Colors.accent} />
    </Rect>,
  );
  view.add(
    <Txt
      y={215}
      fontFamily={Mono}
      fontSize={20}
      fill={Colors.text}
      text={() =>
        `tiles = ${tiles().toFixed(1)}  (mipmaps blur the tiles on canvas-commons main)`
      }
    />,
  );
  yield* waitFor(0.6);
  yield* tiles(5, 2.5);
  yield* waitFor(1);
  yield* tiles(1.5, 1.5);
  yield* waitFor(1);
});
