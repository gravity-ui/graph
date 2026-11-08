import { Graph } from "../../../graph";
import type { TConnectionsRendererState } from "../../../index";
import { globalScheduler } from "../../../lib/Scheduler";
import type { TBatchParams } from "../../../lib/batch/types";
import type { TConnection } from "../../../store/connection/ConnectionState";

import { BatchPath2DRenderer } from "./BatchPath2D";
import { BlockConnection } from "./BlockConnection";
import type { BlockConnections } from "./BlockConnections";
import type { IConnectionBatch, IConnectionBatchItem } from "./batch";
import { Path2DLine, WebGLLine } from "./lines";
import type { ConnectionLine, TConnectionLineClass } from "./lines";
import { WebGLConnections } from "./webgl/WebGLConnections";
import { createFakeGL, installFakeWebGL2 } from "./webgl/fakeGL";
import type { TFakeGL, TFakeWebGL2 } from "./webgl/fakeGL";
import { createFragmentShader } from "./webgl/shaders";

/** Records registrations, like a WebGL batch would, without a graphics API. */
class FakeBatch implements IConnectionBatch {
  public readonly items = new Map<IConnectionBatchItem, TBatchParams>();

  public add(item: IConnectionBatchItem, params: TBatchParams): void {
    this.items.set(item, { ...params });
  }

  public update(item: IConnectionBatchItem, params: TBatchParams): void {
    this.items.set(item, { ...params });
  }

  public delete(item: IConnectionBatchItem): void {
    this.items.delete(item);
  }

  public has(item: IConnectionBatchItem): boolean {
    return this.items.has(item);
  }

  public markDirty(): void {}

  public markBoundsDirty(): void {}

  public forEachItem(visit: (item: IConnectionBatchItem, params: TBatchParams) => void): void {
    for (const [item, params] of this.items) visit(item, params);
  }
}

class GLConnection extends BlockConnection<TConnection> {
  public static override line: TConnectionLineClass = WebGLLine;
}

type TBlockConnectionsInternals = {
  batch: IConnectionBatch;
  switchBatch(next: IConnectionBatch): void;
};

const FALLBACK_WARNING = "[@gravity-ui/graph] WebGL2 is unavailable";

function frames(count = 3): void {
  for (let i = 0; i < count; i++) globalScheduler.performUpdate();
}

function mount(settings: Record<string, unknown> = {}, root = document.createElement("div")): Graph {
  Object.defineProperties(root, { clientWidth: { value: 1000 }, clientHeight: { value: 800 } });
  const graph = new Graph(
    {
      connections: [
        { id: "a", sourcePortId: "a-source", targetPortId: "a-target" },
        { id: "b", sourcePortId: "b-source", targetPortId: "b-target" },
      ],
      settings: { useBezierConnections: false, showConnectionArrows: true, ...settings },
    },
    root
  );
  for (const [id, y] of [
    ["a", 100],
    ["b", 300],
  ] as const) {
    const state = graph.connections.getConnectionState(id);
    if (!state) throw new Error(`Expected connection ${id}`);
    state.$sourcePortState.value.updatePort({ x: 100, y, lookup: false });
    state.$targetPortState.value.updatePort({ x: 400, y, lookup: false });
  }
  graph.cameraService.set({ width: 1000, height: 800, x: 0, y: 0, scale: 1 });
  graph.start();
  frames();
  return graph;
}

/** A root in the document: the WebGL renderer is created once the graph layer's canvas is connected. */
function attachedRoot(): HTMLDivElement {
  const root = document.createElement("div");
  document.body.appendChild(root);
  return root;
}

function view(graph: Graph, id: string): BlockConnection<TConnection> {
  const component = graph.connections.getConnectionState(id)?.getViewComponent();
  if (!(component instanceof BlockConnection)) throw new Error(`Expected connection view ${id}`);
  return component;
}

function lineOf(connection: BlockConnection<TConnection>): ConnectionLine {
  return (connection as unknown as { line: ConnectionLine }).line;
}

function internals(graph: Graph): TBlockConnectionsInternals {
  return view(graph, "a").getParent() as unknown as BlockConnections & TBlockConnectionsInternals;
}

