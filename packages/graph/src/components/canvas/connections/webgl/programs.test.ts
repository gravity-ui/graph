import { effect as watch } from "@preact/signals-core";

import { defineConnectionEffect, toConnectionEffect } from "../effects/ConnectionEffect";
import type { ConnectionEffect } from "../effects/ConnectionEffect";
import type { TConnectionEffectDefinition, TUniformTypes } from "../effects/types";

import { INSTANCE_ATTRIBUTES, INSTANCE_FLOATS } from "./encode";
import { createFakeGL } from "./fakeGL";
import type { TFakeGL, TFakeProgram } from "./fakeGL";
import { FILL_ATTRIBUTES, FILL_VERTEX_FLOATS } from "./fill";
import { ConnectionPrograms, WebGLProgramError } from "./programs";
import { FILL_FRAGMENT, FILL_VERTEX, VERTEX, createFragmentShader } from "./shaders";

const frame = { width: 100, height: 50, x: 3, y: 4, scale: 0.5, dpr: 2, time: 1.5 };
const IDENTITY = "vec4 effect(ConnectionFragment f, vec4 color) { return color; }";

/** Names of the attributes, varyings, outputs and uniforms a shader declares. */
function declaredNames(source: string): string[] {
  const names: string[] = [];
  const pattern = /^\s*(?:layout\s*\([^)]*\)\s*)?(?:flat\s+)?(?:in|out|uniform)\s+(?:\w+\s+)?\w+\s+(\w+)\s*;/gm;
  for (const match of source.matchAll(pattern)) names.push(match[1]);
  return names;
}

const COMPONENTS: Record<string, number> = { float: 1, vec2: 2, vec3: 3, vec4: 4 };

/** `[location, components]` of the shader's `layout(location = N) in <type>` declarations, by location. */
function layoutOf(source: string): Array<[number, number]> {
  const pattern = /layout\s*\(\s*location\s*=\s*(\d+)\s*\)\s*in\s+(float|vec[234])\s+\w+\s*;/g;
  return [...source.matchAll(pattern)]
    .map((match): [number, number] => [Number(match[1]), COMPONENTS[match[2]]])
    .sort(([a], [b]) => a - b);
}

/** Checks that attributes tile one vertex without gaps or overlaps: offsets 0, then each after the previous. */
function expectContiguous(attributes: ReadonlyArray<readonly [number, number, number]>, floats: number): void {
  const byOffset = [...attributes].sort((a, b) => a[2] - b[2]);
  let offset = 0;
  for (const [, size, start] of byOffset) {
    expect(start).toBe(offset);
    offset += size;
  }
  expect(offset).toBe(floats);
}

function uniformsOf(fake: TFakeGL, program: TFakeProgram): Record<string, number[]> {
  return Object.fromEntries(fake.uniforms.filter((u) => u.program === program).map((u) => [u.name, u.values]));
}

