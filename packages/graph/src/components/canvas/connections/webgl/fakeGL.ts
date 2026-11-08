/**
 * Test helper (not a test file, not published): a WebGL2 context without a GPU that records what the connection
 * renderer asks of it. Objects are plain records, so tests inspect buffers, vertex arrays, programs, uniforms, uploads
 * and draw calls directly. It uses no jest globals.
 */

export type TFakeShader = {
  readonly kind: "shader";
  readonly id: number;
  readonly type: number;
  source: string;
  deleted: boolean;
};

export type TFakeProgram = {
  readonly kind: "program";
  readonly id: number;
  /** Sources of the shaders attached when the program was linked. */
  vertex?: string;
  fragment?: string;
  linked: boolean;
  deleted: boolean;
};

export type TFakeBuffer = {
  readonly kind: "buffer";
  readonly id: number;
  /** The buffer's content as floats; `bufferSubData` writes into it. */
  data: Float32Array;
  deleted: boolean;
};

export type TFakeAttribute = {
  enabled: boolean;
  buffer?: TFakeBuffer;
  size: number;
  /** Bytes. */
  stride: number;
  /** Bytes. */
  offset: number;
  divisor: number;
};

export type TFakeVertexArray = {
  readonly kind: "vertexArray";
  readonly id: number;
  readonly attributes: Map<number, TFakeAttribute>;
  deleted: boolean;
};

export type TFakeUniformLocation = { readonly kind: "uniform"; readonly program: TFakeProgram; readonly name: string };

export type TFakeUniform = { program: TFakeProgram; name: string; values: number[] };

export type TFakeUpload = {
  kind: "bufferData" | "bufferSubData";
  buffer: TFakeBuffer;
  /** Floats. */
  offset: number;
  /** Floats. */
  length: number;
};

export type TFakeDraw = {
  kind: "drawArrays" | "drawArraysInstanced";
  mode: number;
  first: number;
  count: number;
  /** 1 for `drawArrays`. */
  instances: number;
  program: TFakeProgram | undefined;
  vertexArray: TFakeVertexArray | undefined;
};

export type TFakeGLOptions = {
  /** A compiler log makes the shader fail to compile. */
  compileError?: (source: string, type: number) => string | undefined;
  /** A linker log makes the program fail to link. */
  linkError?: (vertex: string, fragment: string) => string | undefined;
  /**
   * Uniforms the "compiler" drops as unused: `getUniformLocation` returns null for them, as a real context does for an
   * inactive uniform. Every other declared uniform is active.
   */
  inactiveUniforms?: readonly string[];
};

export type TFakeGL = {
  gl: WebGL2RenderingContext;
  /** The canvas the context belongs to, when `installFakeWebGL2` created it. */
  canvas?: HTMLCanvasElement;
  shaders: TFakeShader[];
  programs: TFakeProgram[];
  buffers: TFakeBuffer[];
  vertexArrays: TFakeVertexArray[];
  /** Programs passed to `useProgram`, in call order. */
  used: Array<TFakeProgram | undefined>;
  /** Names passed to `getUniformLocation`, in call order. */
  uniformLookups: string[];
  /** Every `uniform*` call with a location, in call order. */
  uniforms: TFakeUniform[];
  uploads: TFakeUpload[];
  draws: TFakeDraw[];
  /** Every method called, by name, in call order. */
  calls: string[];
  /** Live (not deleted) objects of a kind. */
  live(kind: "buffer" | "vertexArray" | "program" | "shader"): number;
  /** Makes `isContextLost()` return true, like a lost context. */
  loseContext(): void;
};

// WebGL2 enum values.
const CONSTANTS = {
  VERTEX_SHADER: 0x8b31,
  FRAGMENT_SHADER: 0x8b30,
  COMPILE_STATUS: 0x8b81,
  LINK_STATUS: 0x8b82,
  ARRAY_BUFFER: 0x8892,
  STATIC_DRAW: 0x88e4,
  DYNAMIC_DRAW: 0x88e8,
  FLOAT: 0x1406,
  TRIANGLES: 0x0004,
  TRIANGLE_STRIP: 0x0005,
  BLEND: 0x0be2,
  ONE: 1,
  ONE_MINUS_SRC_ALPHA: 0x0303,
  COLOR_BUFFER_BIT: 0x4000,
} as const;

function floatsOf(data: unknown): Float32Array {
  if (data instanceof Float32Array) return new Float32Array(data);
  if (ArrayBuffer.isView(data)) return new Float32Array(data.buffer, data.byteOffset, data.byteLength / 4).slice();
  if (typeof data === "number") return new Float32Array(data / 4);
  return new Float32Array(0);
}

