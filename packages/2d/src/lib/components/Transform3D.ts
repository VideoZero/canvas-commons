import {
  all,
  BBox,
  DEFAULT,
  easeInOutCubic,
  PossibleVector2,
  SignalValue,
  SimpleSignal,
  threadable,
  ThreadGenerator,
  TimingFunction,
  Vector2,
  Vector2Signal,
} from '@motion-canvas/core';
import {computed, initial, nodeName, signal, vector2Signal} from '../decorators';
import {Node, NodeProps} from './Node';

export interface Transform3DProps extends NodeProps {
  /**
   * {@inheritDoc Transform3D.rotationX}
   */
  rotationX?: SignalValue<number>;
  /**
   * {@inheritDoc Transform3D.rotationY}
   */
  rotationY?: SignalValue<number>;
  /**
   * {@inheritDoc Transform3D.rotationZ}
   */
  rotationZ?: SignalValue<number>;
  /**
   * {@inheritDoc Transform3D.perspective}
   */
  perspective?: SignalValue<number>;
  /**
   * {@inheritDoc Transform3D.translateZ}
   */
  translateZ?: SignalValue<number>;
  /**
   * {@inheritDoc Transform3D.transformOrigin}
   */
  transformOrigin?: SignalValue<PossibleVector2>;
  /**
   * {@inheritDoc Transform3D.shadowOpacity}
   */
  shadowOpacity?: SignalValue<number>;
  /**
   * {@inheritDoc Transform3D.shadowBlur}
   */
  shadowBlur?: SignalValue<number>;
  /**
   * {@inheritDoc Transform3D.lightElevation}
   */
  lightElevation?: SignalValue<number>;
  /**
   * {@inheritDoc Transform3D.shadowSpread}
   */
  shadowSpread?: SignalValue<number>;
  /**
   * {@inheritDoc Transform3D.depth}
   */
  depth?: SignalValue<number>;
  /**
   * {@inheritDoc Transform3D.depthShade}
   */
  depthShade?: SignalValue<number>;
  /**
   * Headroom rendered around the content, fixed at construction.
   *
   * @remarks
   * The offscreen target is sized to the content's bounding box plus this
   * margin on every side — 3D rotation/perspective magnify the content, and
   * the margin keeps it from clipping against its own buffer. A number is
   * pixels per side. The special value `'frame'` expands the target to the
   * whole scene frame (the view size) — maximum headroom, for transforms that
   * fling content far — at the cost of a larger texture upload.
   * @defaultValue 200
   */
  renderMargin?: number | 'frame';
}

const vertexSource = `
  attribute vec2 aPosition;
  attribute vec2 aTexCoord;
  uniform mat4 uTransform;
  uniform vec2 uResolution;
  varying vec2 vTexCoord;

  void main() {
    // Center so rotation/perspective happen about the middle of the frame.
    vec2 centered = aPosition - uResolution / 2.0;
    vec4 pos = uTransform * vec4(centered, 0.0, 1.0);

    // Map to clip space. z is forced to 0: there is a single textured quad
    // and no depth buffer, and mapping a rotated z would clip the corners.
    // Perspective foreshortening still works through pos.w (the w-divide).
    gl_Position = vec4(
      pos.x / (uResolution.x / 2.0),
      (pos.y / (uResolution.y / 2.0)) * -1.0,
      0.0,
      pos.w
    );
    vTexCoord = aTexCoord;
  }
`;

const fragmentSource = `
  precision mediump float;
  uniform sampler2D uTexture;
  uniform float uDarken;
  varying vec2 vTexCoord;

  void main() {
    vec4 color = texture2D(uTexture, vTexCoord);
    // Multiply RGB only (alpha is premultiplied) so the extruded depth layers
    // can be shaded darker than the front face.
    gl_FragColor = vec4(color.rgb * uDarken, color.a);
  }
`;

interface Transform3DLocations {
  aPosition: number;
  aTexCoord: number;
  uTransform: WebGLUniformLocation | null;
  uResolution: WebGLUniformLocation | null;
  uTexture: WebGLUniformLocation | null;
  uDarken: WebGLUniformLocation | null;
}

