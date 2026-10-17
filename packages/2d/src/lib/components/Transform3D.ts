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
  useLogger,
  Vector2,
  Vector2Signal,
} from '@canvas-commons/core';
import {
  computed,
  initial,
  nodeName,
  signal,
  vector2Signal,
} from '../decorators';
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
   * {@inheritDoc Transform3D.depthSteps}
   */
  depthSteps?: SignalValue<number>;
  /**
   * {@inheritDoc Transform3D.edgeGuard}
   */
  edgeGuard?: SignalValue<number>;
  /**
   * Headroom rendered around the content, fixed at construction.
   *
   * @remarks
   * The offscreen target is sized to the bounding box of the children plus
   * this margin on every side. Rotation and perspective magnify the content,
   * and the margin keeps it from clipping against its own buffer. A number is
   * the margin in pixels. `'frame'` grows the target to at least the size of
   * the view, for transforms that fling content far, at the cost of a larger
   * texture upload.
   *
   * @defaultValue 200
   */
  renderMargin?: number | 'frame';
}

const VERTEX_SOURCE = `
attribute vec2 aPosition;
attribute vec2 aTexCoord;
uniform mat4 uTransform;
uniform vec2 uResolution;
varying vec2 vTexCoord;

void main() {
  vec2 centered = aPosition - uResolution / 2.0;
  vec4 pos = uTransform * vec4(centered, 0.0, 1.0);
  // z is forced to 0: there is no depth buffer and a rotated z would clip the
  // corners. Foreshortening still happens through the w-divide.
  gl_Position = vec4(
    pos.x / (uResolution.x / 2.0),
    -pos.y / (uResolution.y / 2.0),
    0.0,
    pos.w
  );
  vTexCoord = aTexCoord;
}
`;

const FRAGMENT_SOURCE = `
precision mediump float;
uniform sampler2D uTexture;
uniform float uDarken;
varying vec2 vTexCoord;

void main() {
  vec4 color = texture2D(uTexture, vTexCoord);
  gl_FragColor = vec4(color.rgb * uDarken, color.a);
}
`;

const MAX_AUTO_DEPTH_STEPS = 64;
const MAX_DEPTH_STEPS = 512;

interface Transform3DTarget {
  buffer: CanvasRenderingContext2D;
  gl: WebGLRenderingContext;
  program: WebGLProgram;
  positionBuffer: WebGLBuffer;
  texCoordBuffer: WebGLBuffer;
  texture: WebGLTexture;
  aPosition: number;
  aTexCoord: number;
  uTransform: WebGLUniformLocation | null;
  uResolution: WebGLUniformLocation | null;
  uDarken: WebGLUniformLocation | null;
  width: number;
  height: number;
}

/**
 * A node that applies a perspective 3D transform to its children.
 *
 * @remarks
 * The 2D canvas only supports affine transforms. `Transform3D` renders its
 * children to an offscreen texture and draws that texture on a quad through a
 * WebGL perspective transform. The children stay ordinary 2D nodes.
 *
 * All transform inputs are numeric signals folded into a single 4×4 matrix,
 * applied in the order
 * `perspective → rotationX → rotationY → rotationZ → translateZ` about the
 * {@link transformOrigin}.
 *
 * The node itself does not take part in the layout: like {@link Node}, its
 * bounds are those of its children. Place a laid-out subtree inside it to tilt
 * the whole layout.
 *
 * @preview
 * ```tsx editor
 * import {makeScene2D, Rect, Transform3D} from '@canvas-commons/2d';
 * import {all, createRef} from '@canvas-commons/core';
 *
 * export default makeScene2D(function* (view) {
 *   const card = createRef<Transform3D>();
 *   view.add(
 *     <Transform3D ref={card} perspective={1200} depth={24}>
 *       <Rect width={500} height={320} radius={32} fill={'#3b82f6'} />
 *     </Transform3D>,
 *   );
 *   yield* all(card().rotationY(45, 1.5), card().rotationX(-20, 1.5));
 *   yield* card().rotationY(-45, 2);
 *   yield* card().reset(1);
 * });
 * ```
 */
@nodeName('Transform3D')
export class Transform3D extends Node {
  /**
   * Rotation around the horizontal axis, in degrees.
   */
  @initial(0)
  @signal()
  declare public readonly rotationX: SimpleSignal<number, this>;

  /**
   * Rotation around the vertical axis, in degrees.
   */
  @initial(0)
  @signal()
  declare public readonly rotationY: SimpleSignal<number, this>;

