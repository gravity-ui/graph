import type { IConnectionBatchItem } from "../batch";
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

describe("WebGLConnections", () => {
  afterEach(() => {
    installed?.restore();
    installed = undefined;
    document.body.innerHTML = "";
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
});