/** Whether a linked program declares `uniform <type> <name>;` in one of its shaders. */
function declaresUniform(program: TFakeProgram, name: string): boolean {
  const pattern = new RegExp(`\\buniform\\s+\\w+\\s+${name}\\s*;`);
  return pattern.test(program.vertex ?? "") || pattern.test(program.fragment ?? "");
}

/**
 * A fake WebGL2 context. Shaders compile and programs link unless the options return a log; `getUniformLocation`
 * returns a location only for uniforms the program's sources declare (minus `inactiveUniforms`). Misuse a real context
 * reports as an error throws: a uniform for a program not in use, a deleted program or vertex array in a draw, a draw
 * reading past the end of a bound buffer or from an attribute without one, a deleted buffer bound or written.
 */
export function createFakeGL(options: TFakeGLOptions = {}): TFakeGL {
  let ids = 0;
  let lost = false;
  const shaders: TFakeShader[] = [];
  const programs: TFakeProgram[] = [];
  const buffers: TFakeBuffer[] = [];
  const vertexArrays: TFakeVertexArray[] = [];
  const used: Array<TFakeProgram | undefined> = [];
  const uniformLookups: string[] = [];
  const uniforms: TFakeUniform[] = [];
  const uploads: TFakeUpload[] = [];
  const draws: TFakeDraw[] = [];
  const calls: string[] = [];
  const attached = new Map<TFakeProgram, TFakeShader[]>();
  const shaderLogs = new Map<TFakeShader, string>();
  const programLogs = new Map<TFakeProgram, string>();
  let arrayBuffer: TFakeBuffer | undefined;
  let vertexArray: TFakeVertexArray | undefined;
  let program: TFakeProgram | undefined;
  // Attribute state outside any vertex array (the default vertex array).
  const defaultVertexArray: TFakeVertexArray = { kind: "vertexArray", id: 0, attributes: new Map(), deleted: false };

  const attribute = (location: number): TFakeAttribute => {
    const target = vertexArray ?? defaultVertexArray;
    let state = target.attributes.get(location);
    if (!state) {
      state = { enabled: false, size: 4, stride: 0, offset: 0, divisor: 0 };
      target.attributes.set(location, state);
    }
    return state;
  };

  /** Draws read the program in use and the bound vertex array: neither, nor a buffer they read, may be deleted. */
  const checkDraw = (first: number, count: number, instances: number): void => {
    if (!program || program.deleted) throw new Error("fakeGL: draw without a live program");
    if (vertexArray?.deleted) throw new Error("fakeGL: draw with a deleted vertex array");
    if (count <= 0 || instances <= 0) return;
    for (const [location, state] of (vertexArray ?? defaultVertexArray).attributes) {
      if (!state.enabled) continue;
      if (!state.buffer || state.buffer.deleted)
        throw new Error(`fakeGL: draw reads attribute ${location} without a buffer`);
      // The last element the draw reads, like the INVALID_OPERATION bounds check of a real context.
      const last = state.divisor ? Math.ceil(instances / state.divisor) - 1 : first + count - 1;
      const stride = state.stride || state.size * 4;
      const end = last * stride + state.offset + state.size * 4;
      const bytes = state.buffer.data.length * 4;
      if (end > bytes) {
        throw new Error(
          `fakeGL: INVALID_OPERATION, attribute ${location} reads ${end} bytes of a ${bytes}-byte buffer`
        );
      }
    }
  };

  const uniform =
    (name: string) =>
    (location: TFakeUniformLocation | null, ...values: unknown[]): void => {
      calls.push(name);
      if (!location) return;
      // A real context sets uniforms of the program in use only.
      if (location.program !== program) throw new Error(`fakeGL: ${name} for a program that is not in use`);
      const flat = values.flatMap((value) => (ArrayBuffer.isView(value) ? Array.from(value as Float32Array) : value));
      uniforms.push({ program: location.program, name: location.name, values: flat as number[] });
    };

  const methods = {
    isContextLost: (): boolean => lost,
    getExtension: (name: string): { loseContext(): void } | null => {
      if (name !== "WEBGL_lose_context") return null;
      return {
        loseContext: (): void => {
          lost = true;
        },
      };
    },

    createShader: (type: number): TFakeShader => {
      const shader: TFakeShader = { kind: "shader", id: ++ids, type, source: "", deleted: false };
      shaders.push(shader);
      return shader;
    },
    shaderSource: (shader: TFakeShader, source: string): void => {
      shader.source = source;
    },
    compileShader: (shader: TFakeShader): void => {
      const log = options.compileError?.(shader.source, shader.type);
      if (log === undefined) shaderLogs.delete(shader);
      else shaderLogs.set(shader, log);
    },
    getShaderParameter: (shader: TFakeShader, parameter: number): boolean =>
      parameter === CONSTANTS.COMPILE_STATUS ? !shaderLogs.has(shader) : true,
    getShaderInfoLog: (shader: TFakeShader): string => shaderLogs.get(shader) ?? "",
    deleteShader: (shader: TFakeShader | null): void => {
      if (shader) shader.deleted = true;
    },

    createProgram: (): TFakeProgram => {
      const created: TFakeProgram = { kind: "program", id: ++ids, linked: false, deleted: false };
      programs.push(created);
      attached.set(created, []);
      return created;
    },
    attachShader: (target: TFakeProgram, shader: TFakeShader): void => {
      attached.get(target)?.push(shader);
    },
    detachShader: (target: TFakeProgram, shader: TFakeShader): void => {
      const list = attached.get(target) ?? [];
      attached.set(
        target,
        list.filter((item) => item !== shader)
      );
    },
    linkProgram: (target: TFakeProgram): void => {
      const list = attached.get(target) ?? [];
      target.vertex = list.find((shader) => shader.type === CONSTANTS.VERTEX_SHADER)?.source;
      target.fragment = list.find((shader) => shader.type === CONSTANTS.FRAGMENT_SHADER)?.source;
      const log = options.linkError?.(target.vertex ?? "", target.fragment ?? "");
      target.linked = log === undefined;
      if (log === undefined) programLogs.delete(target);
      else programLogs.set(target, log);
    },
    getProgramParameter: (target: TFakeProgram, parameter: number): boolean =>
      parameter === CONSTANTS.LINK_STATUS ? target.linked : true,
    getProgramInfoLog: (target: TFakeProgram): string => programLogs.get(target) ?? "",
    deleteProgram: (target: TFakeProgram | null): void => {
      if (target) target.deleted = true;
    },
    useProgram: (target: TFakeProgram | null): void => {
      if (target?.deleted || (target && !target.linked))
        throw new Error("fakeGL: useProgram of a deleted or unlinked program");
      program = target ?? undefined;
      used.push(program);
    },
    getUniformLocation: (target: TFakeProgram, name: string): TFakeUniformLocation | null => {
      uniformLookups.push(name);
      if (options.inactiveUniforms?.includes(name) || !declaresUniform(target, name)) return null;
      return { kind: "uniform", program: target, name };
    },
    uniform1f: uniform("uniform1f"),
    uniform2f: uniform("uniform2f"),
    uniform3f: uniform("uniform3f"),
    uniform4f: uniform("uniform4f"),
    uniform1fv: uniform("uniform1fv"),
    uniform2fv: uniform("uniform2fv"),
    uniform3fv: uniform("uniform3fv"),
    uniform4fv: uniform("uniform4fv"),

    createBuffer: (): TFakeBuffer => {
      const buffer: TFakeBuffer = { kind: "buffer", id: ++ids, data: new Float32Array(0), deleted: false };
      buffers.push(buffer);
      return buffer;
    },
    bindBuffer: (_target: number, buffer: TFakeBuffer | null): void => {
      if (buffer?.deleted) throw new Error("fakeGL: bindBuffer of a deleted buffer");
      arrayBuffer = buffer ?? undefined;
    },
    bufferData: (_target: number, data: unknown): void => {
      if (!arrayBuffer) throw new Error("fakeGL: bufferData without a bound buffer");
      arrayBuffer.data = floatsOf(data);
      uploads.push({ kind: "bufferData", buffer: arrayBuffer, offset: 0, length: arrayBuffer.data.length });
    },
    bufferSubData: (_target: number, byteOffset: number, data: unknown): void => {
      if (!arrayBuffer) throw new Error("fakeGL: bufferSubData without a bound buffer");
      const floats = floatsOf(data);
      const offset = byteOffset / 4;
      if (offset + floats.length > arrayBuffer.data.length) {
        throw new Error("fakeGL: bufferSubData beyond the buffer's size");
      }
      arrayBuffer.data.set(floats, offset);
      uploads.push({ kind: "bufferSubData", buffer: arrayBuffer, offset, length: floats.length });
    },
    deleteBuffer: (buffer: TFakeBuffer | null): void => {
      if (!buffer) return;
      buffer.deleted = true;
      // A real context unbinds a deleted buffer and detaches it from the bound vertex array.
      if (arrayBuffer === buffer) arrayBuffer = undefined;
      for (const state of (vertexArray ?? defaultVertexArray).attributes.values()) {
        if (state.buffer === buffer) state.buffer = undefined;
      }
    },

    createVertexArray: (): TFakeVertexArray => {
      const created: TFakeVertexArray = { kind: "vertexArray", id: ++ids, attributes: new Map(), deleted: false };
      vertexArrays.push(created);
      return created;
    },
    bindVertexArray: (target: TFakeVertexArray | null): void => {
      vertexArray = target ?? undefined;
    },
    deleteVertexArray: (target: TFakeVertexArray | null): void => {
      if (!target) return;
      target.deleted = true;
      // Deleting the bound vertex array binds the default one.
      if (vertexArray === target) vertexArray = undefined;
    },
    enableVertexAttribArray: (location: number): void => {
      attribute(location).enabled = true;
    },
    vertexAttribPointer: (
      location: number,
      size: number,
      _type: number,
      _normalized: boolean,
      stride: number,
      offset: number
    ): void => {
      Object.assign(attribute(location), { buffer: arrayBuffer, size, stride, offset });
    },
    vertexAttribDivisor: (location: number, divisor: number): void => {
      attribute(location).divisor = divisor;
    },

    drawArrays: (mode: number, first: number, count: number): void => {
      checkDraw(first, count, 1);
      draws.push({ kind: "drawArrays", mode, first, count, instances: 1, program, vertexArray });
    },
    drawArraysInstanced: (mode: number, first: number, count: number, instances: number): void => {
      checkDraw(first, count, instances);
      draws.push({ kind: "drawArraysInstanced", mode, first, count, instances, program, vertexArray });
    },

    viewport: (): void => undefined,
    clearColor: (): void => undefined,
    clear: (): void => undefined,
    enable: (): void => undefined,
    blendFunc: (): void => undefined,
  };

  // Records every call by name before running it.
  const recorded: Record<string, unknown> = { ...CONSTANTS };
  for (const [name, method] of Object.entries(methods)) {
    const run = method as (...args: unknown[]) => unknown;
    recorded[name] = name.startsWith("uniform")
      ? run
      : (...args: unknown[]): unknown => {
          calls.push(name);
          return run(...args);
        };
  }

  const all: Record<"buffer" | "vertexArray" | "program" | "shader", ReadonlyArray<{ deleted: boolean }>> = {
    shader: shaders,
    program: programs,
    buffer: buffers,
    vertexArray: vertexArrays,
  };
  return {
    gl: recorded as unknown as WebGL2RenderingContext,
    shaders,
    programs,
    buffers,
    vertexArrays,
    used,
    uniformLookups,
    uniforms,
    uploads,
    draws,
    calls,
    live: (kind): number => all[kind].filter((item) => !item.deleted).length,
    loseContext: (): void => {
      lost = true;
    },
  };
}

