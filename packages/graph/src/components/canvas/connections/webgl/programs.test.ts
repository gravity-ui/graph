import { ConnectionPrograms } from "./programs";

type TFakeProgram = { id: number; fragment?: string };

/** The calls ConnectionPrograms makes; a fragment containing BROKEN fails to compile. */
function createFakeGL() {
  let ids = 0;
  const used: TFakeProgram[] = [];
  const uniforms: Array<[TFakeProgram | undefined, string]> = [];
  let current: TFakeProgram | undefined;
  const gl = {
    VERTEX_SHADER: 1,
    FRAGMENT_SHADER: 2,
    COMPILE_STATUS: 3,
    LINK_STATUS: 4,
    createShader: (type: number) => ({ type, source: "" }),
    shaderSource: (shader: { source: string }, source: string) => {
      shader.source = source;
    },
    compileShader: () => undefined,
    getShaderParameter: (shader: { source: string }) => !shader.source.includes("BROKEN"),
    getShaderInfoLog: () => "ERROR: 0:1: 'BROKEN' : syntax error",
    deleteShader: () => undefined,
    createProgram: (): TFakeProgram => ({ id: ++ids }),
    attachShader: (program: TFakeProgram, shader: { type: number; source: string }) => {
      if (shader.type === 2) program.fragment = shader.source;
    },
    detachShader: () => undefined,
    linkProgram: () => undefined,
    getProgramParameter: () => true,
    getUniformLocation: (_program: TFakeProgram, name: string) => name,
    useProgram: (program: TFakeProgram) => {
      current = program;
      used.push(program);
    },
    uniform2f: (location: string) => uniforms.push([current, location]),
    uniform3f: (location: string) => uniforms.push([current, location]),
    uniform1f: (location: string) => uniforms.push([current, location]),
    deleteProgram: () => undefined,
  };
  return { gl: gl as unknown as WebGL2RenderingContext, used, uniforms };
}

const frame = { width: 100, height: 100, x: 0, y: 0, scale: 1, dpr: 2, time: 0 };
const glow = { name: "glow", fragment: "vec4 effect(ConnectionFragment f, vec4 color) { return color; }" };

describe("ConnectionPrograms", () => {
  let error: jest.SpyInstance;

  beforeEach(() => {
    error = jest.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    error.mockRestore();
  });

  it("compiles an effect on first use and sets each program's frame uniforms once per frame", () => {
    const { gl, used, uniforms } = createFakeGL();
    const programs = new ConnectionPrograms(gl);
    programs.setEffects([glow]);
    programs.beginFrame(frame);
    programs.use(undefined);
    programs.use("glow");
    programs.use("glow");
    programs.use(undefined);
    expect(used.map((program) => program.fragment?.includes("#define CONNECTION_EFFECT"))).toEqual([
      false,
      true,
      false,
    ]);
    // Four uniforms for each of the two programs, not again on reuse within the frame.
    expect(uniforms).toHaveLength(8);
    programs.beginFrame(frame);
    programs.use("glow");
    expect(uniforms).toHaveLength(12);
  });

  it("draws a broken or unknown effect as the plain stroke and reports it once", () => {
    const { gl, used } = createFakeGL();
    const programs = new ConnectionPrograms(gl);
    programs.setEffects([{ name: "broken", fragment: "BROKEN" }]);
    programs.beginFrame(frame);
    programs.use("broken");
    programs.use("broken");
    programs.use("missing");
    programs.use("missing");
    expect(used).toHaveLength(1);
    expect(used[0].fragment).not.toContain("BROKEN");
    expect(error).toHaveBeenCalledTimes(2);
    expect(error.mock.calls[0][0]).toContain('Connection effect "broken" failed to compile');
    expect(error.mock.calls[1][0]).toContain('Connection effect "missing" is not registered');
  });

  it("compares effects by content: a copy is no change, another source or animation is", () => {
    const { gl } = createFakeGL();
    const programs = new ConnectionPrograms(gl);
    expect(programs.setEffects([glow])).toBe(true);
    expect(programs.setEffects([{ ...glow }])).toBe(false);
    expect(programs.isAnimated("glow")).toBe(false);
    expect(programs.setEffects([{ ...glow, animated: true }])).toBe(true);
    expect(programs.isAnimated("glow")).toBe(true);
    expect(programs.setEffects([])).toBe(true);
    expect(programs.isAnimated("glow")).toBe(false);
  });
});
