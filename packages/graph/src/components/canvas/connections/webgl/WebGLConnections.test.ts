import type { IConnectionBatchItem } from "../batch";
import { defineConnectionEffect, toConnectionEffect } from "../effects/ConnectionEffect";
import type { ConnectionEffect } from "../effects/ConnectionEffect";
import type { TConnectionEffectDefinition, TUniformTypes } from "../effects/types";
import type { TWebGLShape } from "../lines/types";

import { WebGLConnections } from "./WebGLConnections";
import type { TWebGLConnectionsOptions } from "./WebGLConnections";
import { createFakeGL, installFakeWebGL2 } from "./fakeGL";
import type { TFakeGL, TFakeWebGL2 } from "./fakeGL";
import { FILL_VERTEX } from "./shaders";

let installed: TFakeWebGL2 | undefined;

/** Gives the next canvas `context` for "webgl2"; other contexts as usual. */
function mockWebGL2(context: TFakeGL | null): void {
  installed = installFakeWebGL2(() => context);
}

const options: TWebGLConnectionsOptions = {
  chunkSize: 10,
  cellSize: 1000,
  getCamera: () => ({
    x: 0,
    y: 0,
    width: 200,
    height: 100,
    scale: 1,
    scaleMin: 0.01,
    scaleMax: 1,
    relativeX: 0,
    relativeY: 0,
    relativeWidth: 200,
    relativeHeight: 100,
    viewportInsets: { left: 0, right: 0, top: 0, bottom: 0 },
    autoPanningEnabled: false,
  }),
  onChange: () => undefined,
  onLost: () => undefined,
  onRestored: () => undefined,
};

function graphCanvas(): HTMLCanvasElement {
  const root = document.createElement("div");
  const canvas = document.createElement("canvas");
  canvas.style.zIndex = "2";
  canvas.width = 400;
  canvas.height = 200;
  root.appendChild(canvas);
  document.body.appendChild(root);
  return canvas;
}

const item = (shape: TWebGLShape): IConnectionBatchItem => ({
  getPathBounds: () => [0, 0, 30, 10],
  getPath: () => undefined,
  style: () => undefined,
  getWebGLShape: () => shape,
});

function define<U extends TUniformTypes>(
  definition: TConnectionEffectDefinition<U, readonly number[]>
): ConnectionEffect<U, readonly number[]> {
  return toConnectionEffect(defineConnectionEffect(definition));
}

/** A straight line along y = `y` from x = 0 to 30, with the effect when given. */
const effectLine = (effect?: ConnectionEffect<TUniformTypes, never>, y = 5): IConnectionBatchItem =>
  item({
    segments: new Float32Array([0, y, 10, y, 20, y, 30, y]),
    stroke: { color: "#000", width: 2 },
    ...(effect ? { effect, params: [] } : {}),
  });

/** `requestAnimationFrame` under the test's control: callbacks wait until `run()`. */
function mockFrames(): { request: jest.SpyInstance; pending: () => number; run: () => void } {
  const callbacks = new Map<number, FrameRequestCallback>();
  let next = 1;
  const request = jest.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    callbacks.set(next, callback);
    return next++;
  });
  jest.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => {
    callbacks.delete(id);
  });
  return {
    request,
    pending: () => callbacks.size,
    run: (): void => {
      const due = [...callbacks.values()];
      callbacks.clear();
      for (const onFrame of due) onFrame(performance.now());
    },
  };
}

function create(fake: TFakeGL, overrides: Partial<TWebGLConnectionsOptions> = {}): WebGLConnections {
  mockWebGL2(fake);
  const connections = WebGLConnections.create(graphCanvas(), { ...options, ...overrides });
  if (!connections) throw new Error("Expected WebGL connections");
  return connections;
}

