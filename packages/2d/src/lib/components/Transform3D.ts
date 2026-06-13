import {
  all,
  DEFAULT,
  easeInOutCubic,
  PossibleVector2,
  SignalValue,
  SimpleSignal,
  threadable,
  ThreadGenerator,
  TimingFunction,
  Vector2Signal,
} from '@motion-canvas/core';
import {initial, nodeName, signal, vector2Signal} from '../decorators';
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
   * {@inheritDoc Transform3D.shadowOffset}
   */
  shadowOffset?: SignalValue<PossibleVector2>;
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
  varying vec2 vTexCoord;

  void main() {
    gl_FragColor = texture2D(uTexture, vTexCoord);
  }
`;

interface Transform3DLocations {
  aPosition: number;
  aTexCoord: number;
  uTransform: WebGLUniformLocation | null;
  uResolution: WebGLUniformLocation | null;
  uTexture: WebGLUniformLocation | null;
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
   * It's a pixel offset (not a CSS-style percentage) because the component
   * composites its children to a frame-sized buffer and does not measure the
   * child's bounding box — pass half the content's width/height to reach an
   * edge. Perspective is applied outside the pivot, so the camera stays fixed
   * and only the content swings.
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
  @initial(24)
  @signal()
  public declare readonly shadowBlur: SimpleSignal<number, this>;

  /**
   * Offset of the cast shadow from the element, in pixels.
   *
   * @remarks
   * The light is treated as coming from straight overhead, so the default
   * `[0, 40]` drops the shadow directly below the element. (When a configurable
   * light direction is added later, this is what it will drive.)
   */
  @initial([0, 40])
  @vector2Signal('shadowOffset')
  public declare readonly shadowOffset: Vector2Signal<this>;

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

  public constructor(props?: Transform3DProps) {
    super({...props});
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
    };

    // Full-screen quad in pixel coordinates — geometry never changes.
    this.positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    // prettier-ignore
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      0, 0,      width, 0,    0, height,
      0, height, width, 0,    width, height,
    ]), gl.STATIC_DRAW);

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

  protected override draw(context: CanvasRenderingContext2D): void {
    const size = this.view().size();
    const width = Math.max(1, Math.ceil(size.x));
    const height = Math.max(1, Math.ceil(size.y));

    if (!this.gl) {
      this.bufferCanvas = document.createElement('canvas');
      this.bufferCanvas.width = width;
      this.bufferCanvas.height = height;
      this.bufferContext = this.bufferCanvas.getContext('2d')!;
      this.initGL(width, height);
    }

    // Render the child subtree to the offscreen 2D buffer.
    const buffer = this.bufferContext!;
    buffer.clearRect(0, 0, width, height);
    buffer.save();
    buffer.translate(width / 2, height / 2);
    for (const child of this.sortedChildren()) {
      child.render(buffer);
    }
    buffer.restore();

    // Compose the 3D transform. Rotation + depth are pivoted about the
    // transform origin via the standard T(+P) · R · T(-P) sandwich, with
    // perspective applied OUTSIDE so the camera stays fixed and only the
    // content swings:
    //   perspective → T(+origin) → rotX → rotY → rotZ → translateZ → T(-origin)
    const MatrixCtor =
      (globalThis as any).DOMMatrix || (globalThis as any).WebKitCSSMatrix;
    const matrix = new MatrixCtor();
    const perspective = this.perspective();
    if (perspective > 0) {
      matrix.m34 = -1 / perspective;
    }
    const origin = this.transformOrigin();
    matrix.translateSelf(origin.x, origin.y, 0); // T(+P)
    matrix.rotateSelf(this.rotationX(), this.rotationY(), this.rotationZ());
    const tz = this.translateZ();
    if (tz !== 0) {
      matrix.translateSelf(0, 0, tz);
    }
    matrix.translateSelf(-origin.x, -origin.y, 0); // T(-P)

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

    // prettier-ignore
    gl.uniformMatrix4fv(loc.uTransform, false, new Float32Array([
      matrix.m11, matrix.m12, matrix.m13, matrix.m14,
      matrix.m21, matrix.m22, matrix.m23, matrix.m24,
      matrix.m31, matrix.m32, matrix.m33, matrix.m34,
      matrix.m41, matrix.m42, matrix.m43, matrix.m44,
    ]));
    gl.uniform2f(loc.uResolution, width, height);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    // Cast shadow: a dark, blurred, offset copy of the transformed element,
    // drawn UNDERNEATH it. `brightness(0)` collapses the silhouette to black
    // while keeping its alpha (and its perspective shape), so the shadow tracks
    // the tilt for free; the offset drops it below (light from straight above).
    const shadowOpacity = this.shadowOpacity();
    if (shadowOpacity > 0) {
      const shadowOffset = this.shadowOffset();
      context.save();
      context.globalAlpha = shadowOpacity;
      context.filter = `brightness(0) blur(${this.shadowBlur()}px)`;
      context.drawImage(
        this.glCanvas!,
        -width / 2 + shadowOffset.x,
        -height / 2 + shadowOffset.y,
      );
      context.restore();
    }

    context.drawImage(this.glCanvas!, -width / 2, -height / 2);
  }
}