  /**
   * Rotation around the depth axis, in degrees.
   */
  @initial(0)
  @signal()
  declare public readonly rotationZ: SimpleSignal<number, this>;

  /**
   * The distance between the camera and the content, in pixels.
   *
   * @remarks
   * Equivalent to the CSS `perspective()` function. Larger values flatten the
   * perspective, smaller values exaggerate it. `0` disables perspective.
   */
  @initial(0)
  @signal()
  declare public readonly perspective: SimpleSignal<number, this>;

  /**
   * Displacement along the depth axis, in pixels.
   *
   * @remarks
   * Positive values move the content toward the camera.
   */
  @initial(0)
  @signal()
  declare public readonly translateZ: SimpleSignal<number, this>;

  /**
   * The pivot of the rotation, as a pixel offset from the center of the
   * content.
   *
   * @remarks
   * `[0, 0]` spins the content in place. On a card that is 740 pixels wide,
   * `[-370, 0]` makes `rotationY` swing it open like a door hinged on its left
   * edge. Perspective is applied outside the pivot, so the camera stays fixed.
   */
  @initial(0)
  @vector2Signal('transformOrigin')
  declare public readonly transformOrigin: Vector2Signal<this>;

  /**
   * Opacity of the cast shadow.
   *
   * @remarks
   * `0` draws no shadow. The shadow is the silhouette of the transformed
   * content, cast by a point light above the frame onto a plane behind it, so
   * it falls below the content and keeps its perspective shape. Its softness
   * is controlled by {@link shadowBlur}.
   */
  @initial(0)
  @signal()
  declare public readonly shadowOpacity: SimpleSignal<number, this>;

  /**
   * Blur radius of the cast shadow, in pixels.
   *
   * @remarks
   * Like on any other node, it also blurs the regular drop shadow enabled
   * with `shadowColor`.
   */
  @initial(12)
  @signal()
  declare public readonly shadowBlur: SimpleSignal<number, this>;

  /**
   * How far above the top edge of the frame the light casting the shadow
   * sits, in pixels.
   *
   * @remarks
   * Higher values lengthen the cast.
   */
  @initial(250)
  @signal()
  declare public readonly lightElevation: SimpleSignal<number, this>;

  /**
   * How much larger than the content the cast shadow grows, as a fraction of
   * its size.
   */
  @initial(0.05)
  @signal()
  declare public readonly shadowSpread: SimpleSignal<number, this>;

  /**
   * Extruded thickness of the content, in pixels.
   *
   * @remarks
   * With `depth` greater than `0` the content is drawn as a stack of copies
   * stepping back along its normal, so a tilt reveals a shaded edge. The
   * single texture upload is reused for every slice. Works best with opaque
   * content, since transparent content shows the stacked slices.
   */
  @initial(0)
  @signal()
  declare public readonly depth: SimpleSignal<number, this>;

  /**
   * How dark the back of the extruded slab gets, from `0` to `1`.
   */
  @initial(0.5)
  @signal()
  declare public readonly depthShade: SimpleSignal<number, this>;

  /**
   * The number of slices the extruded slab is built from.
   *
   * @remarks
   * `0` derives the count from {@link depth}: one slice per 2 pixels, up to
   * 64. Deep slabs, or edges running diagonally to the extrusion, show a fine
   * sawtooth along the side wall with that count. Set this to about `depth`
   * for 1-pixel spacing. Clamped to 512.
   */
  @initial(0)
  @signal()
  declare public readonly depthSteps: SimpleSignal<number, this>;

  /**
   * How close to edge-on, in degrees, an extruded slab may be drawn.
   *
   * @remarks
   * The slab is a stack of flat quads, so exactly edge-on each of them
   * projects to zero width and the content vanishes. Within `edgeGuard`
   * degrees of edge-on the drawn rotation snaps to the nearer side, so a turn
   * passes through the crossing. The rotation signals keep their values.
   *
   * Only applies while {@link depth} is greater than `0`. `0` disables the
   * guard.
   */
  @initial(4)
  @signal()
  declare public readonly edgeGuard: SimpleSignal<number, this>;

  private readonly renderMargin: number | 'frame';
  private target: Transform3DTarget | null = null;
  private targetUnavailable = false;

  public constructor({renderMargin, ...props}: Transform3DProps = {}) {
    super(props);
    this.renderMargin = renderMargin ?? 200;
  }