type TGetContext = (this: HTMLCanvasElement, contextId: string, options?: unknown) => unknown;

export type TFakeWebGL2 = {
  /** Contexts given out, in order: one per canvas, like a browser. */
  contexts: TFakeGL[];
  /** Puts the original `getContext` back. */
  restore(): void;
};

/**
 * Makes `canvas.getContext("webgl2")` return a fake context from `create` (null: WebGL2 is unavailable) and every
 * other context as before. It replaces `HTMLCanvasElement.prototype.getContext` instead of `jest.spyOn`, since
 * jest-canvas-mock defines that method as a mock function already: `spyOn` would return that mock, and a
 * `mockImplementation` delegating to it would call itself.
 */
export function installFakeWebGL2(create: () => TFakeGL | null = () => createFakeGL()): TFakeWebGL2 {
  const prototype = HTMLCanvasElement.prototype;
  const original = prototype.getContext;
  const contexts: TFakeGL[] = [];
  const given = new WeakMap<HTMLCanvasElement, TFakeGL | null>();
  const getContext: TGetContext = function (this: HTMLCanvasElement, contextId, options) {
    if (contextId !== "webgl2") return (original as unknown as TGetContext).call(this, contextId, options);
    if (!given.has(this)) {
      const fake = create();
      if (fake) {
        fake.canvas = this;
        contexts.push(fake);
      }
      given.set(this, fake);
    }
    return given.get(this)?.gl ?? null;
  };
  prototype.getContext = getContext as unknown as typeof original;
  return {
    contexts,
    restore: (): void => {
      prototype.getContext = original;
    },
  };
}
