import REGL from "regl";

import { TPoint } from "../../../../utils/types/shapes";

const FLOATS_PER_VERT = 7;
const VERTS_PER_CONN = 6;
const STRIDE = FLOATS_PER_VERT * 4; // 28 bytes

const QUAD_IS_B: number[] = [0, 0, 1, 0, 1, 1];
const QUAD_SIDE: number[] = [-0.5, 0.5, -0.5, 0.5, 0.5, -0.5];

// Glow radius in world-space units.
const HOVER_RADIUS = 200.0;

// Vertex layout (offsets in bytes):
//   a_point_a: 0  (2 floats = 8 bytes)
//   a_point_b: 8  (2 floats = 8 bytes)
//   a_is_b:    16 (1 float  = 4 bytes)
//   a_side:    20 (1 float  = 4 bytes)
//   a_width:   24 (1 float  = 4 bytes)

// Camera uniforms are inherited from the parent cameraScope.
const VERT_SHADER = `
  precision mediump float;
  attribute vec2 a_point_a, a_point_b;
  attribute float a_is_b, a_side, a_width;
  uniform vec2 u_resolution, u_camera;
  uniform float u_scale;
  varying float v_t;
  varying vec2 v_pa, v_pb;
  void main() {
    vec2 sa = a_point_a * u_scale + u_camera;
    vec2 sb = a_point_b * u_scale + u_camera;
    vec2 pos = mix(sa, sb, a_is_b);
    vec2 seg = sb - sa;
    float len = length(seg);
    if (len > 0.001) {
      vec2 n = vec2(-seg.y, seg.x) / len;
      pos += n * a_side * a_width * u_scale;
    }
    vec2 ndc = pos / u_resolution * 2.0 - 1.0;
    ndc.y = -ndc.y;
    gl_Position = vec4(ndc, 0.0, 1.0);
    v_t = a_is_b;
    v_pa = a_point_a;
    v_pb = a_point_b;
  }
`;

const FRAG_SHADER = `
  precision mediump float;
  uniform vec2 u_mouse_world;
  uniform float u_hover_radius;
  uniform sampler2D u_glow_tex;
  varying float v_t;
  varying vec2 v_pa, v_pb;
  void main() {
    vec2 ab = v_pb - v_pa;
    float len2 = dot(ab, ab);
    float mouse_t = len2 > 0.001
      ? clamp(dot(u_mouse_world - v_pa, ab) / len2, 0.0, 1.0)
      : 0.0;
    float dist_world = abs(v_t - mouse_t) * sqrt(len2);
    float glow_t = max(0.0, 1.0 - dist_world / u_hover_radius);
    float glow = texture2D(u_glow_tex, vec2(glow_t, 0.5)).r;
    // Premultiplied RGBA for additive blending: src=ONE, dst=ONE
    gl_FragColor = vec4(1.0, 0.85, 0.2, 1.0) * glow * 0.8;
  }
`;

/**
 * HoverGlowEngine — second pass in the connection rendering pipeline.
 *
 * Draws a single hovered connection with an additive glow effect.
 * Runs after LineWebGLEngine inside the same cameraScope so the glow
 * is composited on top of the already-drawn base lines.
 *
 * ## Pipeline position
 *
 * ```
 * drawScene() {
 *   lineEngine.draw();  // pass 1: all connections, alpha blend
 *   glowEngine.draw();  // pass 2: hovered connection only, additive blend
 * }
 * ```
 *
 * ## Additive blending
 *
 * Uses `src=ONE, dst=ONE` so glow pixels are added to whatever is beneath —
 * this produces a physically correct light-emission effect without needing
 * a separate framebuffer or post-processing pass.
 *
 * ## Glow shape
 *
 * Defined by a 1-D luminance texture (u=0 = edge, u=1 = center). Swap the
 * formula in `createGlowTexture()` to change the falloff:
 *   Gaussian (default):  Math.exp(-Math.pow((1 - t) * 2.5, 2))
 *   Sharp spotlight:     t > 0.7 ? 1 : 0
 *   Linear fade:         t
 *   Ring:                Math.abs(t - 0.6) < 0.15 ? 1 : 0
 */
