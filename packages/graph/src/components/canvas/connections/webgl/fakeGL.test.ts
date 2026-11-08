import { createFakeGL } from "./fakeGL";
import type { TFakeGL } from "./fakeGL";

const VERTEX = "#version 300 es\nuniform vec2 graph_viewport;\nuniform float graph_time;\nvoid main() {}\n";
const FRAGMENT = "#version 300 es\nvoid main() {}\n";

function linked(fake: TFakeGL): WebGLProgram {
  const { gl } = fake;
  const program = gl.createProgram();
  for (const [type, source] of [
    [gl.VERTEX_SHADER, VERTEX],
    [gl.FRAGMENT_SHADER, FRAGMENT],
  ] as const) {
    const shader = gl.createShader(type);
    if (!shader || !program) throw new Error("Expected GL objects");
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    gl.attachShader(program, shader);
  }
  if (!program) throw new Error("Expected a program");
  gl.linkProgram(program);
  return program;
}

/** A program in use and a vertex array whose attribute 0 reads `floats` floats, 2 per vertex. */
function drawable(fake: TFakeGL, floats: number, divisor = 0): WebGLBuffer {
  const { gl } = fake;
  gl.useProgram(linked(fake));
  const buffer = gl.createBuffer();
  if (!buffer) throw new Error("Expected a buffer");
  gl.bindVertexArray(gl.createVertexArray());
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(floats), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
  gl.vertexAttribDivisor(0, divisor);
  return buffer;
}

describe("createFakeGL", () => {
  it("returns no location for an undeclared or inactive uniform", () => {
    const fake = createFakeGL({ inactiveUniforms: ["graph_time"] });
    const program = linked(fake);
    expect(fake.gl.getUniformLocation(program, "graph_viewport")).not.toBeNull();
    expect(fake.gl.getUniformLocation(program, "graph_time")).toBeNull();
    expect(fake.gl.getUniformLocation(program, "graph_dpr")).toBeNull();
  });

  it("rejects draws that read past the end of a bound buffer", () => {
    const fake = createFakeGL();
    drawable(fake, 8);
    // Four vertices of two floats.
    expect(() => fake.gl.drawArrays(fake.gl.TRIANGLES, 0, 4)).not.toThrow();
    expect(() => fake.gl.drawArrays(fake.gl.TRIANGLES, 1, 4)).toThrow("INVALID_OPERATION");
    expect(fake.draws).toHaveLength(1);
  });

  it("rejects instanced draws with more instances than an instance buffer holds", () => {
    const fake = createFakeGL();
    drawable(fake, 6, 1);
    expect(() => fake.gl.drawArraysInstanced(fake.gl.TRIANGLE_STRIP, 0, 100, 3)).not.toThrow();
    expect(() => fake.gl.drawArraysInstanced(fake.gl.TRIANGLE_STRIP, 0, 100, 4)).toThrow("INVALID_OPERATION");
  });

  it("unbinds a deleted buffer: writing to it or drawing from it throws", () => {
    const fake = createFakeGL();
    const buffer = drawable(fake, 8);
    fake.gl.deleteBuffer(buffer);
    expect(() => fake.gl.bufferSubData(fake.gl.ARRAY_BUFFER, 0, new Float32Array(2))).toThrow("without a bound buffer");
    expect(() => fake.gl.bindBuffer(fake.gl.ARRAY_BUFFER, buffer)).toThrow("deleted buffer");
    expect(() => fake.gl.drawArrays(fake.gl.TRIANGLES, 0, 3)).toThrow("without a buffer");
  });
});
