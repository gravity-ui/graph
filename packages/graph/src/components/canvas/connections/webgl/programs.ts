import { isDevelopmentBuild } from "../../../../lib/detachedWarning";
import type { TUniformType } from "../effects/types";
import type { TWebGLShape } from "../lines/types";

import { FILL_FRAGMENT, FILL_VERTEX, VERTEX, createFragmentShader } from "./shaders";

/** An effect object as WebGL shapes carry it. */
export type TShapeEffect = NonNullable<TWebGLShape["effect"]>;

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

/** A linked program and its uniforms; a location is null when the program does not read the uniform. */
type TProgram = {
  program: WebGLProgram;
  viewport: WebGLUniformLocation | null;
  camera: WebGLUniformLocation | null;
  dpr: WebGLUniformLocation | null;
  time: WebGLUniformLocation | null;
  extraWidth: WebGLUniformLocation | null;
  /** The effect's `u_<name>` uniforms by name; none for the plain and fill programs. */
  uniforms: ReadonlyMap<string, WebGLUniformLocation | null>;
  /** The effect whose values the program holds in this frame; undefined for the plain stroke. */
  effect: TShapeEffect | undefined;
};

/** What the batch backend needs from the programs: which one draws the strokes and which one the arrow fills. */
export interface IConnectionPrograms {
  /**
   * Binds the line program of the effect (the plain stroke without one, or when the effect's program is broken) with
   * this frame's uniforms and the effect's values.
   */
  use(effect?: TShapeEffect): void;
  /** Binds the fill program of closed arrows with this frame's uniforms. */
  useFill(): void;
}

/** A shader that does not compile or a program that does not link; the message is the compiler or linker log. */
export class WebGLProgramError extends Error {
  public override readonly name = "WebGLProgramError";
}

const COMPONENTS: Record<TUniformType, number> = { float: 1, vec2: 2, vec3: 3, vec4: 4 };

/** Program keys of effects already reported as broken, so each source is reported once. */
const reportedSources = new Set<string>();

/** Uniform names already reported per effect object, so each wrong value is reported once. */
const reportedValues = new WeakMap<TShapeEffect, Set<string>>();

/** Reported in every build: the author must see why the effect is not drawn. */
function reportBrokenEffect(key: string, error: unknown): void {
  if (reportedSources.has(key)) return;
  reportedSources.add(key);
  const log = error instanceof Error ? error.message : String(error);
  console.error(
    "[@gravity-ui/graph] A connection effect does not compile or link; its connections are drawn with the plain " +
      `stroke. Line numbers in the log count from the first line of the effect's fragment.\n${log}`
  );
}

/** Arrays and typed arrays: what a vector uniform can take. */
function isNumberList(value: unknown): value is ArrayLike<number> {
  return Array.isArray(value) || (ArrayBuffer.isView(value) && !(value instanceof DataView));
}

/** Whether a value has the shape of its uniform type: a number for a float, N numbers for a vecN. */
function fitsUniform(type: TUniformType, value: unknown): value is number | ArrayLike<number> {
  if (type === "float") return typeof value === "number";
  return isNumberList(value) && value.length === COMPONENTS[type];
}

function describeValue(value: unknown): string {
  return isNumberList(value) ? `[${Array.from(value).join(", ")}]` : String(value);
}

function reportWrongValue(effect: TShapeEffect, name: string, type: TUniformType, value: unknown): void {
  if (!isDevelopmentBuild()) return;
  let names = reportedValues.get(effect);
  if (!names) {
    names = new Set();
    reportedValues.set(effect, names);
  }
  if (names.has(name)) return;
  names.add(name);
  const size = COMPONENTS[type];
  console.error(
    `[@gravity-ui/graph] The connection effect uniform u_${name} is a ${type} and takes ` +
      `${size === 1 ? "a number" : `${size} numbers`}; ${describeValue(value)} is not applied.`
  );
}

function setUniform(
  gl: WebGL2RenderingContext,
  location: WebGLUniformLocation,
  value: number | ArrayLike<number>
): void {
  if (typeof value === "number") {
    gl.uniform1f(location, value);
  } else if (value.length === 2) {
    gl.uniform2f(location, value[0], value[1]);
  } else if (value.length === 3) {
    gl.uniform3f(location, value[0], value[1], value[2]);
  } else {
    gl.uniform4f(location, value[0], value[1], value[2], value[3]);
  }
}

/** A lost context compiles and links nothing and answers every status query with null: nothing is broken. */
function contextLost(): Error {
  return new Error("The WebGL context is lost");
}

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw gl.isContextLost() ? contextLost() : new Error("Cannot create a WebGL shader");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) || "shader";
    gl.deleteShader(shader);
    throw gl.isContextLost() ? contextLost() : new WebGLProgramError(log);
  }
  return shader;
}