  /**
   * Tween the pose back to facing the camera.
   *
   * @remarks
   * Resets the rotations and {@link translateZ}. `perspective` and
   * `transformOrigin` describe the camera and the hinge, so they are left
   * untouched.
   *
   * @example
   * ```ts
   * yield* card().reset(1);
   * ```
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
   * The bounding box of the children before the 3D transform, in local space.
   */
  @computed()
  protected contentBBox(): BBox {
    const points: Vector2[] = [];
    for (const child of this.children()) {
      const matrix = child.localToParent();
      points.push(
        ...child.cacheBBox().corners.map(p => p.transformAsPoint(matrix)),
      );
    }
    return points.length > 0 ? BBox.fromPoints(...points) : new BBox();
  }

  /**
   * The offscreen target the children are rendered into, in local space.
   */
  @computed()
  protected targetBBox(): BBox {
    const content = this.contentBBox();
    let width: number;
    let height: number;
    if (this.renderMargin === 'frame') {
      const view = this.view().size();
      width = Math.max(content.width, view.width);
      height = Math.max(content.height, view.height);
    } else {
      width = content.width + 2 * this.renderMargin;
      height = content.height + 2 * this.renderMargin;
    }
    width = Math.max(1, Math.ceil(width));
    height = Math.max(1, Math.ceil(height));
    return new BBox(
      content.center.x - width / 2,
      content.center.y - height / 2,
      width,
      height,
    );
  }

  @computed()
  public override cacheBBox(): BBox {
    return this.targetBBox().addSpacing(this.cachePadding());
  }

  /**
   * The number of slices drawn for the extruded slab.
   */
  protected depthSliceCount(): number {
    if (this.depth() <= 0) {
      return 0;
    }
    const requested = this.depthSteps();
    if (requested > 0) {
      return Math.min(MAX_DEPTH_STEPS, Math.max(2, Math.round(requested)));
    }
    return Math.min(
      MAX_AUTO_DEPTH_STEPS,
      Math.max(2, Math.round(this.depth() / 2)),
    );
  }

  /**
   * The rotation used for drawing, nudged out of the edge-on band.
   */
  protected guardedAngle(angle: number): number {
    const guard = this.edgeGuard();
    if (guard <= 0 || this.depth() <= 0) {
      return angle;
    }
    const toEdge = (((angle % 180) + 180) % 180) - 90;
    if (Math.abs(toEdge) >= guard) {
      return angle;
    }
    return angle + (toEdge >= 0 ? guard - toEdge : -(guard + toEdge));
  }

  /**
   * The matrix of a single slice, `z` pixels along the depth axis.
   */
  protected sliceMatrix(z: number): DOMMatrix {
    const matrix = new DOMMatrix();
    const perspective = this.perspective();
    if (perspective > 0) {
      matrix.m34 = -1 / perspective;
    }
    const origin = this.transformOrigin();
    matrix.translateSelf(origin.x, origin.y, 0);
    matrix.rotateSelf(
      this.guardedAngle(this.rotationX()),
      this.guardedAngle(this.rotationY()),
      this.rotationZ(),
    );
    if (z !== 0) {
      matrix.translateSelf(0, 0, z);
    }
    matrix.translateSelf(-origin.x, -origin.y, 0);
    return matrix;
  }

  public override dispose() {
    if (this.target) {
      const {gl, program, positionBuffer, texCoordBuffer, texture} =
        this.target;
      gl.deleteTexture(texture);
      gl.deleteBuffer(positionBuffer);
      gl.deleteBuffer(texCoordBuffer);
      gl.deleteProgram(program);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      this.target = null;
    }
    super.dispose();
  }