function rendererOf(graph: Graph): TConnectionsRendererState {
  return graph.getGraphLayer().$connectionsRenderer.value;
}

/** The items of the batch: a line and an arrow per connection, the lines of the current views. */
function expectCurrentItems(graph: Graph, LineClass: typeof Path2DLine | typeof WebGLLine): void {
  const batch = internals(graph).batch;
  const items: IConnectionBatchItem[] = [];
  batch.forEachItem((item) => items.push(item));
  const lines = [lineOf(view(graph, "a")), lineOf(view(graph, "b"))];
  expect(lines.every((line) => line instanceof LineClass)).toBe(true);
  expect(new Set(items)).toEqual(new Set(lines.flatMap((line) => [line, line.arrow])));
  expect(view(graph, "a").context.batch).toBe(batch);
}

function fallbackWarnings(warn: jest.SpyInstance): string[] {
  return warn.mock.calls.map(([message]) => String(message)).filter((message) => message.startsWith(FALLBACK_WARNING));
}

/** Canvases at the graph layer's z-index: the layer's own and, while WebGL draws or waits for a restore, WebGL's. */
function graphLevelCanvases(graph: Graph, root: HTMLElement): HTMLCanvasElement[] {
  const zIndex = graph.getGraphLayer().getCanvas().style.zIndex;
  return Array.from(root.querySelectorAll("canvas")).filter((canvas) => canvas.style.zIndex === zIndex);
}

function webglCanvas(fake: TFakeGL): HTMLCanvasElement {
  if (!fake.canvas) throw new Error("Expected the WebGL canvas");
  return fake.canvas;
}

describe("BlockConnections batch switching", () => {
  let graph: Graph | undefined;
  afterEach(() => {
    graph?.unmount();
    graph = undefined;
    document.body.innerHTML = "";
  });

  it("moves every line and arrow into the next batch, which every connection then uses", () => {
    graph = mount();
    const connections = internals(graph);
    const registered = new Map<IConnectionBatchItem, TBatchParams>();
    connections.batch.forEachItem((item, params) => registered.set(item, { ...params }));
    // A line and an arrow per connection.
    expect(registered.size).toBe(4);

    const fake = new FakeBatch();
    connections.switchBatch(fake);

    expect(fake.items).toEqual(registered);
    expect(connections.batch).toBe(fake);
    expect(view(graph, "a").context.batch).toBe(fake);
    expect(view(graph, "b").context.batch).toBe(fake);

    // Later changes reach the new batch: hiding arrows deletes them from it.
    graph.updateSettings({ showConnectionArrows: false });
    frames();
    expect(fake.items.size).toBe(2);
    expect(fake.has(lineOf(view(graph, "a")))).toBe(true);
    expect(fake.has(lineOf(view(graph, "b")))).toBe(true);
  });
});