describe("connection shaders", () => {
  it("the line vertex shader reads the template at 0 and the instance attributes the backend lays out", () => {
    const instance = INSTANCE_ATTRIBUTES.map(([location, size]): [number, number] => [location, size]);
    expect(layoutOf(VERTEX)).toEqual([[0, 2], ...instance.sort(([a], [b]) => a - b)]);
    expectContiguous(INSTANCE_ATTRIBUTES, INSTANCE_FLOATS);
  });

  it("the fill vertex shader reads the attributes the fill buffer lays out", () => {
    expect(layoutOf(FILL_VERTEX)).toEqual(FILL_ATTRIBUTES.map(([location, size]) => [location, size]));
    expectContiguous(FILL_ATTRIBUTES, FILL_VERTEX_FLOATS);
  });

  const sources = {
    vertex: VERTEX,
    fragment: createFragmentShader(),
    fillVertex: FILL_VERTEX,
    fillFragment: FILL_FRAGMENT,
  };

  it("versions the fragment contract and defines ConnectionFragment with extraWidth and coverage", () => {
    const shader = createFragmentShader();
    expect(shader.startsWith("#version 300 es\n")).toBe(true);
    expect(shader).toContain("#define GRAPH_CONNECTION_FRAGMENT 1");
    expect(shader).toContain("struct ConnectionFragment");
    expect(shader).toContain("float extraWidth;");
    expect(shader).toContain("float coverage;");
  });

  it("uses the identity effect without an effect and inserts an effect before main()", () => {
    expect(createFragmentShader()).toContain(IDENTITY);
    const source = "vec4 effect(ConnectionFragment f, vec4 color) { return color * f.t; }";
    const shader = createFragmentShader(source);
    expect(shader.startsWith("#version 300 es\n")).toBe(true);
    expect(shader).not.toContain(IDENTITY);
    expect(shader).toContain(source);
    // After the struct it reads, before main(), which calls it.
    expect(shader.indexOf("struct ConnectionFragment")).toBeLessThan(shader.indexOf(source));
    expect(shader.indexOf(source)).toBeLessThan(shader.indexOf("void main()"));
  });

  it.each(Object.entries(sources))("%s: internal names take the graph_ prefix", (_name, source) => {
    expect(source).not.toMatch(/\b[aiuv]_[a-zA-Z]/);
    const names = declaredNames(source);
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) expect(name).toMatch(/^graph_/);
  });

  it("the line shaders read the frame uniforms and the extra width", () => {
    expect(declaredNames(VERTEX)).toEqual(
      expect.arrayContaining(["graph_viewport", "graph_camera", "graph_dpr", "graph_extraWidth"])
    );
    expect(declaredNames(createFragmentShader())).toEqual(
      expect.arrayContaining(["graph_camera", "graph_dpr", "graph_time", "graph_extraWidth"])
    );
  });
});

describe("ConnectionPrograms", () => {
  it("compiles the line and fill programs and looks uniforms up by their graph_ names", () => {
    const fake = createFakeGL();
    expect(new ConnectionPrograms(fake.gl)).toBeInstanceOf(ConnectionPrograms);
    expect(fake.programs).toHaveLength(2);
    expect(fake.programs.every((program) => program.linked)).toBe(true);
    expect(fake.uniformLookups).toEqual(
      expect.arrayContaining(["graph_viewport", "graph_camera", "graph_dpr", "graph_time", "graph_extraWidth"])
    );
    for (const name of fake.uniformLookups) expect(name).toMatch(/^graph_/);
  });

  it("sets each program's frame uniforms once per frame, the extra width at zero", () => {
    // The identity effect does not read f.time, so a compiler may drop graph_time: its location is null.
    const fake = createFakeGL({ inactiveUniforms: ["graph_time"] });
    const programs = new ConnectionPrograms(fake.gl);
    programs.beginFrame(frame);
    programs.use();
    programs.use();
    programs.useFill();
    programs.use();

    const [line, fill] = fake.programs;
    // A program is bound only when another one is.
    expect(fake.used).toEqual([line, fill, line]);
    expect(uniformsOf(fake, line)).toEqual({
      graph_viewport: [100, 50],
      graph_camera: [3, 4, 0.5],
      graph_dpr: [2],
      graph_extraWidth: [0],
    });
    expect(uniformsOf(fake, fill)).toEqual({ graph_viewport: [100, 50], graph_camera: [3, 4, 0.5] });
    expect(fake.uniforms).toHaveLength(6);

    programs.beginFrame({ ...frame, time: 2 });
    programs.use();
    expect(fake.uniforms).toHaveLength(10);
    // A new frame binds again: another context user may have changed the program.
    expect(fake.used).toEqual([line, fill, line, line]);
  });

  it("sets the time when the line program reads it", () => {
    const fake = createFakeGL();
    const programs = new ConnectionPrograms(fake.gl);
    programs.beginFrame(frame);
    programs.use();
    expect(uniformsOf(fake, fake.programs[0]).graph_time).toEqual([1.5]);
  });

  it("throws the compiler log when the line program fails, and when the fill program fails", () => {
    const failing = createFakeGL({
      compileError: (source) => (source.includes("struct ConnectionFragment") ? "ERROR: 0:1: line" : undefined),
    });
    expect(() => new ConnectionPrograms(failing.gl)).toThrow("ERROR: 0:1: line");
    expect(() => new ConnectionPrograms(failing.gl)).toThrow(WebGLProgramError);

    const fill = createFakeGL({ linkError: (vertex) => (vertex === FILL_VERTEX ? "fill link" : undefined) });
    expect(() => new ConnectionPrograms(fill.gl)).toThrow("fill link");
    expect(() => new ConnectionPrograms(fill.gl)).toThrow(WebGLProgramError);
    // Nothing of a failed constructor stays alive.
    expect(fill.live("program")).toBe(0);
    expect(fill.live("shader")).toBe(0);
  });

  it("frees its programs and shaders on dispose", () => {
    const fake = createFakeGL();
    new ConnectionPrograms(fake.gl).dispose();
    expect(fake.live("program")).toBe(0);
    expect(fake.live("shader")).toBe(0);
  });
});

