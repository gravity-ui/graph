import type { TConnectionEffect } from "./effects";
import { VERTEX, createFragmentShader } from "./shaders";

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

type TProgram = {
  program: WebGLProgram;
  viewport: WebGLUniformLocation | null;
  camera: WebGLUniformLocation | null;
  dpr: WebGLUniformLocation | null;
  time: WebGLUniformLocation | null;
};

/** What the batch backend needs from the programs: which one draws an effect, and whether it animates. */
export interface IEffectPrograms {
  /** Binds the program of `effect` with this frame's uniforms; the plain stroke for undefined, unknown or broken. */
  use(effect: string | undefined): void;
  isAnimated(effect: string | undefined): boolean;
}

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Cannot create a WebGL shader");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? "shader";
    gl.deleteShader(shader);
    throw new Error(log);
  }
  return shader;
}

function sameEffect(a: TConnectionEffect | undefined, b: TConnectionEffect): boolean {
  return a !== undefined && a.fragment === b.fragment && Boolean(a.animated) === Boolean(b.animated);
}

/**
 * The line programs: the plain stroke and one per registered connection effect, compiled the first time a chunk draws
 * the effect. Sets the frame uniforms of a program once per frame, when it is first used.
 */
export class ConnectionPrograms implements IEffectPrograms {
  private readonly vertex: WebGLShader;

  private readonly plain: TProgram;

  private readonly effects = new Map<string, TConnectionEffect>();

  /** null: the effect failed to compile and draws as the plain stroke. */
  private readonly compiled = new Map<string, TProgram | null>();

  /** Effect names already reported as unknown or broken, so each is reported once. */
  private readonly reported = new Set<string>();

  private frame: TFrameUniforms = { width: 1, height: 1, x: 0, y: 0, scale: 1, dpr: 1, time: 0 };

  private readonly applied = new Set<TProgram>();

  private current: TProgram | undefined;

  /** Throws when the plain program fails, like the renderer without effects. */
  constructor(private readonly gl: WebGL2RenderingContext) {
    this.vertex = compile(gl, gl.VERTEX_SHADER, VERTEX);
    this.plain = this.link(createFragmentShader());
  }

  /**
   * Replaces the registered effects; returns whether any effect was added, removed or changed, since chunks then need
   * rebuilding (grouping and animation depend on the effects).
   */
  public setEffects(effects: readonly TConnectionEffect[] | undefined): boolean {
    const next = new Map((effects ?? []).map((effect) => [effect.name, effect]));
    let changed = next.size !== this.effects.size;
    for (const [name, effect] of next) {
      if (sameEffect(this.effects.get(name), effect)) continue;
      changed = true;
      this.drop(name);
    }
    for (const name of this.effects.keys()) {
      if (!next.has(name)) {
        changed = true;
        this.drop(name);
      }
    }
    if (!changed) return false;
    this.effects.clear();
    for (const [name, effect] of next) this.effects.set(name, effect);
    return true;
  }

  /** Starts a frame: every program gets these uniforms when it is first used in the frame. */
  public beginFrame(frame: TFrameUniforms): void {
    this.frame = frame;
    this.applied.clear();
    this.current = undefined;
  }

  public use(effect: string | undefined): void {
    const program = this.resolve(effect);
    const gl = this.gl;
    if (this.current !== program) {
      gl.useProgram(program.program);
      this.current = program;
    }
    if (this.applied.has(program)) return;
    this.applied.add(program);
    const { width, height, x, y, scale, dpr, time } = this.frame;
    gl.uniform2f(program.viewport, width, height);
    gl.uniform3f(program.camera, x, y, scale);
    gl.uniform1f(program.dpr, dpr);
    gl.uniform1f(program.time, time);
  }

  public isAnimated(effect: string | undefined): boolean {
    return effect !== undefined && Boolean(this.effects.get(effect)?.animated);
  }

  public dispose(): void {
    for (const name of [...this.compiled.keys()]) this.drop(name);
    this.gl.deleteProgram(this.plain.program);
    this.gl.deleteShader(this.vertex);
  }

  private resolve(name: string | undefined): TProgram {
    if (name === undefined) return this.plain;
    const cached = this.compiled.get(name);
    if (cached !== undefined) return cached ?? this.plain;
    const effect = this.effects.get(name);
    if (!effect) {
      this.report(name, `Connection effect "${name}" is not registered in the connectionEffects setting.`);
      return this.plain;
    }
    try {
      const program = this.link(createFragmentShader(effect.fragment));
      this.compiled.set(name, program);
      return program;
    } catch (error) {
      this.compiled.set(name, null);
      const log = error instanceof Error ? error.message : String(error);
      this.report(name, `Connection effect "${name}" failed to compile; its connections are drawn without it.\n${log}`);
      return this.plain;
    }
  }

  private link(fragmentSource: string): TProgram {
    const gl = this.gl;
    const fragment = compile(gl, gl.FRAGMENT_SHADER, fragmentSource);
    const program = gl.createProgram();
    if (!program) throw new Error("Cannot create a WebGL program");
    gl.attachShader(program, this.vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    // The program keeps the compiled fragment; the vertex shader is shared by every program.
    gl.detachShader(program, fragment);
    gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(program) ?? "link";
      gl.deleteProgram(program);
      throw new Error(log);
    }
    return {
      program,
      viewport: gl.getUniformLocation(program, "u_viewport"),
      camera: gl.getUniformLocation(program, "u_camera"),
      dpr: gl.getUniformLocation(program, "u_dpr"),
      time: gl.getUniformLocation(program, "u_time"),
    };
  }

  private drop(name: string): void {
    const program = this.compiled.get(name);
    if (program) {
      if (this.current === program) this.current = undefined;
      this.gl.deleteProgram(program.program);
    }
    this.compiled.delete(name);
    this.reported.delete(name);
  }

  private report(name: string, message: string): void {
    if (this.reported.has(name)) return;
    this.reported.add(name);
    console.error(`[@gravity-ui/graph] ${message}`);
  }
}
