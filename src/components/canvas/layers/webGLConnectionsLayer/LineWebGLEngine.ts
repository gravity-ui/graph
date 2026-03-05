import REGL from "regl";

import { TPoint } from "../../../../utils/types/shapes";

export type TConnectionStyle = {
  color: [number, number, number, number];
  width: number;
  dashed: number;
};

export type TEngineSlot = {
  src: TPoint;
  tgt: TPoint;
  style: TConnectionStyle;
} | null;

const FLOATS_PER_VERT = 13;
const VERTS_PER_CONN = 6;
const STRIDE = FLOATS_PER_VERT * 4; // 52 bytes

const QUAD_IS_B: number[] = [0, 0, 1, 0, 1, 1];
const QUAD_SIDE: number[] = [-0.5, 0.5, -0.5, 0.5, 0.5, -0.5];

// Dash pattern constants (world-space units). Scale naturally with zoom.
const DASH_PERIOD = 20.0;
const DASH_LENGTH = 12.0;

// Vertex layout (offsets in bytes):
//   a_point_a:    0  (2 floats = 8 bytes)
//   a_point_b:    8  (2 floats = 8 bytes)
//   a_is_b:       16 (1 float  = 4 bytes)
//   a_side:       20 (1 float  = 4 bytes)
//   a_color:      24 (4 floats = 16 bytes)
//   a_width:      40 (1 float  = 4 bytes)
//   a_dashed:     44 (1 float  = 4 bytes)
//   a_dist_along: 48 (1 float  = 4 bytes)

// Camera uniforms (u_resolution, u_camera, u_scale) are NOT declared here —
// they are inherited from the parent cameraScope set up by WebGLConnectionsLayer.
const VERT_SHADER = `
  precision mediump float;
  attribute vec2 a_point_a, a_point_b;
  attribute float a_is_b, a_side, a_width, a_dashed, a_dist_along;
  attribute vec4 a_color;
  uniform vec2 u_resolution, u_camera;
  uniform float u_scale;
  varying vec4 v_color;
  varying float v_dist_along;
  varying float v_dashed;
  varying float v_side;
  varying float v_screen_width;
  void main() {
    vec2 sa = a_point_a * u_scale + u_camera;
    vec2 sb = a_point_b * u_scale + u_camera;
    vec2 pos = mix(sa, sb, a_is_b);
    vec2 seg = sb - sa;
    float len = length(seg);
    if (len > 0.001) {
      vec2 n = vec2(-seg.y, seg.x) / len;
      // Expand geometry to at least 1px so thin lines always cover a pixel.
      // The fragment shader compensates with thin_alpha.
      float screenWidth = a_width * u_scale;
      float renderWidth = max(screenWidth, 1.0);
      pos += n * a_side * renderWidth;
    }
    vec2 ndc = pos / u_resolution * 2.0 - 1.0;
    ndc.y = -ndc.y;
    gl_Position = vec4(ndc, 0.0, 1.0);
    v_color = a_color;
    v_dist_along = a_dist_along;
    v_dashed = a_dashed;
    v_side = a_side;
    v_screen_width = a_width * u_scale;
  }
`;

const FRAG_SHADER = `
  precision mediump float;
  uniform float u_dash_period;
  uniform float u_dash_length;
  varying vec4 v_color;
  varying float v_dist_along;
  varying float v_dashed;
  varying float v_side;
  varying float v_screen_width;
  void main() {
    if (v_dashed > 0.5 && mod(v_dist_along, u_dash_period) > u_dash_length) discard;

    // Analytical anti-aliasing.
    // Convert v_edge_dist [0..1] to screen-pixel distance from the physical edge.
    // halfWidth is the half-width of the rendered geometry in screen pixels;
    // clamped to 0.5 so sub-pixel lines still map to a sensible range.
    float v_edge_dist = 1.0 - abs(v_side) * 2.0;
    float halfWidth = max(v_screen_width * 0.5, 0.5);
    float dist_from_edge_px = v_edge_dist * halfWidth;

    // Fixed 0.5px feather: only the outermost half-pixel fades.
    // This keeps 2px and 4px lines looking their full width while still
    // anti-aliasing the edge.
    float edge_alpha = smoothstep(0.0, 0.5, dist_from_edge_px);

    // Thin-line fade: lines narrower than 1px keep their geometry at 1px
    // but fade out proportionally so they appear to thin naturally.
    float thin_alpha = min(v_screen_width, 1.0);

    gl_FragColor = vec4(v_color.rgb, v_color.a * edge_alpha * thin_alpha);
  }
`;

/**
 * LineWebGLEngine — WebGL rendering backend for straight-line connections.
 *
 * Receives a shared regl instance from WebGLConnectionsLayer (which owns the
 * GL context). Camera uniforms (u_resolution, u_camera, u_scale) are NOT
 * declared here — they are inherited from the parent cameraScope command
 * set up by the layer, so draw() takes no arguments.
 *
 * Designed to be replaceable: BezierWebGLEngine or PolylineWebGLEngine
 * implement the same interface and live inside the same cameraScope.
 */