/** An effect object as the renderer sees it. */
function define<U extends TUniformTypes>(
  definition: TConnectionEffectDefinition<U, readonly number[]>
): ConnectionEffect<U, readonly number[]> {
  return toConnectionEffect(defineConnectionEffect(definition));
}

describe("ConnectionPrograms with effects", () => {
  const originalEnv = process.env.NODE_ENV;
  let error: jest.SpyInstance;

  beforeEach(() => {
    error = jest.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    error.mockRestore();
    process.env.NODE_ENV = originalEnv;
  });

  /** Values of the uniform calls since `from`, as `name: values` in call order. */
  const callsSince = (fake: TFakeGL, from: number): string[] =>
    fake.uniforms.slice(from).map(({ name, values }) => `${name}: ${values.join(", ")}`);

  it("compiles an effect program on its first use, once per program key; clones share it", () => {
    const fake = createFakeGL();
    const programs = new ConnectionPrograms(fake.gl);
    const fragment = "vec4 effect(ConnectionFragment f, vec4 color) { return color * u_k; }";
    const a = define({ fragment, uniforms: { k: { type: "float", value: 1 } } });
    const twin = define({ fragment, uniforms: { k: { type: "float", value: 2 } } });
    const other = define({ fragment: "vec4 effect(ConnectionFragment f, vec4 color) { return color.bgra; }" });
    // Nothing is compiled before an effect is drawn.
    expect(fake.programs).toHaveLength(2);

    programs.beginFrame(frame);
    programs.use(a);
    expect(fake.programs).toHaveLength(3);
    const program = fake.programs[2];
    // The library declares the effect's uniforms before its fragment.
    expect(program.fragment).toContain("uniform float u_k;");
    expect(program.fragment).toContain(fragment);
    expect(program.fragment?.indexOf("uniform float u_k;")).toBeLessThan(program.fragment?.indexOf(fragment) ?? -1);
    // Compiler logs count lines from the fragment's first line.
    expect(program.fragment).toContain(`uniform float u_k;\n#line 1\n${fragment}\n`);
    expect(program.vertex).toBe(VERTEX);

    programs.use(a.clone());
    programs.use(twin);
    programs.beginFrame(frame);
    programs.use(a);
    expect(fake.programs).toHaveLength(3);
    expect(fake.used.slice(-1)).toEqual([program]);

    programs.use(other);
    expect(fake.programs).toHaveLength(4);
    expect(error).not.toHaveBeenCalled();
  });

  it("applies an effect's uniforms and extra width once per frame and again for another effect object", () => {
    const fake = createFakeGL({ inactiveUniforms: ["graph_time"] });
    const programs = new ConnectionPrograms(fake.gl);
    const a = define({
      fragment: "vec4 effect(ConnectionFragment f, vec4 color) { return vec4(u_tint, color.a * u_k); }",
      extraWidth: 4,
      uniforms: { k: { type: "float", value: 0.5 }, tint: { type: "vec3", value: [1, 0, 0] } },
    });
    const b = a.clone();
    b.uniforms.k.value = 2;

    programs.beginFrame(frame);
    programs.use(a);
    expect(callsSince(fake, 0)).toEqual([
      "graph_viewport: 100, 50",
      "graph_camera: 3, 4, 0.5",
      "graph_dpr: 2",
      "graph_extraWidth: 4",
      "u_k: 0.5",
      "u_tint: 1, 0, 0",
    ]);
    programs.use(a);
    expect(fake.uniforms).toHaveLength(6);

    // Another object of the same program: its values, without binding the program again.
    const bound = fake.used.length;
    programs.use(b);
    expect(callsSince(fake, 6)).toEqual(["graph_extraWidth: 4", "u_k: 2", "u_tint: 1, 0, 0"]);
    programs.use(a);
    expect(callsSince(fake, 9)).toEqual(["graph_extraWidth: 4", "u_k: 0.5", "u_tint: 1, 0, 0"]);
    expect(fake.used).toHaveLength(bound);

    // The plain program keeps its own extra width: zero.
    programs.use();
    expect(callsSince(fake, 12)).toEqual([
      "graph_viewport: 100, 50",
      "graph_camera: 3, 4, 0.5",
      "graph_dpr: 2",
      "graph_extraWidth: 0",
    ]);

    // A new frame applies the current values.
    a.uniforms.k.value = 0.25;
    programs.beginFrame(frame);
    programs.use(a);
    expect(callsSince(fake, 16)).toEqual([
      "graph_viewport: 100, 50",
      "graph_camera: 3, 4, 0.5",
      "graph_dpr: 2",
      "graph_extraWidth: 4",
      "u_k: 0.25",
      "u_tint: 1, 0, 0",
    ]);
  });

  it("sets four-component uniforms and skips uniforms the program does not read", () => {
    const fake = createFakeGL({ inactiveUniforms: ["u_unused"] });
    const programs = new ConnectionPrograms(fake.gl);
    const a = define({
      fragment: "vec4 effect(ConnectionFragment f, vec4 color) { return color * u_color * vec4(u_size, 1.0, 1.0); }",
      uniforms: {
        color: { type: "vec4", value: [0.1, 0.2, 0.3, 0.4] },
        size: { type: "vec2", value: [5, 6] },
        unused: { type: "float", value: 1 },
      },
    });
    programs.beginFrame(frame);
    programs.use(a);
    const user = fake.uniforms.filter(({ name }) => name.startsWith("u_"));
    expect(user.map(({ name, values }) => [name, values.map((value) => Math.round(value * 10) / 10)])).toEqual([
      ["u_color", [0.1, 0.2, 0.3, 0.4]],
      ["u_size", [5, 6]],
    ]);
  });

  it("reads uniform values without subscribing the caller", () => {
    const fake = createFakeGL();
    const programs = new ConnectionPrograms(fake.gl);
    const a = define({
      fragment: "vec4 effect(ConnectionFragment f, vec4 color) { return color * u_k; }",
      uniforms: { k: { type: "float", value: 1 } },
    });
    programs.beginFrame(frame);
    let runs = 0;
    const stop = watch(() => {
      runs++;
      programs.use(a);
    });
    a.uniforms.k.value = 2;
    stop();
    expect(runs).toBe(1);
  });

  it("reports a value of the wrong length once per effect object and uniform and does not apply it", () => {
    const fake = createFakeGL();
    const programs = new ConnectionPrograms(fake.gl);
    const a = define({
      fragment: "vec4 effect(ConnectionFragment f, vec4 color) { return vec4(u_tint * u_k, color.a); }",
      uniforms: { k: { type: "float", value: 1 }, tint: { type: "vec3", value: [1, 1, 1] } },
    });
    a.uniforms.tint.value = [1, 0];
    a.uniforms.k.value = [1] as unknown as number;

    programs.beginFrame(frame);
    programs.use(a);
    expect(fake.uniforms.filter(({ name }) => name.startsWith("u_"))).toEqual([]);
    expect(error).toHaveBeenCalledTimes(2);
    const messages = error.mock.calls.map(([message]) => String(message));
    for (const message of messages) expect(message).toMatch(/^\[@gravity-ui\/graph\] /);
    expect(messages.join("\n")).toContain("u_tint");
    expect(messages.join("\n")).toContain("u_k");

    programs.beginFrame(frame);
    programs.use(a);
    expect(error).toHaveBeenCalledTimes(2);

    // A number for a vector, on another object: reported for that object.
    const b = a.clone();
    b.uniforms.tint.value = 1 as unknown as readonly number[];
    programs.use(b);
    expect(error).toHaveBeenCalledTimes(3);
    expect(fake.uniforms.filter(({ name }) => name === "u_tint")).toEqual([]);
    // b's float is fine.
    expect(fake.uniforms.filter(({ name }) => name === "u_k").map(({ values }) => values)).toEqual([[1]]);
  });

  it("does not report a wrong value in a production build and still skips it", () => {
    process.env.NODE_ENV = "production";
    const fake = createFakeGL();
    const programs = new ConnectionPrograms(fake.gl);
    const a = define({
      fragment: "vec4 effect(ConnectionFragment f, vec4 color) { return vec4(u_tint, color.a); }",
      uniforms: { tint: { type: "vec3", value: [1, 1, 1, 1] } },
    });
    programs.beginFrame(frame);
    programs.use(a);
    expect(error).not.toHaveBeenCalled();
    expect(fake.uniforms.filter(({ name }) => name === "u_tint")).toEqual([]);
  });

  it("reports a broken effect source once, in every build, and draws its groups with the plain program", () => {
    process.env.NODE_ENV = "production";
    const fake = createFakeGL({
      compileError: (source) => (source.includes("BROKEN_COMPILE") ? "ERROR: 0:7: 'nope' : undeclared" : undefined),
      linkError: (_vertex, fragment) => (fragment.includes("BROKEN_LINK") ? "link: varying mismatch" : undefined),
    });
    const programs = new ConnectionPrograms(fake.gl);
    const [plain] = fake.programs;
    const broken = define({
      fragment: "vec4 effect(ConnectionFragment f, vec4 color) { return nope; } // BROKEN_COMPILE",
      extraWidth: 6,
    });
    const linkBroken = define({
      fragment: "vec4 effect(ConnectionFragment f, vec4 color) { return color; } // BROKEN_LINK",
    });

    programs.beginFrame(frame);
    programs.use(broken);
    expect(error).toHaveBeenCalledTimes(1);
    expect(String(error.mock.calls[0][0])).toMatch(/^\[@gravity-ui\/graph\] /);
    expect(String(error.mock.calls[0][0])).toContain("ERROR: 0:7: 'nope' : undeclared");
    expect(fake.used.slice(-1)).toEqual([plain]);
    // Drawn as the plain stroke: no extra width.
    expect(uniformsOf(fake, plain).graph_extraWidth).toEqual([0]);

    const shaders = fake.shaders.length;
    programs.use(broken.clone());
    programs.use(
      define({
        fragment: "vec4 effect(ConnectionFragment f, vec4 color) { return nope; } // BROKEN_COMPILE",
        extraWidth: 6,
      })
    );
    programs.beginFrame(frame);
    programs.use(broken);
    expect(error).toHaveBeenCalledTimes(1);
    // Not compiled again.
    expect(fake.shaders).toHaveLength(shaders);

    programs.use(linkBroken);
    expect(error).toHaveBeenCalledTimes(2);
    expect(String(error.mock.calls[1][0])).toContain("link: varying mismatch");
    expect(fake.used.slice(-1)).toEqual([plain]);
    // Nothing of the failed programs stays alive: the plain and fill programs, the shared vertex shader.
    expect(fake.live("program")).toBe(2);
    expect(fake.live("shader")).toBe(1);
  });

  it("frees effect programs on dispose", () => {
    const fake = createFakeGL();
    const programs = new ConnectionPrograms(fake.gl);
    programs.beginFrame(frame);
    programs.use(define({ fragment: "vec4 effect(ConnectionFragment f, vec4 color) { return color.gbra; }" }));
    expect(fake.live("program")).toBe(3);
    programs.dispose();
    expect(fake.live("program")).toBe(0);
    expect(fake.live("shader")).toBe(0);
  });
});