/**
 * The connection programs: the line program of the plain stroke, a line program per effect source, compiled on its
 * first use and shared by every effect object with that source, and the fill program of closed arrows. Line programs
 * share one vertex shader. Sets the frame uniforms of a program once per frame, when it is first used; an effect's
 * values then, and again whenever another effect object of the same source is drawn with it.
 */
export class ConnectionPrograms implements IConnectionPrograms {
  private readonly vertex: WebGLShader;

  private readonly plain: TProgram;

  private readonly fill: TProgram;

  /** Line programs by effect program key; null for a source that does not compile or link. */
  private readonly effects = new Map<string, TProgram | null>();

  private frame: TFrameUniforms = { width: 1, height: 1, x: 0, y: 0, scale: 1, dpr: 1, time: 0 };

  private readonly applied = new Set<TProgram>();

  private current: TProgram | undefined;

  /**
   * Throws a `WebGLProgramError` with the compiler or linker log when a program fails, and another error when the
   * context is lost meanwhile; nothing it created stays alive then.
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

  public use(effect?: TShapeEffect): void {
    const program = effect ? this.programOf(effect) : this.plain;
    this.bind(program, program === this.plain ? undefined : effect);
  }

  public useFill(): void {
    this.bind(this.fill, undefined);
  }

  public dispose(): void {
    this.current = undefined;
    this.gl.deleteProgram(this.plain.program);
    this.gl.deleteProgram(this.fill.program);
    for (const program of this.effects.values()) if (program) this.gl.deleteProgram(program.program);
    this.effects.clear();
    this.gl.deleteShader(this.vertex);
  }

  /**
   * The effect's program, compiled on its first use; the plain program when its source is broken. While the context
   * is lost nothing compiles: the effect is neither reported nor cached, so its first use after a restore compiles it.
   */
  private programOf(effect: TShapeEffect): TProgram {
    let program = this.effects.get(effect.programKey);
    if (program === undefined) {
      try {
        const source = createFragmentShader(effect.fragment, effect.uniformDeclarations);
        program = this.link(this.vertex, source, Object.keys(effect.uniformTypes));
      } catch (error) {
        if (this.gl.isContextLost()) return this.plain;
        reportBrokenEffect(effect.programKey, error);
        program = null;
      }
      this.effects.set(effect.programKey, program);
    }
    return program ?? this.plain;
  }

  private bind(program: TProgram, effect: TShapeEffect | undefined): void {
    const gl = this.gl;
    if (this.current !== program) {
      gl.useProgram(program.program);
      this.current = program;
    }
    if (!this.applied.has(program)) {
      this.applied.add(program);
      const { width, height, x, y, scale, dpr, time } = this.frame;
      if (program.viewport) gl.uniform2f(program.viewport, width, height);
      if (program.camera) gl.uniform3f(program.camera, x, y, scale);
      if (program.dpr) gl.uniform1f(program.dpr, dpr);
      if (program.time) gl.uniform1f(program.time, time);
    } else if (program.effect === effect) {
      return;
    }
    this.applyEffect(program, effect);
  }

  /** The effect's extra width (0 without one) and its uniform values, read without subscribing to them. */
  private applyEffect(program: TProgram, effect: TShapeEffect | undefined): void {
    const gl = this.gl;
    program.effect = effect;
    if (program.extraWidth) gl.uniform1f(program.extraWidth, effect?.extraWidth ?? 0);
    if (!effect) return;
    for (const [name, location] of program.uniforms) {
      const type = effect.uniformTypes[name];
      const value: unknown = effect.uniforms[name]?.peek();
      if (!fitsUniform(type, value)) {
        reportWrongValue(effect, name, type, value);
      } else if (location) {
        setUniform(gl, location, value);
      }
    }
  }

  private link(vertex: WebGLShader, fragmentSource: string, uniformNames: readonly string[] = []): TProgram {
    const gl = this.gl;
    const fragment = compile(gl, gl.FRAGMENT_SHADER, fragmentSource);
    const program = gl.createProgram();
    if (!program) {
      gl.deleteShader(fragment);
      throw gl.isContextLost() ? contextLost() : new Error("Cannot create a WebGL program");
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
      throw gl.isContextLost() ? contextLost() : new WebGLProgramError(log);
    }
    return {
      program,
      viewport: gl.getUniformLocation(program, "graph_viewport"),
      camera: gl.getUniformLocation(program, "graph_camera"),
      dpr: gl.getUniformLocation(program, "graph_dpr"),
      time: gl.getUniformLocation(program, "graph_time"),
      extraWidth: gl.getUniformLocation(program, "graph_extraWidth"),
      uniforms: new Map(uniformNames.map((name) => [name, gl.getUniformLocation(program, `u_${name}`)])),
      effect: undefined,
    };
  }
}