export class LineWebGLEngine {
  private drawCmd: REGL.DrawCommand | null = null;
  private dataBuffer: REGL.Buffer | null = null;

  private vertexData: Float32Array = new Float32Array(0);
  private vertexDataCapacity = 0;

  public connectionCount = 0;

  constructor(private readonly regl: REGL.Regl) {}

  public init(): void {
    this.dataBuffer = this.regl.buffer({ usage: "dynamic", data: new Float32Array(0) });

    this.drawCmd = this.regl({
      vert: VERT_SHADER,
      frag: FRAG_SHADER,
      attributes: {
        a_point_a: { buffer: this.dataBuffer, stride: STRIDE, offset: 0, size: 2 },
        a_point_b: { buffer: this.dataBuffer, stride: STRIDE, offset: 8, size: 2 },
        a_is_b: { buffer: this.dataBuffer, stride: STRIDE, offset: 16, size: 1 },
        a_side: { buffer: this.dataBuffer, stride: STRIDE, offset: 20, size: 1 },
        a_color: { buffer: this.dataBuffer, stride: STRIDE, offset: 24, size: 4 },
        a_width: { buffer: this.dataBuffer, stride: STRIDE, offset: 40, size: 1 },
        a_dashed: { buffer: this.dataBuffer, stride: STRIDE, offset: 44, size: 1 },
        a_dist_along: { buffer: this.dataBuffer, stride: STRIDE, offset: 48, size: 1 },
      },
      uniforms: {
        u_dash_period: DASH_PERIOD,
        u_dash_length: DASH_LENGTH,
      },
      count: () => this.connectionCount * VERTS_PER_CONN,
      primitive: "triangles",
      depth: { enable: true },
      blend: { enable: true, func: { src: "src alpha", dst: "one minus src alpha" } },
    });
  }

  /**
   * Writes one connection's geometry to the CPU buffer and uploads that
   * 6-vertex slice to the GPU via subdata. O(1) — no full buffer rebuild.
   */
  public updateSlot(slotIndex: number, src: TPoint, tgt: TPoint, style: TConnectionStyle): void {
    if (!this.dataBuffer) return;
    this.writeSlot(slotIndex, src, tgt, style);
    const floatOffset = slotIndex * VERTS_PER_CONN * FLOATS_PER_VERT;
    const slotData = this.vertexData.subarray(
      floatOffset,
      floatOffset + VERTS_PER_CONN * FLOATS_PER_VERT
    );
    this.dataBuffer.subdata(slotData, floatOffset * 4);
  }

  /**
   * Rebuilds the entire CPU buffer from the provided slot array and uploads
   * it to the GPU in one call. Null entries are skipped (slots retain zeroed data).
   */
  public assignSlots(slots: ReadonlyArray<TEngineSlot>): void {
    if (!this.regl || !this.dataBuffer) return;
    this.connectionCount = slots.length;

    if (this.connectionCount > this.vertexDataCapacity) {
      this.vertexData = new Float32Array(this.connectionCount * VERTS_PER_CONN * FLOATS_PER_VERT);
      this.vertexDataCapacity = this.connectionCount;
    }

    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      if (slot) this.writeSlot(i, slot.src, slot.tgt, slot.style);
    }

    const usedFloats = this.connectionCount * VERTS_PER_CONN * FLOATS_PER_VERT;
    this.dataBuffer(this.vertexData.subarray(0, usedFloats));
  }

  /**
   * Issues a single draw call. Camera uniforms are inherited from the parent
   * cameraScope — must be called inside WebGLConnectionsLayer's cameraScope.
   */
  public draw(): void {
    if (!this.drawCmd || this.connectionCount === 0) return;
    this.drawCmd();
  }

  /** Frees GPU buffer. The regl instance itself is owned by the layer. */
  public destroy(): void {
    this.dataBuffer?.destroy();
    this.dataBuffer = null;
    this.drawCmd = null;
  }

  private writeSlot(slotIndex: number, src: TPoint, tgt: TPoint, style: TConnectionStyle): void {
    const { color, width, dashed } = style;
    const worldLen = Math.hypot(tgt.x - src.x, tgt.y - src.y);
    const floatOffset = slotIndex * VERTS_PER_CONN * FLOATS_PER_VERT;
    for (let v = 0; v < VERTS_PER_CONN; v++) {
      const i = floatOffset + v * FLOATS_PER_VERT;
      this.vertexData[i] = src.x;
      this.vertexData[i + 1] = src.y;
      this.vertexData[i + 2] = tgt.x;
      this.vertexData[i + 3] = tgt.y;
      this.vertexData[i + 4] = QUAD_IS_B[v];
      this.vertexData[i + 5] = QUAD_SIDE[v];
      this.vertexData[i + 6] = color[0];
      this.vertexData[i + 7] = color[1];
      this.vertexData[i + 8] = color[2];
      this.vertexData[i + 9] = color[3];
      this.vertexData[i + 10] = width;
      this.vertexData[i + 11] = dashed;
      this.vertexData[i + 12] = QUAD_IS_B[v] * worldLen;
    }
  }
}