  protected override draw(context: CanvasRenderingContext2D) {
    const bbox = this.targetBBox();
    const target = this.prepareTarget(bbox.width, bbox.height);
    if (!target) {
      this.drawChildren(context);
      return;
    }

    const {buffer, gl} = target;
    buffer.clearRect(0, 0, bbox.width, bbox.height);
    buffer.save();
    buffer.translate(-bbox.x, -bbox.y);
    this.drawChildren(buffer);
    buffer.restore();

    gl.viewport(0, 0, bbox.width, bbox.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(target.program);

    gl.bindBuffer(gl.ARRAY_BUFFER, target.positionBuffer);
    gl.enableVertexAttribArray(target.aPosition);
    gl.vertexAttribPointer(target.aPosition, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, target.texCoordBuffer);
    gl.enableVertexAttribArray(target.aTexCoord);
    gl.vertexAttribPointer(target.aTexCoord, 2, gl.FLOAT, false, 0, 0);

    gl.bindTexture(gl.TEXTURE_2D, target.texture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      buffer.canvas,
    );
    gl.uniform2f(target.uResolution, bbox.width, bbox.height);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    const drawSlice = (z: number, darken: number) => {
      gl.uniformMatrix4fv(
        target.uTransform,
        false,
        this.sliceMatrix(z).toFloat32Array(),
      );
      gl.uniform1f(target.uDarken, darken);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    };

    const translateZ = this.translateZ();
    const steps = this.depthSliceCount();
    const depth = this.depth();
    const shade = this.depthShade();
    for (let i = steps; i >= 1; i--) {
      const fraction = i / steps;
      drawSlice(translateZ - depth * fraction, 1 - shade * fraction);
    }
    drawSlice(translateZ, 1);

    const shadowOpacity = this.shadowOpacity();
    if (shadowOpacity > 0) {
      const scale = 1 + this.shadowSpread();
      const lightY = -this.view().size().height / 2 - this.lightElevation();
      context.save();
      context.globalAlpha *= shadowOpacity;
      context.filter = `brightness(0) blur(${this.shadowBlur()}px)`;
      context.translate(0, lightY);
      context.scale(scale, scale);
      context.translate(0, -lightY);
      context.drawImage(gl.canvas, bbox.x, bbox.y);
      context.restore();
    }

    context.drawImage(gl.canvas, bbox.x, bbox.y);
  }

  private prepareTarget(
    width: number,
    height: number,
  ): Transform3DTarget | null {
    if (!this.target && !this.targetUnavailable) {
      this.target = this.createTarget();
      this.targetUnavailable = this.target === null;
    }

    const target = this.target;
    if (target && (target.width !== width || target.height !== height)) {
      target.buffer.canvas.width = width;
      target.buffer.canvas.height = height;
      target.gl.canvas.width = width;
      target.gl.canvas.height = height;
      target.width = width;
      target.height = height;
      const {gl} = target;
      gl.bindBuffer(gl.ARRAY_BUFFER, target.positionBuffer);
      // prettier-ignore
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        0, 0, width, 0, 0, height,
        0, height, width, 0, width, height,
      ]), gl.STATIC_DRAW);
      // Resizing a canvas can reset the unpack state.
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    }

    return target;
  }

  private createTarget(): Transform3DTarget | null {
    const buffer = document.createElement('canvas').getContext('2d');
    const gl = document
      .createElement('canvas')
      .getContext('webgl', {premultipliedAlpha: true, antialias: true});
    if (!buffer || !gl) {
      useLogger().warn({
        message: 'Transform3D could not create a WebGL context.',
        remarks: 'The children are drawn without the 3D transform.',
      });
      return null;
    }

    const program = createProgram(gl);
    const positionBuffer = gl.createBuffer();
    const texCoordBuffer = gl.createBuffer();
    const texture = gl.createTexture();
    if (!program || !positionBuffer || !texCoordBuffer || !texture) {
      useLogger().error('Transform3D failed to initialize WebGL resources.');
      return null;
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
    // prettier-ignore
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      0, 0, 1, 0, 0, 1,
      0, 1, 1, 0, 1, 1,
    ]), gl.STATIC_DRAW);

    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    return {
      buffer,
      gl,
      program,
      positionBuffer,
      texCoordBuffer,
      texture,
      aPosition: gl.getAttribLocation(program, 'aPosition'),
      aTexCoord: gl.getAttribLocation(program, 'aTexCoord'),
      uTransform: gl.getUniformLocation(program, 'uTransform'),
      uResolution: gl.getUniformLocation(program, 'uResolution'),
      uDarken: gl.getUniformLocation(program, 'uDarken'),
      width: 0,
      height: 0,
    };
  }
}

function createProgram(gl: WebGLRenderingContext): WebGLProgram | null {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SOURCE);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SOURCE);
  const program = gl.createProgram();
  if (!vertex || !fragment || !program) {
    return null;
  }
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    useLogger().error({
      message: 'Transform3D failed to link its shader program.',
      remarks: gl.getProgramInfoLog(program) ?? undefined,
    });
    gl.deleteProgram(program);
    return null;
  }
  return program;
}

function compileShader(
  gl: WebGLRenderingContext,
  type: GLenum,
  source: string,
): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) {
    return null;
  }
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    useLogger().error({
      message: 'Transform3D failed to compile its shader.',
      remarks: gl.getShaderInfoLog(shader) ?? undefined,
    });
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}