describe("WebGLConnections", () => {
  afterEach(() => {
    installed?.restore();
    installed = undefined;
    document.body.innerHTML = "";
    jest.restoreAllMocks();
  });

  it("stacks its canvas right below the graph canvas and compiles the line and fill programs", () => {
    const fake = createFakeGL();
    mockWebGL2(fake);
    const graph = graphCanvas();
    const connections = WebGLConnections.create(graph, options);
    expect(connections).toBeInstanceOf(WebGLConnections);
    const canvas = graph.previousSibling;
    expect(canvas).toBe(fake.canvas);
    if (!(canvas instanceof HTMLCanvasElement)) throw new Error("Expected the WebGL canvas");
    expect(canvas.style.zIndex).toBe("2");
    expect(fake.programs.filter((program) => program.linked)).toHaveLength(2);
    expect("setEffects" in (connections as object)).toBe(false);
  });

  it("is unavailable without WebGL2", () => {
    mockWebGL2(null);
    expect(WebGLConnections.create(graphCanvas(), options)).toBeUndefined();
  });

  it("throws when a program fails to compile and frees the context", () => {
    const fake = createFakeGL({ compileError: (source) => (source === FILL_VERTEX ? "fill failed" : undefined) });
    mockWebGL2(fake);
    expect(() => WebGLConnections.create(graphCanvas(), options)).toThrow("fill failed");
    expect(fake.gl.isContextLost()).toBe(true);
  });

  it("draws the items' shapes in the graph layer's frame and frees everything on dispose", () => {
    const fake = createFakeGL();
    mockWebGL2(fake);
    const graph = graphCanvas();
    const connections = WebGLConnections.create(graph, options);
    if (!connections) throw new Error("Expected WebGL connections");
    const line = item({ segments: new Float32Array([0, 0, 10, 0, 20, 0, 30, 0]), stroke: { color: "#000", width: 2 } });
    const arrow = item({
      segments: new Float32Array([0, 0, 1, 1, 2, 2, 3, 3]),
      stroke: { color: "#000", width: 2 },
      fill: new Float32Array([0, 0, 3, 3, 0, 3]),
    });
    connections.add(line, { zIndex: 2, group: "line" });
    connections.add(arrow, { zIndex: 1, group: "arrow" });
    connections.render();

    // The arrow's z-level first: its fill, then its stroke; then the line.
    expect(fake.draws.map(({ kind }) => kind)).toEqual(["drawArrays", "drawArraysInstanced", "drawArraysInstanced"]);

    connections.dispose();
    expect(graph.previousSibling).toBeNull();
    expect(fake.gl.isContextLost()).toBe(true);
    expect(fake.live("program")).toBe(0);
  });

  it("stops drawing when its context is lost and reports the loss and the restore", () => {
    const fake = createFakeGL();
    mockWebGL2(fake);
    const onLost = jest.fn();
    const onRestored = jest.fn();
    const connections = WebGLConnections.create(graphCanvas(), { ...options, onLost, onRestored });
    if (!connections || !fake.canvas) throw new Error("Expected WebGL connections");
    connections.add(
      item({ segments: new Float32Array([0, 0, 10, 0, 20, 0, 30, 0]), stroke: { color: "#000", width: 2 } }),
      { zIndex: 1, group: "line" }
    );

    fake.loseContext();
    const lost = new Event("webglcontextlost", { cancelable: true });
    fake.canvas.dispatchEvent(lost);
    expect(lost.defaultPrevented).toBe(true);
    expect(onLost).toHaveBeenCalledTimes(1);
    connections.render();
    expect(fake.draws).toHaveLength(0);

    fake.restoreContext();
    fake.canvas.dispatchEvent(new Event("webglcontextrestored"));
    expect(onRestored).toHaveBeenCalledTimes(1);
  });

  it("after a restore, dispose frees the restored context without touching objects of the lost one", () => {
    const fake = createFakeGL();
    mockWebGL2(fake);
    const onLost = jest.fn();
    const onRestored = jest.fn();
    const graph = graphCanvas();
    const connections = WebGLConnections.create(graph, { ...options, onLost, onRestored });
    if (!connections || !fake.canvas) throw new Error("Expected WebGL connections");
    const canvas = fake.canvas;
    fake.loseContext();
    canvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true }));
    fake.restoreContext();
    canvas.dispatchEvent(new Event("webglcontextrestored"));
    const calls = fake.calls.length;

    connections.dispose();

    expect(graph.previousSibling).toBeNull();
    expect(fake.gl.isContextLost()).toBe(true);
    // Programs of the lost context are gone with it: dispose deletes nothing.
    expect(fake.calls.slice(calls).filter((name) => name.startsWith("delete"))).toEqual([]);
    // No listener is left on the canvas.
    canvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true }));
    canvas.dispatchEvent(new Event("webglcontextrestored"));
    expect(onLost).toHaveBeenCalledTimes(1);
    expect(onRestored).toHaveBeenCalledTimes(1);
  });
  it("re-encodes chunks for another zoom bucket over frames of its own while stale ones remain", () => {
    const frames = mockFrames();
    const fake = createFakeGL();
    const onChange = jest.fn();
    const camera = { ...options.getCamera() };
    const connections = create(fake, { chunkSize: 1, getCamera: () => camera, onChange });
    // A long bezier: 5 pieces at scale 1, one at scale 0.01.
    const bezier = new Float32Array([0, 0, 1500, 0, 1500, 800, 3000, 800]);
    for (let i = 0; i < 3; i++) {
      connections.add(item({ segments: bezier, stroke: { color: "#000", width: 2 } }), { zIndex: 1, group: "line" });
    }
    connections.render();
    expect(fake.draws.map(({ instances }) => instances)).toEqual([5, 5, 5]);
    expect(frames.pending()).toBe(0);
    onChange.mockClear();

    // Every re-encode takes longer than a frame's budget: one chunk a frame, the others drawn as they are.
    let now = 0;
    jest.spyOn(performance, "now").mockImplementation(() => (now += 5));
    camera.scale = 0.01;
    connections.render();
    expect(fake.draws.slice(3).map(({ instances }) => instances)).toEqual([1, 5, 5]);
    expect(frames.pending()).toBe(1);
    frames.run();
    expect(fake.draws.slice(6).map(({ instances }) => instances)).toEqual([1, 1, 5]);
    expect(frames.pending()).toBe(1);
    frames.run();
    expect(fake.draws.slice(9).map(({ instances }) => instances)).toEqual([1, 1, 1]);
    expect(frames.pending()).toBe(0);
    // The graph layer is not asked for a frame.
    expect(onChange).not.toHaveBeenCalled();
    connections.dispose();
  });

  describe("effects", () => {
    it("redraws once in its own frame after a uniform change, without touching buffers or the graph layer", () => {
      const frames = mockFrames();
      const fake = createFakeGL();
      const onChange = jest.fn();
      const glow = define({
        fragment: "vec4 effect(ConnectionFragment f, vec4 color) { return color * u_k; }",
        uniforms: { k: { type: "float", value: 1 } },
      });
      const connections = create(fake, { onChange });
      connections.add(effectLine(glow), { zIndex: 1, group: "line" });
      connections.render();
      // Nothing animates: no frame of its own.
      expect(frames.pending()).toBe(0);
      onChange.mockClear();
      const uploads = fake.uploads.length;
      const draws = fake.draws.length;

      glow.uniforms.k.value = 2;
      glow.uniforms.k.value = 3;
      expect(frames.request).toHaveBeenCalledTimes(1);
      frames.run();

      expect(fake.draws).toHaveLength(draws + 1);
      expect(fake.uploads).toHaveLength(uploads);
      expect(fake.calls.filter((name) => name === "bufferData" || name === "bufferSubData")).toHaveLength(uploads);
      expect(fake.uniforms.filter(({ name }) => name === "u_k").map(({ values }) => values)).toEqual([[1], [3]]);
      expect(onChange).not.toHaveBeenCalled();
      expect(frames.pending()).toBe(0);

      // A graph layer frame replaces a pending one: the picture is drawn once.
      glow.uniforms.k.value = 4;
      connections.render();
      expect(frames.pending()).toBe(0);
      expect(fake.draws).toHaveLength(draws + 2);
      connections.dispose();
    });

    it("binds one program per effect for the strokes of a z-level, whatever the number of chunks", () => {
      const fake = createFakeGL();
      const a = define({ fragment: "vec4 effect(ConnectionFragment f, vec4 color) { return color.bgra; } // A" });
      const b = define({ fragment: "vec4 effect(ConnectionFragment f, vec4 color) { return color.gbra; } // B" });
      const connections = create(fake, { chunkSize: 2 });
      for (const effect of [a, b, a, b, b, a]) connections.add(effectLine(effect), { zIndex: 1, group: "line" });
      const bound = fake.used.length;
      connections.render();

      const used = fake.used.slice(bound);
      expect(used).toHaveLength(2);
      expect(used.map((program) => program?.fragment?.includes("// A"))).toEqual([true, false]);
      expect(fake.draws).toHaveLength(6);
      expect(fake.draws.map(({ program }) => used.indexOf(program))).toEqual([0, 0, 0, 1, 1, 1]);
      connections.dispose();
    });

    it("widens the quad by the effect's extra width and the culling viewport by it in world units", () => {
      const fake = createFakeGL();
      const glow = define({
        fragment:
          "vec4 effect(ConnectionFragment f, vec4 color) { return mix(vec4(color.rgb, 0.0), color, f.coverage); }",
        extraWidth: 10,
      });
      const camera = { ...options.getCamera(), scale: 0.5 };
      const connections = create(fake, { getCamera: () => camera });
      // Its chunk spans x 0..30; at scale 0.5 the glow reaches 20 world units beyond.
      connections.add(effectLine(glow), { zIndex: 1, group: "line" });
      connections.render();
      expect(fake.draws).toHaveLength(1);
      expect(
        fake.uniforms.filter(({ name }) => name === "graph_extraWidth").map(({ values }) => values)
      ).toContainEqual([10]);

      connections.render({ minX: 45, minY: 0, maxX: 100, maxY: 10 });
      expect(fake.draws).toHaveLength(2);
      connections.render({ minX: 55, minY: 0, maxX: 100, maxY: 10 });
      expect(fake.draws).toHaveLength(2);
      connections.dispose();

      // Without an effect the viewport is not widened.
      const plain = createFakeGL();
      const plainConnections = create(plain, { getCamera: () => camera });
      plainConnections.add(effectLine(), { zIndex: 1, group: "line" });
      plainConnections.render();
      plainConnections.render({ minX: 45, minY: 0, maxX: 100, maxY: 10 });
      expect(plain.draws).toHaveLength(1);
      plainConnections.dispose();
    });

    it("unsubscribes from an effect's uniforms when the last chunk with it is released", () => {
      const frames = mockFrames();
      const fake = createFakeGL();
      const glow = define({
        fragment: "vec4 effect(ConnectionFragment f, vec4 color) { return color * u_k; }",
        uniforms: { k: { type: "float", value: 1 } },
      });
      const connections = create(fake, { chunkSize: 1 });
      const first = effectLine(glow, 1);
      const second = effectLine(glow, 2);
      connections.add(first, { zIndex: 1, group: "line" });
      connections.add(second, { zIndex: 1, group: "line" });
      connections.render();

      connections.delete(first);
      glow.uniforms.k.value = 2;
      expect(frames.request).toHaveBeenCalledTimes(1);
      frames.run();

      connections.delete(second);
      glow.uniforms.k.value = 3;
      expect(frames.request).toHaveBeenCalledTimes(1);
      expect(frames.pending()).toBe(0);
      connections.dispose();
    });

    it("unsubscribes when a chunk is rebuilt without the effect, and on dispose", () => {
      const frames = mockFrames();
      const fake = createFakeGL();
      const glow = define({
        fragment: "vec4 effect(ConnectionFragment f, vec4 color) { return color * u_k; }",
        uniforms: { k: { type: "float", value: 1 } },
      });
      const connections = create(fake);
      const lit = effectLine(glow, 1);
      connections.add(lit, { zIndex: 1, group: "line" });
      connections.add(effectLine(undefined, 2), { zIndex: 1, group: "line" });
      connections.render();
      connections.delete(lit);
      connections.render();
      glow.uniforms.k.value = 2;
      expect(frames.request).not.toHaveBeenCalled();

      connections.add(effectLine(glow, 3), { zIndex: 1, group: "line" });
      connections.render();
      connections.dispose();
      glow.uniforms.k.value = 3;
      expect(frames.request).not.toHaveBeenCalled();
    });

    it("stops its frames once the graph layer's canvas leaves the document, until the next render()", () => {
      const frames = mockFrames();
      const fake = createFakeGL();
      const moving = define({
        fragment: "vec4 effect(ConnectionFragment f, vec4 color) { return color * fract(f.time); } // detached root",
        animated: true,
      });
      const connections = create(fake);
      connections.add(effectLine(moving), { zIndex: 1, group: "line" });
      connections.render();
      expect(frames.pending()).toBe(1);
      const root = fake.canvas?.parentElement;
      if (!root) throw new Error("Expected the root");

      // The root leaves the document without a detach of the graph layer.
      root.remove();
      frames.run();
      expect(fake.draws).toHaveLength(1);
      expect(frames.pending()).toBe(0);

      document.body.appendChild(root);
      connections.render();
      expect(fake.draws).toHaveLength(2);
      expect(frames.pending()).toBe(1);
      connections.dispose();
    });

    it("suspend() cancels its frame, ignores uniform changes and removes its canvas until the next render()", () => {
      const frames = mockFrames();
      const fake = createFakeGL();
      const glow = define({
        fragment: "vec4 effect(ConnectionFragment f, vec4 color) { return color * u_k; } // suspended",
        uniforms: { k: { type: "float", value: 1 } },
        animated: true,
      });
      const graph = graphCanvas();
      mockWebGL2(fake);
      const connections = WebGLConnections.create(graph, options);
      if (!connections || !fake.canvas) throw new Error("Expected WebGL connections");
      const canvas = fake.canvas;
      connections.add(effectLine(glow), { zIndex: 1, group: "line" });
      connections.render();
      expect(frames.pending()).toBe(1);

      connections.suspend();
      expect(canvas.isConnected).toBe(false);
      expect(frames.pending()).toBe(0);
      glow.uniforms.k.value = 2;
      expect(frames.pending()).toBe(0);
      const draws = fake.draws.length;

      connections.render();
      expect(graph.previousSibling).toBe(canvas);
      expect(fake.draws).toHaveLength(draws + 1);
      expect(frames.pending()).toBe(1);
      // The GL objects stayed: the same programs draw.
      expect(fake.live("program")).toBe(3);
      connections.dispose();
    });

    it("keeps redrawing every frame while an animated effect is drawn", () => {
      const frames = mockFrames();
      const fake = createFakeGL();
      const moving = define({
        fragment: "vec4 effect(ConnectionFragment f, vec4 color) { return color * fract(f.time); }",
        animated: true,
      });
      const connections = create(fake);
      const line = effectLine(moving);
      connections.add(line, { zIndex: 1, group: "line" });
      connections.render();
      expect(frames.pending()).toBe(1);
      frames.run();
      frames.run();
      expect(fake.draws).toHaveLength(3);
      expect(frames.pending()).toBe(1);

      connections.delete(line);
      connections.render();
      expect(frames.pending()).toBe(0);
      connections.dispose();
    });
  });
});
