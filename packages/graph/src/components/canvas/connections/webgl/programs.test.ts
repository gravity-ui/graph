import { createFakeGL } from "./fakeGL";
import type { TFakeProgram } from "./fakeGL";
import { ConnectionPrograms } from "./programs";
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

describe("connection shaders", () => {
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
    const fake = createFakeGL();
    const programs = new ConnectionPrograms(fake.gl);
    programs.beginFrame(frame);
    programs.use();
    programs.use();
    programs.useFill();
    programs.use();

    const [line, fill] = fake.programs;
    // A program is bound only when another one is.
    expect(fake.used).toEqual([line, fill, line]);
    const of = (program: TFakeProgram): Record<string, number[]> =>
      Object.fromEntries(fake.uniforms.filter((u) => u.program === program).map((u) => [u.name, u.values]));
    expect(of(line)).toEqual({
      graph_viewport: [100, 50],
      graph_camera: [3, 4, 0.5],
      graph_dpr: [2],
      graph_time: [1.5],
      graph_extraWidth: [0],
    });
    expect(of(fill)).toEqual({ graph_viewport: [100, 50], graph_camera: [3, 4, 0.5] });
    expect(fake.uniforms).toHaveLength(7);

    programs.beginFrame({ ...frame, time: 2 });
    programs.use();
    expect(fake.uniforms).toHaveLength(12);
    // A new frame binds again: another context user may have changed the program.
    expect(fake.used).toEqual([line, fill, line, line]);
  });

  it("throws the compiler log when the line program fails, and when the fill program fails", () => {
    const failing = createFakeGL({
      compileError: (source) => (source.includes("struct ConnectionFragment") ? "ERROR: 0:1: line" : undefined),
    });
    expect(() => new ConnectionPrograms(failing.gl)).toThrow("ERROR: 0:1: line");

    const fill = createFakeGL({ linkError: (vertex) => (vertex === FILL_VERTEX ? "fill link" : undefined) });
    expect(() => new ConnectionPrograms(fill.gl)).toThrow("fill link");
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