function compileShader(
  gl: WebGLRenderingContext,
  source: string,
  type: number,
): WebGLShader {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Transform3D shader failed to compile: ${log}`);
  }
  return shader;
}

/**
 * A node that applies a real 3D (perspective) transform to its children.
 *
 * @remarks
 * The 2D canvas can only apply affine transforms — it has no perspective. So
 * `Transform3D` renders its child subtree to an offscreen texture and draws
 * that texture on a quad through a WebGL perspective transform. The children
 * stay ordinary 2D nodes; the 3D tilt is applied as a single post-process.
 *
 * All of the transform inputs are plain numeric signals, so they tween and
 * compose like any other property — there is no string parsing and nothing
 * to mistype. Internally they are folded into one 4×4 matrix and applied in a
 * single pass (chaining per-axis wrappers would re-rasterize the subtree once
 * per axis, compounding blur and cost).
 *
 * The composed transform is, in order applied to a point:
 * `perspective → rotateX → rotateY → rotateZ → translateZ`.
 *
 * @preview
 * ```tsx editor
 * import {Transform3D, Rect, makeScene2D} from '@motion-canvas/2d';
 * import {all, createRef, easeInOutCubic} from '@motion-canvas/core';
 *
 * export default makeScene2D(function* (view) {
 *   const card = createRef<Transform3D>();
 *   view.add(
 *     <Transform3D ref={card} perspective={1200}>
 *       <Rect width={500} height={320} radius={32} fill={'#3b82f6'} />
 *     </Transform3D>,
 *   );
 *   yield* all(
 *     card().rotationY(45, 1.5, easeInOutCubic),
 *     card().rotationX(-20, 1.5, easeInOutCubic),
 *   );
 *   yield* card().rotationY(-45, 2, easeInOutCubic);
 * });
 * ```
 */
@nodeName('Transform3D')
export class Transform3D extends Node {
  /**
   * Rotation around the horizontal (X) axis, in degrees. Tips the content
   * forward/back.
   */
  @initial(0)
  @signal()
  public declare readonly rotationX: SimpleSignal<number, this>;

  /**
   * Rotation around the vertical (Y) axis, in degrees. Turns the content
   * left/right like a door.
   */
  @initial(0)
  @signal()
  public declare readonly rotationY: SimpleSignal<number, this>;

  /**
   * Rotation around the depth (Z) axis, in degrees. An in-plane spin.
   */
  @initial(0)
  @signal()
  public declare readonly rotationZ: SimpleSignal<number, this>;

  /**
   * The perspective (camera) distance in pixels.
   *
   * @remarks
   * Equivalent to CSS `perspective()`. Larger values flatten the perspective
   * (subtle, professional tilts); smaller values exaggerate it. `0` disables
   * perspective entirely (an orthographic / parallel projection).
   */
  @initial(0)
  @signal()
  public declare readonly perspective: SimpleSignal<number, this>;

  /**
   * Displacement along the depth (Z) axis, in pixels. Positive moves the
   * content toward the camera (larger under perspective), negative away.
   */
  @initial(0)
  @signal()
  public declare readonly translateZ: SimpleSignal<number, this>;

  /**
   * The pivot that rotation and depth happen about, as a pixel offset from
   * the content center.
   *
   * @remarks
   * `[0, 0]` (the default) pivots about the center — the content spins in
   * place. Offsetting toward an edge hinges the transform there: on a
   * 740px-wide card, `[-370, 0]` swings `rotationY` open like a door from the
   * left edge, and `[0, -240]` flips `rotationX` from the top edge like a lid.
   *
   * The pivot is relative to the element's centre. It's a pixel offset (not a
   * CSS-style percentage) so it's independent of how the element is sized —
   * pass half the content's width/height to reach an edge. Perspective is
   * applied outside the pivot, so the camera stays fixed and only the content
   * swings.
   */
  @initial(0)
  @vector2Signal('transformOrigin')
  public declare readonly transformOrigin: Vector2Signal<this>;

  /**
   * Opacity of the cast shadow. `0` (the default) draws no shadow; raise it to
   * drop a soft silhouette below the element. Tweenable, so the shadow can
   * fade in with the motion.
   */
  @initial(0)
  @signal()
  public declare readonly shadowOpacity: SimpleSignal<number, this>;

  /**
   * Blur radius of the cast shadow, in pixels. Larger = softer / higher-float.
   */
  @initial(12)
  @signal()
  public declare readonly shadowBlur: SimpleSignal<number, this>;

  /**
   * How far above the frame's top edge the (point) light sits, in pixels.
   *
   * @remarks
   * The shadow is cast by a single light fired top-down from above the frame —
   * the silhouette is projected away from this point onto a back-plane, so it
   * falls BELOW the element and grows with distance instead of sitting flat
   * behind it. Higher values place the light further up the frame, lengthening
   * the cast.
   */
  @initial(250)
  @signal()
  public declare readonly lightElevation: SimpleSignal<number, this>;

  /**
   * How much larger than the element the cast shadow grows (the umbra spread
   * of the point light). `0` keeps it the element's size; `0.05` (default)
   * enlarges it ~5%. Works together with {@link lightElevation}.
   */
  @initial(0.05)
  @signal()
  public declare readonly shadowSpread: SimpleSignal<number, this>;

  /**
   * Extruded thickness in pixels — turns the flat card into a solid slab.
   *
   * @remarks
   * `0` (the default) is a flat sheet. With `depth > 0` the content is drawn as
   * a stack of copies stepping back along the card's own normal, so a tilt
   * reveals a shaded edge — the "card has thickness" look. It's cheap: the
   * single texture upload is reused for every layer. Best with opaque content
   * (transparent content shows the stacked layers).
   */
  @initial(0)
  @signal()
  public declare readonly depth: SimpleSignal<number, this>;

  /**
   * How dark the back of the extruded slab gets, 0–1. `0` leaves the sides the
   * same brightness as the face; `0.5` (default) fades the far edge to half,
   * giving the slab its sense of volume.
   */
  @initial(0.5)
  @signal()
  public declare readonly depthShade: SimpleSignal<number, this>;

  private readonly headroom: number | 'frame';
  private bufferCanvas: HTMLCanvasElement | null = null;
  private bufferContext: CanvasRenderingContext2D | null = null;
  private glCanvas: HTMLCanvasElement | null = null;
  private gl: WebGLRenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private locations: Transform3DLocations | null = null;
  // GL resources are created once and reused; only the texture pixels are
  // re-uploaded each frame.
  private positionBuffer: WebGLBuffer | null = null;
  private texCoordBuffer: WebGLBuffer | null = null;
  private texture: WebGLTexture | null = null;
  // Current offscreen target size; the canvases are resized (context reused)
  // when the element's size changes.
  private bufW = 0;
  private bufH = 0;

  public constructor(props?: Transform3DProps) {
    const {renderMargin, ...rest} = props ?? {};
    super(rest);
    this.headroom = renderMargin ?? 200;
  }

  private initGL(width: number, height: number): void {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const gl = canvas.getContext('webgl', {
      premultipliedAlpha: true,
      antialias: true,
    })!;
    this.glCanvas = canvas;
    this.gl = gl;

    const vs = compileShader(gl, vertexSource, gl.VERTEX_SHADER);
    const fs = compileShader(gl, fragmentSource, gl.FRAGMENT_SHADER);
    const program = gl.createProgram()!;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(
        `Transform3D program failed to link: ${gl.getProgramInfoLog(program)}`,
      );
    }
    this.program = program;
    this.locations = {
      aPosition: gl.getAttribLocation(program, 'aPosition'),
      aTexCoord: gl.getAttribLocation(program, 'aTexCoord'),
      uTransform: gl.getUniformLocation(program, 'uTransform'),
      uResolution: gl.getUniformLocation(program, 'uResolution'),
      uTexture: gl.getUniformLocation(program, 'uTexture'),
      uDarken: gl.getUniformLocation(program, 'uDarken'),
    };

    // Full-screen quad in pixel coordinates — refilled if the size changes.
    this.positionBuffer = gl.createBuffer();
    this.uploadQuad(width, height);

    this.texCoordBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
    // prettier-ignore
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      0, 0,  1, 0,  0, 1,
      0, 1,  1, 0,  1, 1,
    ]), gl.STATIC_DRAW);

    this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    // The buffer canvas is straight (non-premultiplied) alpha; premultiply on
    // upload so it matches the premultipliedAlpha context and the premultiplied
    // blend below — otherwise edges fringe dark over the background.
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  }

  private uploadQuad(width: number, height: number): void {
    const gl = this.gl!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    // prettier-ignore
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      0, 0,      width, 0,    0, height,
      0, height, width, 0,    width, height,
    ]), gl.STATIC_DRAW);
  }

  // Resize the offscreen target when the element's size changes. The GL context
  // is REUSED (browsers cap the number of live contexts) — only the canvases
  // and the size-dependent quad geometry are updated.
  private resize(width: number, height: number): void {
    this.bufferCanvas!.width = width;
    this.bufferCanvas!.height = height;
    this.glCanvas!.width = width;
    this.glCanvas!.height = height;
    this.uploadQuad(width, height);
    // Resizing a canvas can reset some context state; re-assert the unpack flag.
    this.gl!.pixelStorei(this.gl!.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  }

  /**
   * Tween the pose back to neutral (flat, facing the camera).
   *
   * @remarks
   * Like {@link Camera.reset}, this tweens each pose signal to the `DEFAULT`
   * sentinel, which the engine resolves to the signal's declared initial
   * value. Only the *pose* (rotations + depth) is reset — `perspective` and
   * `transformOrigin` are treated as configuration (the lens and the hinge),
   * not part of the animated pose, so they are left untouched.
   *
   * @param duration - The duration of the tween.
   * @param timingFunction - The timing function to use for the tween.
   */
  @threadable()
  public *reset(
    duration: number,
    timingFunction: TimingFunction = easeInOutCubic,
  ): ThreadGenerator {
    yield* all(
      this.rotationX(DEFAULT, duration, timingFunction),
      this.rotationY(DEFAULT, duration, timingFunction),
      this.rotationZ(DEFAULT, duration, timingFunction),
      this.translateZ(DEFAULT, duration, timingFunction),
    );
  }

  /**
   * The raw bounding box of the children (before any 3D transform), in local
   * space. The offscreen buffer is sized from this.
   */
  @computed()
  protected contentBBox(): BBox {
    const points: Vector2[] = [];
    for (const child of this.children()) {
      const childBox = child.cacheBBox();
      const matrix = child.localToParent();
      points.push(...childBox.corners.map(p => p.transformAsPoint(matrix)));
    }
    return points.length > 0 ? BBox.fromPoints(...points) : new BBox();
  }

  /**
   * The bounds this node actually renders into: the content plus the render
   * headroom (or the whole frame for `renderMargin: 'frame'`). This must match
   * what {@link draw} composites — otherwise, when the node is cached, the
   * transformed output and shadow get clipped to the raw content size.
   */
  public override cacheBBox(): BBox {
    const content = this.contentBBox();
    if (this.headroom === 'frame') {
      const view = this.view().size();
      const w = Math.max(content.width, view.x);
      const h = Math.max(content.height, view.y);
      return new BBox(content.center.x - w / 2, content.center.y - h / 2, w, h);
    }
    return content.expand(this.headroom);
  }

  protected override draw(context: CanvasRenderingContext2D): void {
    // The offscreen target is sized to the CONTENT's bounding box plus the
    // renderMargin headroom — the node itself stays a plain Node and doesn't
    // participate in layout. `renderMargin: 'frame'` instead grows the target to
    // the whole scene frame for transforms that fling content far.
    const bbox = this.contentBBox();
    const view = this.view().size();
    const frameH = Math.max(1, Math.ceil(view.y));

    let width: number;
    let height: number;
    if (this.headroom === 'frame') {
      width = Math.max(1, Math.ceil(bbox.width), Math.ceil(view.x));
      height = Math.max(1, Math.ceil(bbox.height), Math.ceil(view.y));
    } else {
      width = Math.max(1, Math.ceil(bbox.width) + 2 * this.headroom);
      height = Math.max(1, Math.ceil(bbox.height) + 2 * this.headroom);
    }
    // Content centre in the node's local space — the buffer is centred on it so
    // rotation pivots about the content, wherever the children sit.
    const center = bbox.center;

    if (!this.gl) {
      this.bufferCanvas = document.createElement('canvas');
      this.bufferCanvas.width = width;
      this.bufferCanvas.height = height;
      this.bufferContext = this.bufferCanvas.getContext('2d')!;
      this.initGL(width, height);
      this.bufW = width;
      this.bufH = height;
    } else if (width !== this.bufW || height !== this.bufH) {
      // Content size changed (e.g. the children resized) — resize the target,
      // reusing the GL context.
      this.resize(width, height);
      this.bufW = width;
      this.bufH = height;
    }

    // Render the child subtree to the offscreen 2D buffer, with the content
    // centre mapped to the buffer centre.
    const buffer = this.bufferContext!;
    buffer.clearRect(0, 0, width, height);
    buffer.save();
    buffer.translate(width / 2 - center.x, height / 2 - center.y);
    for (const child of this.sortedChildren()) {
      child.render(buffer);
    }
    buffer.restore();

    // Build the 3D transform for a given depth offset `z` (the slab is drawn as
    // the same quad at stepped z values). Rotation + depth pivot about the
    // transform origin via the T(+P) · R · Tz · T(-P) sandwich, with perspective
    // applied OUTSIDE so the camera stays fixed and only the content swings:
    //   perspective → T(+origin) → rotX → rotY → rotZ → z → T(-origin)
    const MatrixCtor =
      (globalThis as any).DOMMatrix || (globalThis as any).WebKitCSSMatrix;
    const perspective = this.perspective();
    const origin = this.transformOrigin();
    const rotX = this.rotationX();
    const rotY = this.rotationY();
    const rotZ = this.rotationZ();
    const buildMatrix = (z: number) => {
      const m = new MatrixCtor();
      if (perspective > 0) {
        m.m34 = -1 / perspective;
      }
      m.translateSelf(origin.x, origin.y, 0); // T(+P)
      m.rotateSelf(rotX, rotY, rotZ);
      if (z !== 0) {
        m.translateSelf(0, 0, z);
      }
      m.translateSelf(-origin.x, -origin.y, 0); // T(-P)
      return m;
    };
    const tz = this.translateZ();

    const gl = this.gl!;
    const loc = this.locations!;
    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.program!);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.enableVertexAttribArray(loc.aPosition);
    gl.vertexAttribPointer(loc.aPosition, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
    gl.enableVertexAttribArray(loc.aTexCoord);
    gl.vertexAttribPointer(loc.aTexCoord, 2, gl.FLOAT, false, 0, 0);

    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      this.bufferCanvas!,
    );

    gl.uniform2f(loc.uResolution, width, height);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    const drawLayer = (m: any, darken: number) => {
      // prettier-ignore
      gl.uniformMatrix4fv(loc.uTransform, false, new Float32Array([
        m.m11, m.m12, m.m13, m.m14,
        m.m21, m.m22, m.m23, m.m24,
        m.m31, m.m32, m.m33, m.m34,
        m.m41, m.m42, m.m43, m.m44,
      ]));
      gl.uniform1f(loc.uDarken, darken);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    };

    // Extruded depth: draw the slab back-to-front, far layers darker, then the
    // front face at full brightness on top. ~1 layer per 2px of depth (capped),
    // all reusing the single texture upload above.
    const depth = this.depth();
    if (depth > 0) {
      const steps = Math.min(64, Math.max(2, Math.round(depth / 2)));
      const shade = this.depthShade();
      for (let i = steps; i >= 1; i--) {
        const f = i / steps;
        drawLayer(buildMatrix(tz - depth * f), 1 - shade * f);
      }
    }
    drawLayer(buildMatrix(tz), 1);

    // Buffer top-left in the node's local space (buffer centre = content centre).
    const dx = center.x - width / 2;
    const dy = center.y - height / 2;

    // Cast shadow from a single light fired top-down from ABOVE the frame.
    // We scale the rendered silhouette up about that light point (a point-light
    // projection onto a back-plane): because the element sits below the light,
    // scaling pushes the shadow DOWN and makes it larger the further it is from
    // the light — a real overhead cast, not a flat copy stuck behind the card.
    // `brightness(0)` keeps the silhouette's alpha + perspective shape, so the
    // tilt flows through the shadow for free.
    const shadowOpacity = this.shadowOpacity();
    if (shadowOpacity > 0) {
      const k = 1 + this.shadowSpread();
      const lightX = 0;
      const lightY = -frameH / 2 - this.lightElevation(); // above the frame's top edge
      context.save();
      context.globalAlpha = shadowOpacity;
      context.filter = `brightness(0) blur(${this.shadowBlur()}px)`;
      context.translate(lightX, lightY);
      context.scale(k, k);
      context.translate(-lightX, -lightY);
      context.drawImage(this.glCanvas!, dx, dy);
      context.restore();
    }

    context.drawImage(this.glCanvas!, dx, dy);
  }
}