export class HoverGlowEngine {
  private drawCmd: REGL.DrawCommand | null = null;
  private dataBuffer: REGL.Buffer | null = null;
  private glowTexture: REGL.Texture2D | null = null;

  private readonly vertexData = new Float32Array(VERTS_PER_CONN * FLOATS_PER_VERT);
  private mouseWorld = { x: 0, y: 0 };
  private active = false;

  constructor(private readonly regl: REGL.Regl) {}

  public init(): void {
    this.glowTexture = this.createGlowTexture();
    this.dataBuffer = this.regl.buffer({ usage: "dynamic", data: this.vertexData });

    this.drawCmd = this.regl({
      vert: VERT_SHADER,
      frag: FRAG_SHADER,
      attributes: {
        a_point_a: { buffer: this.dataBuffer, stride: STRIDE, offset: 0, size: 2 },
        a_point_b: { buffer: this.dataBuffer, stride: STRIDE, offset: 8, size: 2 },
        a_is_b: { buffer: this.dataBuffer, stride: STRIDE, offset: 16, size: 1 },
        a_side: { buffer: this.dataBuffer, stride: STRIDE, offset: 20, size: 1 },
        a_width: { buffer: this.dataBuffer, stride: STRIDE, offset: 24, size: 1 },
      },
      uniforms: {
        u_hover_radius: HOVER_RADIUS,
        u_glow_tex: () => this.glowTexture,
        u_mouse_world: () => [this.mouseWorld.x, this.mouseWorld.y],
      },
      count: VERTS_PER_CONN,
      primitive: "triangles",
      depth: { enable: false },
      blend: {
        enable: true,
        func: { src: "one", dst: "one" }, // additive — glow lights up the line
      },
    });
  }

  /**
   * Writes the hovered connection geometry into the buffer.
   * Pass a wider width than the base line to make the glow spread further.
   */
  public setHovered(src: TPoint, tgt: TPoint, width: number): void {
    const glowWidth = width * 4;
    for (let v = 0; v < VERTS_PER_CONN; v++) {
      const i = v * FLOATS_PER_VERT;
      this.vertexData[i] = src.x;
      this.vertexData[i + 1] = src.y;
      this.vertexData[i + 2] = tgt.x;
      this.vertexData[i + 3] = tgt.y;
      this.vertexData[i + 4] = QUAD_IS_B[v];
      this.vertexData[i + 5] = QUAD_SIDE[v];
      this.vertexData[i + 6] = glowWidth;
    }
    this.dataBuffer?.subdata(this.vertexData, 0);
    this.active = true;
  }

  /** Disables the glow pass — draw() becomes a no-op until next setHovered(). */
  public clear(): void {
    this.active = false;
  }

  /** Updates the mouse world-space position for this frame. */
  public setMouseWorld(x: number, y: number): void {
    this.mouseWorld.x = x;
    this.mouseWorld.y = y;
  }

  /**
   * Issues the glow draw call. Must be called inside WebGLConnectionsLayer's
   * cameraScope, after LineWebGLEngine.draw().
   */
  public draw(): void {
    if (!this.drawCmd || !this.active) return;
    this.drawCmd();
  }

  /** Frees GPU resources. The regl instance itself is owned by the layer. */
  public destroy(): void {
    this.glowTexture?.destroy();
    this.glowTexture = null;
    this.dataBuffer?.destroy();
    this.dataBuffer = null;
    this.drawCmd = null;
  }

  private createGlowTexture(): REGL.Texture2D {
    const W = 256;
    const data = new Uint8Array(W);
    for (let i = 0; i < W; i++) {
      const t = i / (W - 1); // 0 = edge, 1 = center
      data[i] = Math.round(Math.exp(-Math.pow((1 - t) * 2.5, 2)) * 255);
    }
    return this.regl.texture({
      width: W,
      height: 1,
      data,
      format: "luminance",
      type: "uint8",
      min: "linear",
      mag: "linear",
      wrapS: "clamp",
      wrapT: "clamp",
    });
  }
}