describe("BlockConnections renderer from the line class", () => {
  let graph: Graph | undefined;
  let installed: TFakeWebGL2 | undefined;
  let warn: jest.SpyInstance;

  beforeEach(() => {
    warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    graph?.unmount();
    graph = undefined;
    installed?.restore();
    installed = undefined;
    document.body.innerHTML = "";
    jest.restoreAllMocks();
  });

  it("draws with Path2D and reports canvas for the default line class", () => {
    installed = installFakeWebGL2();
    graph = mount({}, attachedRoot());

    expect(internals(graph).batch).toBeInstanceOf(BatchPath2DRenderer);
    expect(installed.contexts).toHaveLength(0);
    expect(rendererOf(graph)).toBe("canvas");
  });

  it("picks WebGL for a WebGL line class before children compute geometry, so mounting builds each once", () => {
    installed = installFakeWebGL2();
    const updatePoints = jest.spyOn(BlockConnection.prototype as unknown as { updatePoints(): void }, "updatePoints");
    graph = mount({ connection: GLConnection }, attachedRoot());
    const counts: number[] = [updatePoints.mock.calls.length];
    for (let i = 0; i < 3; i++) {
      frames(1);
      counts.push(updatePoints.mock.calls.length);
    }

    expect(internals(graph).batch).toBeInstanceOf(WebGLConnections);
    // Two connections: both build once at mount and nothing rebuilds on the next frames.
    expect(counts).toEqual([2, 2, 2, 2]);
    expectCurrentItems(graph, WebGLLine);
    expect(rendererOf(graph)).toBe("webgl");
    expect(installed.contexts).toHaveLength(1);
    expect(installed.contexts[0].draws.length).toBeGreaterThan(0);
    expect(fallbackWarnings(warn)).toEqual([]);
  });

  it("waits for the graph layer's canvas to be in the document before it creates the WebGL renderer", () => {
    installed = installFakeWebGL2();
    graph = mount({ connection: GLConnection });

    expect(installed.contexts).toHaveLength(0);
    expect(internals(graph).batch).toBeInstanceOf(BatchPath2DRenderer);
    expect(fallbackWarnings(warn)).toEqual([]);
  });

  it("falls back to Path2D once without WebGL2: the Path2D batch draws the WebGL lines", () => {
    const create = jest.fn((): TFakeGL | null => null);
    installed = installFakeWebGL2(create);
    const root = attachedRoot();
    graph = mount({ connection: GLConnection }, root);
    frames();

    expect(internals(graph).batch).toBeInstanceOf(BatchPath2DRenderer);
    expectCurrentItems(graph, WebGLLine);
    expect(rendererOf(graph)).toBe("webgl-fallback");
    // One attempt, one warning, and no canvas left behind.
    expect(create).toHaveBeenCalledTimes(1);
    expect(fallbackWarnings(warn)).toEqual([
      "[@gravity-ui/graph] WebGL2 is unavailable (no WebGL2); connections are drawn with Path2D using each effect's " +
        "fallback stroke.",
    ]);
    expect(graphLevelCanvases(graph, root)).toEqual([graph.getGraphLayer().getCanvas()]);
  });

  it("switches the renderer when the connection class changes at runtime", () => {
    installed = installFakeWebGL2();
    graph = mount({ connection: GLConnection }, attachedRoot());
    const [first] = installed.contexts;
    expect(rendererOf(graph)).toBe("webgl");

    graph.updateSettings({ connection: BlockConnection });
    // One frame: the batch switches and every connection remounts with its new line in the same preparation.
    frames(1);

    expect(internals(graph).batch).toBeInstanceOf(BatchPath2DRenderer);
    expectCurrentItems(graph, Path2DLine);
    expect(rendererOf(graph)).toBe("canvas");
    // The WebGL renderer is gone: its canvas left the document and its context is freed.
    expect(webglCanvas(first).isConnected).toBe(false);
    expect(first.gl.isContextLost()).toBe(true);

    graph.updateSettings({ connection: GLConnection });
    frames(1);

    expect(internals(graph).batch).toBeInstanceOf(WebGLConnections);
    expectCurrentItems(graph, WebGLLine);
    expect(rendererOf(graph)).toBe("webgl");
    expect(installed.contexts).toHaveLength(2);
    expect(webglCanvas(installed.contexts[1]).isConnected).toBe(true);
    expect(fallbackWarnings(warn)).toEqual([]);
  });

  it("falls back on a lost context and returns to WebGL with a fresh renderer after the restore", () => {
    installed = installFakeWebGL2();
    const root = attachedRoot();
    graph = mount({ connection: GLConnection }, root);
    const [lost] = installed.contexts;
    const lostCanvas = webglCanvas(lost);

    lost.loseContext();
    const lostEvent = new Event("webglcontextlost", { cancelable: true });
    lostCanvas.dispatchEvent(lostEvent);

    // The default is prevented, so the browser may restore the context.
    expect(lostEvent.defaultPrevented).toBe(true);
    expect(internals(graph).batch).toBeInstanceOf(BatchPath2DRenderer);
    expectCurrentItems(graph, WebGLLine);
    expect(rendererOf(graph)).toBe("webgl-fallback");
    expect(fallbackWarnings(warn)).toEqual([
      "[@gravity-ui/graph] WebGL2 is unavailable (context lost); connections are drawn with Path2D using each " +
        "effect's fallback stroke.",
    ]);
    // The lost renderer waits for the restore: its canvas stays and no other context is created meanwhile.
    frames();
    expect(lostCanvas.isConnected).toBe(true);
    expect(installed.contexts).toHaveLength(1);

    lost.restoreContext();
    lostCanvas.dispatchEvent(new Event("webglcontextrestored"));

    // The lost renderer is disposed at once: its canvas leaves the document and the restored context is freed.
    expect(lostCanvas.isConnected).toBe(false);
    expect(lost.gl.isContextLost()).toBe(true);

    frames(1);

    expect(internals(graph).batch).toBeInstanceOf(WebGLConnections);
    expectCurrentItems(graph, WebGLLine);
    expect(rendererOf(graph)).toBe("webgl");
    expect(installed.contexts).toHaveLength(2);
    expect(graphLevelCanvases(graph, root)).toEqual([
      webglCanvas(installed.contexts[1]),
      graph.getGraphLayer().getCanvas(),
    ]);
    expect(fallbackWarnings(warn)).toHaveLength(1);

    // The disposed renderer no longer listens to its canvas.
    lostCanvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true }));
    expect(rendererOf(graph)).toBe("webgl");
  });

  it("frees a lost renderer when the connection class switches to Path2D", () => {
    installed = installFakeWebGL2();
    graph = mount({ connection: GLConnection }, attachedRoot());
    const [lost] = installed.contexts;
    const lostCanvas = webglCanvas(lost);
    lost.loseContext();
    lostCanvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true }));

    graph.updateSettings({ connection: BlockConnection });
    frames();

    expect(lostCanvas.isConnected).toBe(false);
    expect(rendererOf(graph)).toBe("canvas");
    // A restore of the freed context changes nothing.
    lost.restoreContext();
    lostCanvas.dispatchEvent(new Event("webglcontextrestored"));
    frames();
    expect(internals(graph).batch).toBeInstanceOf(BatchPath2DRenderer);
    expect(installed.contexts).toHaveLength(1);
  });

  it("falls back with the compiler log when the plain line program fails to compile", () => {
    const plain = createFragmentShader();
    const create = jest.fn(
      (): TFakeGL => createFakeGL({ compileError: (source) => (source === plain ? "ERROR: 0:12: bad" : undefined) })
    );
    installed = installFakeWebGL2(create);
    const root = attachedRoot();
    graph = mount({ connection: GLConnection }, root);
    frames();

    expect(internals(graph).batch).toBeInstanceOf(BatchPath2DRenderer);
    expectCurrentItems(graph, WebGLLine);
    expect(rendererOf(graph)).toBe("webgl-fallback");
    expect(fallbackWarnings(warn)).toEqual([
      "[@gravity-ui/graph] WebGL2 is unavailable (shaders failed: ERROR: 0:12: bad); connections are drawn with " +
        "Path2D using each effect's fallback stroke.",
    ]);
    // One attempt; its context is freed and its canvas never joins the document.
    expect(create).toHaveBeenCalledTimes(1);
    expect(installed.contexts[0].gl.isContextLost()).toBe(true);
    expect(graphLevelCanvases(graph, root)).toEqual([graph.getGraphLayer().getCanvas()]);
  });

  it("tries WebGL again after a fallback once the requested renderer changes", () => {
    let available = false;
    installed = installFakeWebGL2(() => (available ? createFakeGL() : null));
    graph = mount({ connection: GLConnection }, attachedRoot());
    expect(rendererOf(graph)).toBe("webgl-fallback");

    available = true;
    graph.updateSettings({ connection: BlockConnection });
    frames();
    graph.updateSettings({ connection: GLConnection });
    frames();

    expect(internals(graph).batch).toBeInstanceOf(WebGLConnections);
    expect(rendererOf(graph)).toBe("webgl");
    expect(fallbackWarnings(warn)).toHaveLength(1);
  });

  it("frees the WebGL renderer when the graph unmounts", () => {
    installed = installFakeWebGL2();
    graph = mount({ connection: GLConnection }, attachedRoot());
    const [context] = installed.contexts;

    graph.unmount();
    graph = undefined;

    expect(webglCanvas(context).isConnected).toBe(false);
    expect(context.gl.isContextLost()).toBe(true);
  });
});
