import { FILL_FRAGMENT, FILL_VERTEX, VERTEX, createFragmentShader } from "./shaders";

/** Per-frame values every program reads. */
export type TFrameUniforms = {
  /** CSS pixels. */
  width: number;
  height: number;
  x: number;
  y: number;
  scale: number;
  dpr: number;
  /** Seconds since the renderer started. */
  time: number;
};

/** A linked program and its internal uniforms; a location is null when the program does not read the uniform. */
type TProgram = {
  program: WebGLProgram;
  viewport: WebGLUniformLocation | null;
  camera: WebGLUniformLocation | null;
  dpr: WebGLUniformLocation | null;
  time: WebGLUniformLocation | null;
  extraWidth: WebGLUniformLocation | null;
  /** CSS pixels the program draws outside each side of the stroke. */
  extraWidthValue: number;
};

/** What the batch backend needs from the programs: which one draws the strokes and which one the arrow fills. */
export interface IConnectionPrograms {
  /** Binds the line program with this frame's uniforms. */
  use(): void;
  /** Binds the fill program of closed arrows with this frame's uniforms. */
  useFill(): void;
}

/** A shader that does not compile or a program that does not link; the message is the compiler or linker log. */
export class WebGLProgramError extends Error {
  public override readonly name = "WebGLProgramError";
}

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Cannot create a WebGL shader");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) || "shader";
    gl.deleteShader(shader);
    throw new WebGLProgramError(log);
  }
  return shader;
}

/**
 * The connection programs: the line program of the plain stroke, which shares its vertex shader with every other line
 * program, and the fill program of closed arrows. Sets the frame uniforms of a program once per frame, when it is
 * first used.
 */
export class ConnectionPrograms implements IConnectionPrograms {
  private readonly vertex: WebGLShader;

  private readonly plain: TProgram;

  private readonly fill: TProgram;

  private frame: TFrameUniforms = { width: 1, height: 1, x: 0, y: 0, scale: 1, dpr: 1, time: 0 };

  private readonly applied = new Set<TProgram>();

  private current: TProgram | undefined;

  /**
   * Throws a `WebGLProgramError` with the compiler or linker log when a program fails; nothing it created stays alive
   * then.
   */
  constructor(private readonly gl: WebGL2RenderingContext) {
    this.vertex = compile(gl, gl.VERTEX_SHADER, VERTEX);
    try {
      this.plain = this.link(this.vertex, createFragmentShader());
    } catch (error) {
      gl.deleteShader(this.vertex);
      throw error;
    }
    try {
      const fillVertex = compile(gl, gl.VERTEX_SHADER, FILL_VERTEX);
      try {
        this.fill = this.link(fillVertex, FILL_FRAGMENT);
      } finally {
        // The program keeps the compiled shader.
        gl.deleteShader(fillVertex);
      }
    } catch (error) {
      gl.deleteProgram(this.plain.program);
      gl.deleteShader(this.vertex);
      throw error;
    }
  }

  /** Starts a frame: every program gets these uniforms when it is first used in the frame. */
  public beginFrame(frame: TFrameUniforms): void {
    this.frame = frame;
    this.applied.clear();
    this.current = undefined;
  }

  public use(): void {
    this.bind(this.plain);
  }

  public useFill(): void {
    this.bind(this.fill);
  }

  public dispose(): void {
    this.current = undefined;
    this.gl.deleteProgram(this.plain.program);
    this.gl.deleteProgram(this.fill.program);
    this.gl.deleteShader(this.vertex);
  }

  private bind(program: TProgram): void {
    const gl = this.gl;
    if (this.current !== program) {
      gl.useProgram(program.program);
      this.current = program;
    }
    if (this.applied.has(program)) return;
    this.applied.add(program);
    const { width, height, x, y, scale, dpr, time } = this.frame;
    if (program.viewport) gl.uniform2f(program.viewport, width, height);
    if (program.camera) gl.uniform3f(program.camera, x, y, scale);
    if (program.dpr) gl.uniform1f(program.dpr, dpr);
    if (program.time) gl.uniform1f(program.time, time);
    if (program.extraWidth) gl.uniform1f(program.extraWidth, program.extraWidthValue);
  }

  private link(vertex: WebGLShader, fragmentSource: string): TProgram {
    const gl = this.gl;
    const fragment = compile(gl, gl.FRAGMENT_SHADER, fragmentSource);
    const program = gl.createProgram();
    if (!program) {
      gl.deleteShader(fragment);
      throw new Error("Cannot create a WebGL program");
    }
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    // The program keeps the compiled fragment; a line vertex shader is shared by every line program.
    gl.detachShader(program, fragment);
    gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(program) || "link";
      gl.deleteProgram(program);
      throw new WebGLProgramError(log);
    }
    return {
      program,
      viewport: gl.getUniformLocation(program, "graph_viewport"),
      camera: gl.getUniformLocation(program, "graph_camera"),
      dpr: gl.getUniformLocation(program, "graph_dpr"),
      time: gl.getUniformLocation(program, "graph_time"),
      extraWidth: gl.getUniformLocation(program, "graph_extraWidth"),
      extraWidthValue: 0,
    };
  }
}
