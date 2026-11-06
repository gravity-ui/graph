import {
  ARROW_VERTEX,
  CURVE_VERTEX,
  FRAGMENT,
  INSTANCE_FLOATS,
  createArrowTemplate,
  createCurveTemplate,
} from "./shaders";
import type { StyleTable } from "./styles";

export type TFrameParams = {
  /** Viewport size in CSS pixels. */
  width: number;
  height: number;
  dpr: number;
  /** Camera transform: screen = world * scale + (x, y), in CSS pixels. */
  x: number;
  y: number;
  scale: number;
  /** Stub length in CSS pixels, 0 to draw whole curves. */
  stubPx: number;
  /** Whether arrows of not focused connections are drawn. */
  arrows: boolean;
  /** Stroke widths are in world units (scaled by the camera) instead of CSS pixels. */
  widthWorld: boolean;
  /** Draw not focused connections; when false only the overlay (selected/hovered) is drawn. */
  mainPass: boolean;
};

type TProgram = {
  program: WebGLProgram;
  uniforms: Map<string, WebGLUniformLocation | null>;
};

type TInstanceBuffer = {
  buffer: WebGLBuffer;
  capacity: number;
  count: number;
  curveVao: WebGLVertexArrayObject;
  arrowVao: WebGLVertexArrayObject;
};

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Cannot create WebGL shader");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS) && !gl.isContextLost()) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`WebGL shader compilation failed: ${log}`);
  }
  return shader;
}

function link(gl: WebGL2RenderingContext, vertex: string, fragment: string, uniformNames: string[]): TProgram {
  const program = gl.createProgram();
  if (!program) throw new Error("Cannot create WebGL program");
  const vs = compile(gl, gl.VERTEX_SHADER, vertex);
  const fs = compile(gl, gl.FRAGMENT_SHADER, fragment);
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS) && !gl.isContextLost()) {
    throw new Error(`WebGL program link failed: ${gl.getProgramInfoLog(program)}`);
  }
  const uniforms = new Map(uniformNames.map((name) => [name, gl.getUniformLocation(program, name)]));
  return { program, uniforms };
}

const COMMON_UNIFORMS = ["u_viewport", "u_camera", "u_dpr", "u_pass", "u_widthWorld", "u_styleColor", "u_styleParams"];

/**
 * Owns the WebGL resources: two programs (curves, arrows), their templates and two instance buffers
 * (all connections, and the small overlay of selected/hovered ones drawn on top).
 */
export class ConnectionsRenderer {
  private readonly curve: TProgram;

  private readonly arrow: TProgram;

  private readonly curveTemplate: WebGLBuffer;

  private readonly arrowTemplate: WebGLBuffer;

  private readonly curveVertexCount: number;

  private readonly arrowVertexCount: number;

  private readonly main: TInstanceBuffer;

  private readonly overlay: TInstanceBuffer;

  constructor(private readonly gl: WebGL2RenderingContext) {
    this.curve = link(gl, CURVE_VERTEX, FRAGMENT, [...COMMON_UNIFORMS, "u_stubPx"]);
    this.arrow = link(gl, ARROW_VERTEX, FRAGMENT, [...COMMON_UNIFORMS, "u_arrows"]);

    const curveTemplate = createCurveTemplate();
    const arrowTemplate = createArrowTemplate();
    this.curveVertexCount = curveTemplate.length / 3;
    this.arrowVertexCount = arrowTemplate.length / 3;
    this.curveTemplate = this.createStaticBuffer(curveTemplate);
    this.arrowTemplate = this.createStaticBuffer(arrowTemplate);

    this.main = this.createInstanceBuffer();
    this.overlay = this.createInstanceBuffer();
  }

  private createStaticBuffer(data: Float32Array): WebGLBuffer {
    const gl = this.gl;
    const buffer = gl.createBuffer();
    if (!buffer) throw new Error("Cannot create WebGL buffer");
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    return buffer;
  }

  private createVao(template: WebGLBuffer, instances: WebGLBuffer): WebGLVertexArrayObject {
    const gl = this.gl;
    const vao = gl.createVertexArray();
    if (!vao) throw new Error("Cannot create WebGL vertex array");
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, template);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 12, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, instances);
    const stride = INSTANCE_FLOATS * 4;
    for (let i = 0; i < 3; i++) {
      gl.enableVertexAttribArray(1 + i);
      gl.vertexAttribPointer(1 + i, 4, gl.FLOAT, false, stride, i * 16);
      gl.vertexAttribDivisor(1 + i, 1);
    }
    gl.bindVertexArray(null);
    return vao;
  }

  private createInstanceBuffer(): TInstanceBuffer {
    const buffer = this.gl.createBuffer();
    if (!buffer) throw new Error("Cannot create WebGL buffer");
    return {
      buffer,
      capacity: 0,
      count: 0,
      curveVao: this.createVao(this.curveTemplate, buffer),
      arrowVao: this.createVao(this.arrowTemplate, buffer),
    };
  }

  private upload(target: TInstanceBuffer, data: Float32Array, count: number): void {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, target.buffer);
    const floats = count * INSTANCE_FLOATS;
    if (floats > target.capacity) {
      // grow with headroom so adding a few connections does not reallocate every time
      target.capacity = Math.max(floats, Math.ceil(target.capacity * 1.5), INSTANCE_FLOATS * 64);
      gl.bufferData(gl.ARRAY_BUFFER, target.capacity * 4, gl.DYNAMIC_DRAW);
    }
    if (floats > 0) {
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, data, 0, floats);
    }
    target.count = count;
  }

  /** Replaces all instances. */
  public setInstances(data: Float32Array, count: number): void {
    this.upload(this.main, data, count);
  }

  /** Re-uploads instances [from, to) after in-place updates. */
  public updateInstances(data: Float32Array, from: number, to: number): void {
    if (to <= from) return;
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.main.buffer);
    gl.bufferSubData(
      gl.ARRAY_BUFFER,
      from * INSTANCE_FLOATS * 4,
      data,
      from * INSTANCE_FLOATS,
      (to - from) * INSTANCE_FLOATS
    );
  }

  public setOverlay(data: Float32Array, count: number): void {
    this.upload(this.overlay, data, count);
  }

  private setCommonUniforms(program: TProgram, frame: TFrameParams, styles: StyleTable, pass: number): void {
    const gl = this.gl;
    const u = program.uniforms;
    gl.uniform2f(u.get("u_viewport") ?? null, frame.width, frame.height);
    gl.uniform3f(u.get("u_camera") ?? null, frame.x, frame.y, frame.scale);
    gl.uniform1f(u.get("u_dpr") ?? null, frame.dpr);
    gl.uniform1i(u.get("u_pass") ?? null, pass);
    gl.uniform1i(u.get("u_widthWorld") ?? null, frame.widthWorld ? 1 : 0);
    gl.uniform4fv(u.get("u_styleColor") ?? null, styles.colors);
    gl.uniform4fv(u.get("u_styleParams") ?? null, styles.params);
  }

  public draw(frame: TFrameParams, styles: StyleTable): void {
    const gl = this.gl;
    const canvas = gl.canvas;
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    // pass 0: everything except the overlay; pass 1: selected/hovered connections on top
    const passes: Array<[TInstanceBuffer, number]> = [
      [this.main, 0],
      [this.overlay, 1],
    ];
    for (const [instances, pass] of passes) {
      if (instances.count === 0 || (pass === 0 && !frame.mainPass)) continue;

      gl.useProgram(this.arrow.program);
      this.setCommonUniforms(this.arrow, frame, styles, pass);
      gl.uniform1i(this.arrow.uniforms.get("u_arrows") ?? null, frame.arrows ? 1 : 0);
      gl.bindVertexArray(instances.arrowVao);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, this.arrowVertexCount, instances.count);

      gl.useProgram(this.curve.program);
      this.setCommonUniforms(this.curve, frame, styles, pass);
      gl.uniform1f(this.curve.uniforms.get("u_stubPx") ?? null, frame.stubPx);
      gl.bindVertexArray(instances.curveVao);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, this.curveVertexCount, instances.count);
    }
    gl.bindVertexArray(null);
  }

  public dispose(): void {
    const gl = this.gl;
    for (const instances of [this.main, this.overlay]) {
      gl.deleteBuffer(instances.buffer);
      gl.deleteVertexArray(instances.curveVao);
      gl.deleteVertexArray(instances.arrowVao);
    }
    gl.deleteBuffer(this.curveTemplate);
    gl.deleteBuffer(this.arrowTemplate);
    gl.deleteProgram(this.curve.program);
    gl.deleteProgram(this.arrow.program);
  }
}
