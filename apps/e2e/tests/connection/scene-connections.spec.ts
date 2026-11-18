import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import type { TMultipointConnection, TPoint } from "@gravity-ui/graph";

import { GraphPageObject } from "../../page-objects/GraphPageObject";
import { ReactGraphPageObject } from "../../page-objects/ReactGraphPageObject";

type TSample = {
  x: number;
  y: number;
  width: number;
  height: number;
  rgb: [number, number, number];
};

const SHAFT: TSample = { x: 240, y: 138, width: 20, height: 4, rgb: [255, 32, 32] };
const OPEN_ARROW: TSample = { x: 371, y: 131, width: 5, height: 6, rgb: SHAFT.rgb };
const START = { id: "from", is: "Block", name: "From", x: 60, y: 120, width: 80, height: 40, anchors: [] };
const END = { id: "to", is: "Block", name: "To", x: 620, y: 120, width: 80, height: 40, anchors: [] };
const CONNECTION = { id: "edge", sourceBlockId: START.id, targetBlockId: END.id, styles: { background: "#ff2020" } };
const VIEW = { width: 800, height: 600 };

test.use({ viewport: VIEW, deviceScaleFactor: 2 });

interface TWebGLProbeWindow extends Window {
  sceneTestContexts: Set<WebGL2RenderingContext>;
  sceneTestLoss?: WEBGL_lose_context;
  sceneTestMixedTarget?: WebGLFramebuffer;
  sceneTestMixedContext?: WebGL2RenderingContext;
  sceneTestMixedBackend?: object;
  sceneTestMixedPixels?: Uint8Array;
}

async function trackWebGLContexts(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const win = window as unknown as TWebGLProbeWindow;
    win.sceneTestContexts = new Set();
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, ...args: unknown[]) {
      const context = Reflect.apply(original, this, args) as RenderingContext | null;
      if (args[0] === "webgl2" && context) win.sceneTestContexts.add(context as WebGL2RenderingContext);
      return context;
    } as typeof original;
  });
}

/** Read the scene canvas itself so a legacy connection canvas cannot make the test pass. */
async function sampleScene(page: Page, samples: TSample[], exportImage = false): Promise<number[]> {
  return page.evaluate(
    ({ regions, exportImage: exported, view }) => {
      const { scene, scheduler } = window.graph;
      const layer = scene.layer;
      layer.performRender();
      scheduler.performUpdate();

      const gl =
        !exported && scene.$renderer.value === "webgl" ? layer.getBackend()?.canvas.getContext("webgl2") : undefined;
      const canvas = exported
        ? scene.toImage({ rect: { x: 0, y: 0, ...view }, pixelRatio: 2 })
        : gl?.canvas ?? layer.getCanvas();
      if (!(canvas instanceof HTMLCanvasElement)) throw new Error("Scene canvas is missing");
      const dpr = canvas.width / view.width;
      const ctx = gl ? undefined : canvas.getContext("2d");
      return regions.map(({ x, y, width, height, rgb }) => {
        const left = Math.round(x * dpr);
        const top = Math.round(y * dpr);
        const w = Math.round(width * dpr);
        const h = Math.round(height * dpr);
        let data: Uint8Array | Uint8ClampedArray;
        if (gl) {
          data = new Uint8Array(w * h * 4);
          gl.readPixels(left, gl.drawingBufferHeight - top - h, w, h, gl.RGBA, gl.UNSIGNED_BYTE, data);
        } else {
          if (!ctx) throw new Error("Canvas renderer is missing");
          data = ctx.getImageData(left, top, w, h).data;
        }
        let count = 0;
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3] > 240 && rgb.every((part, channel) => Math.abs(part - data[i + channel]) <= 16)) count++;
        }
        return count;
      });
    },
    { regions: samples, exportImage, view: VIEW }
  );
}

async function connectionHit(page: Page, point: TPoint): Promise<boolean> {
  return page.evaluate(
    ({ position, id }) => {
      const graph = window.graph;
      const target = graph.getElementOverPoint(position);
      return (
        target !== undefined && target === graph.rootStore.connectionsList.getConnectionState(id)?.getViewComponent()
      );
    },
    { position: point, id: CONNECTION.id }
  );
}

async function centerOrigin(graph: GraphPageObject): Promise<void> {
  await graph.evaluate((graph) => graph.cameraService.set({ x: 0, y: 0, scale: 1 }));
  await graph.waitForFrames(3);
}

async function expectRenderer(page: Page, state: string): Promise<void> {
  await expect.poll(() => page.evaluate(() => window.graph.scene.$renderer.value)).toBe(state);
}

async function hasWebGL2(page: Page): Promise<boolean> {
  return page.evaluate(() => Boolean(document.createElement("canvas").getContext("webgl2")));
}

async function attachedWebGLContexts(page: Page): Promise<number> {
  return page.evaluate(() => {
    const root = document.getElementById("root");
    return [...(window as unknown as TWebGLProbeWindow).sceneTestContexts].filter(
      (gl) => root?.contains(gl.canvas as Node) && !gl.isContextLost()
    ).length;
  });
}

test("the built-in straight connection draws and exports its shaft, arrow and label together", async ({ page }) => {
  const graph = new GraphPageObject(page);
  await graph.initialize({
    blocks: [START, END],
    connections: [{ ...CONNECTION, label: "Edge label" }],
    settings: {
      renderer: "canvas",
      useBezierConnections: false,
      showConnectionArrows: true,
      showConnectionLabels: true,
    },
  });
  await graph.evaluate((graph) => graph.setColors({ connectionLabel: { background: "#4020e0", text: "#209040" } }));
  await centerOrigin(graph);

  const labelBounds = await page.evaluate(() => {
    const view = window.graph.rootStore.connectionsList.getConnectionState("edge")?.getViewComponent();
    return view instanceof window.GraphModule.BlockConnection ? view.getLabelBounds() : undefined;
  });
  if (!labelBounds) throw new Error("The connection label has no bounds");
  const [x, y, right, bottom] = labelBounds;
  const label = { x, y, width: right - x, height: bottom - y };
  const labelBg: TSample = { ...label, rgb: [64, 32, 224] };
  const labelText: TSample = { ...label, rgb: [32, 144, 64] };
  for (const exported of [false, true]) {
    const [shaft, arrow, background, text] = await sampleScene(page, [SHAFT, OPEN_ARROW, labelBg, labelText], exported);
    expect(shaft, "connection shaft").toBeGreaterThan(12);
    expect(arrow, "open arrow away from the shaft").toBeGreaterThan(2);
    expect(background, "label background").toBeGreaterThan(10);
    expect(text, "label text").toBeGreaterThan(10);
  }
  expect(await connectionHit(page, { x: 250, y: 140 })).toBe(true);
  expect(await connectionHit(page, { x: (x + right) / 2, y: (y + bottom) / 2 })).toBe(true);
  expect(await connectionHit(page, { x: 250, y: 110 })).toBe(false);
  await graph.clickAt({ x: 250, y: 140 });
  expect(await graph.connection(CONNECTION.id).isSelected()).toBe(true);
});

test("built-in Béziers keep both orientations in the WebGL scene", async ({ page }) => {
  const graph = new GraphPageObject(page);
  await graph.initialize({
    blocks: [START, { ...END, y: 320 }],
    connections: [CONNECTION],
    settings: { renderer: "webgl", useBezierConnections: true, showConnectionArrows: true },
  });
  test.skip(!(await hasWebGL2(page)), "WebGL2 unavailable");
  await centerOrigin(graph);
  await expectRenderer(page, "webgl");

  // At t=1/4 the horizontal curve is (282.5, 171.25), while the vertical curve is (215, 238.75).
  const horizontal: TSample = { ...SHAFT, x: 278, y: 167, width: 9, height: 9 };
  const vertical: TSample = { ...horizontal, x: 211, y: 234 };
  const [horizontalCount, beforeVertical] = await sampleScene(page, [horizontal, vertical]);
  expect(horizontalCount).toBeGreaterThan(12);
  expect(beforeVertical).toBe(0);
  expect(await connectionHit(page, { x: 282.5, y: 171.25 })).toBe(true);

  await graph.evaluate((graph) => graph.updateSettings({ bezierConnectionDirection: "vertical" }));
  await graph.waitForFrames(3);
  const [afterHorizontal, verticalCount] = await sampleScene(page, [horizontal, vertical]);
  expect(afterHorizontal).toBe(0);
  expect(verticalCount).toBeGreaterThan(12);
  expect(await connectionHit(page, { x: 215, y: 238.75 })).toBe(true);
});

for (const renderer of ["canvas", "webgl"] as const) {
  test(`setEntities restores the fresh snapshot's ports, label and hits in ${renderer}`, async ({ page }) => {
    const graph = new ReactGraphPageObject(page);
    const source = { id: "source", is: "Block", x: 60, y: 120, width: 80, height: 40, name: "New source" };
    const edge = { ...CONNECTION, sourceBlockId: source.id };
    const settings = { renderer, useBezierConnections: false, showConnectionLabels: true };
    const final = { blocks: [source, END], connections: [edge], settings };
    await graph.initialize({
      blocks: [
        { ...source, y: 320, name: "Old source", anchors: [{ id: "out", blockId: source.id, type: "OUT" }] },
        END,
      ],
      connections: [{ ...edge, sourcePortId: "source/out", label: "Old label" }],
      settings,
    });
    test.skip(renderer === "webgl" && !(await hasWebGL2(page)), "WebGL2 unavailable");
    await expectRenderer(page, renderer);
    await centerOrigin(graph);
    await expect(page.getByTestId("block-source")).toHaveText("Old source");

    const read = () =>
      page.evaluate(() => {
        const { graph, GraphModule } = window;
        const edgeState = graph.connections.getConnectionState("edge");
        const view = edgeState?.getViewComponent();
        if (!edgeState || !(view instanceof GraphModule.BlockConnection)) throw new Error("Missing edge view");
        return {
          port: edgeState.$sourcePortId.value,
          geometry: edgeState.$geometry.value,
          hasLabel: Boolean(view.getLabelBounds()),
          anchors: graph.api.getBlockById("source")?.anchors?.map((anchor) => anchor.id) ?? [],
        };
      });
    const old = await read();
    expect(old).toMatchObject({ port: "source/out", hasLabel: true, anchors: ["out"] });
    if (!old.geometry) throw new Error("Missing old route");
    const [start, end] = old.geometry;
    const oldShaft = { x: (3 * start.x + end.x) / 4, y: (3 * start.y + end.y) / 4 };
    expect(await connectionHit(page, oldShaft)).toBe(true);

    const rendered = async () => ({
      ...(await read()),
      hitsOld: await connectionHit(page, oldShaft),
      hitsNew: await connectionHit(page, { x: 250, y: 140 }),
      redPixels: (await sampleScene(page, [SHAFT]))[0],
    });
    await graph.setEntities(final);
    await graph.waitForFrames(3);
    await expect(page.getByTestId("block-source")).toHaveText("New source");
    const replaced = await rendered();

    await graph.initialize(final);
    await expectRenderer(page, renderer);
    await centerOrigin(graph);
    const fresh = await rendered();
    expect(fresh).toMatchObject({ port: "source_output", hasLabel: false, anchors: [], hitsOld: false, hitsNew: true });
    expect(fresh.redPixels).toBeGreaterThan(12);
    expect(replaced).toEqual(fresh);
  });

  test(`the ${renderer} scene applies a tagged stroke width at the current zoom`, async ({ page }) => {
    const graph = new GraphPageObject(page);
    await graph.initialize({
      blocks: [START, END],
      connections: [CONNECTION],
      settings: { renderer, useBezierConnections: false },
    });
    test.skip(renderer === "webgl" && !(await hasWebGL2(page)), "WebGL2 unavailable");
    await centerOrigin(graph);
    await expectRenderer(page, renderer);
    await page.evaluate(() => {
      const { BlockConnection, defineTag } = window.GraphModule;
      const wide = defineTag("e2e-wide-line");
      window.graph.scene.styles.add([
        {
          target: BlockConnection,
          tags: [wide],
          style: { parts: { line: { width: { px: 20, maxWorld: 80 } } } },
        },
      ]);
      window.graph.scene.tags.add(wide, { connection: ["edge"] });
    });

    for (const scale of [1, 0.5, 0.125]) {
      await graph.evaluate((graph, zoom) => graph.cameraService.set({ x: 0, y: 0, scale: zoom }), scale);
      await graph.waitForFrames(3);
      const center = { ...SHAFT, x: Math.round(250 * scale), y: Math.floor(140 * scale), width: 4, height: 1 };
      const at = (offset: number): TSample => ({ ...center, y: center.y + offset });
      const [inner, outer, outside] = await sampleScene(page, [at(3), at(8), at(11)]);
      expect(inner).toBeGreaterThan(8);
      if (scale === 0.125) expect(outer).toBe(0);
      else expect(outer).toBeGreaterThan(8);
      expect(outside).toBe(0);
    }
  });
}

test("the built-in WebGLLine shares the scene context and remains drawable through loss and restore", async ({
  page,
}) => {
  await trackWebGLContexts(page);

  const graph = new GraphPageObject(page);
  await graph.initialize({
    blocks: [START, END],
    connections: [{ ...CONNECTION, label: "Edge label" }],
    settings: {
      renderer: "webgl",
      useBezierConnections: false,
      showConnectionArrows: true,
      showConnectionLabels: true,
    },
  });
  test.skip(!(await hasWebGL2(page)), "WebGL2 unavailable");
  await page.evaluate(() => {
    const { BlockConnection, WebGLLine } = window.GraphModule;
    class BuiltInWebGLConnection extends BlockConnection {
      public static override line = WebGLLine;
    }
    window.graph.updateSettings({ connection: BuiltInWebGLConnection });
    window.graph.setColors({ connectionLabel: { background: "#4020e0", text: "#209040" } });
  });
  await centerOrigin(graph);
  await expectRenderer(page, "webgl");
  expect(await attachedWebGLContexts(page)).toBe(1);

  // The label sits left and above the target, outside the block and away from the shaft.
  const label: TSample = { x: 485, y: 90, width: 132, height: 48, rgb: [32, 144, 64] };
  const assertDrawing = async (): Promise<void> => {
    const [shaft, arrow, text] = await sampleScene(page, [SHAFT, OPEN_ARROW, label]);
    expect(shaft, "connection shaft").toBeGreaterThan(12);
    expect(arrow, "open arrow away from the shaft").toBeGreaterThan(2);
    expect(text, "label text").toBeGreaterThan(10);
    expect(await connectionHit(page, { x: 250, y: 140 })).toBe(true);
  };
  await assertDrawing();

  const extensionAvailable = await page.evaluate(() => {
    const win = window as unknown as TWebGLProbeWindow;
    const gl = window.graph.scene.layer.getBackend()?.canvas.getContext("webgl2");
    win.sceneTestLoss = gl?.getExtension("WEBGL_lose_context") ?? undefined;
    win.sceneTestLoss?.loseContext();
    return Boolean(win.sceneTestLoss);
  });
  expect(extensionAvailable, "WEBGL_lose_context is required to exercise recovery").toBe(true);
  await expectRenderer(page, "lost");
  expect(await attachedWebGLContexts(page)).toBe(0);
  await assertDrawing();

  await page.evaluate(() => (window as unknown as TWebGLProbeWindow).sceneTestLoss?.restoreContext());
  await expectRenderer(page, "webgl");
  expect(await attachedWebGLContexts(page)).toBe(1);
  await assertDrawing();

  await graph.evaluate((graph) => graph.updateSettings({ renderer: "canvas" }));
  await expectRenderer(page, "canvas");
  expect(await attachedWebGLContexts(page)).toBe(0);
  await assertDrawing();
});

test("reconnecting a resident line reuses its order and mixed plan, while paint width and depth still gate the plane", async ({
  page,
}) => {
  const graph = new GraphPageObject(page);
  await graph.initialize({
    blocks: [],
    connections: [
      { id: "edge", sourcePortId: "source", targetPortId: "target", styles: { background: "rgba(255,32,32,0.7)" } },
    ],
    settings: {
      renderer: "webgl",
      useBezierConnections: false,
      showConnectionArrows: false,
      showConnectionLabels: false,
    },
  });
  test.skip(!(await hasWebGL2(page)), "WebGL2 unavailable");
  await expectRenderer(page, "webgl");
  await centerOrigin(graph);
  const result = await page.evaluate(async () => {
    const { graph, GraphModule } = window;
    const { scene, cameraService, scheduler, connections } = graph;
    const state = connections.getConnectionState("edge")!;
    state.$sourcePortState.value.updatePort({ x: 100, y: 100, lookup: false });
    state.$targetPortState.value.updatePort({ x: 400, y: 100, lookup: false });
    const alternate = connections.observePort("alternate", scene);
    alternate.updatePort({ x: 400, y: 180, lookup: false });
    const segment = new Float32Array(GraphModule.lineSegment({ x: 100, y: 260 }, { x: 400, y: 260 }));
    const stroke = (width: number) => ({
      kind: "path" as const,
      segments: segment,
      stroke: { color: "#3456ab", width },
    });
    scene.store.add({
      id: "opaque-stroke",
      entityType: "connection",
      x: 0,
      y: 0,
      zIndex: 0,
      bounds: { minX: 95, minY: 250, maxX: 405, maxY: 270 },
      primitives: [stroke(0.125)],
    });
    const backend = scene.layer.getBackend()!;
    const probe = backend as typeof backend & {
      hasMixedVertexWork(): boolean;
      prepareMixedPlane(...args: unknown[]): unknown;
      stockOrder?: { ordered: object };
      mixedPlan?: { plan?: object };
      pathGroupsOf: Map<string, Set<{ lines: { ranges: { revision: number } } }>>;
    };
    // Route the small fixture through the same mixed pass as a large graph.
    probe.hasMixedVertexWork = () => true;
    const prepare = probe.prepareMixedPlane;
    let usedMixed = false;
    probe.prepareMixedPlane = function (...args) {
      const result = prepare.apply(this, args);
      usedMixed = Boolean(result);
      return result;
    };
    const gl = backend.canvas.getContext("webgl2")!;
    const frame = {
      ...cameraService.getCameraState(),
      level: scene.$level.peek(),
      dpr: 2,
      time: 1.234,
      dimColor: scene.store.getDimColor(),
    };
    const render = () => {
      scene.layer.performRender();
      scheduler.performUpdate();
      backend.draw(frame);
      return usedMixed;
    };
    const pixels = () => {
      const column = new Uint8Array(190 * 4);
      gl.readPixels(500, gl.drawingBufferHeight - 360, 1, 190, gl.RGBA, gl.UNSIGNED_BYTE, column);
      return column;
    };
    await new Promise(requestAnimationFrame);
    const initial = render();
    const [opaque] = probe.pathGroupsOf.get("opaque-stroke")!;
    const revision = opaque.lines.ranges.revision;
    scene.store.update("opaque-stroke", { primitives: [stroke(0.125)] });
    render();
    const samePayload = opaque.lines.ranges.revision === revision;
    const order = probe.stockOrder?.ordered;
    const plan = probe.mixedPlan?.plan;
    const original = pixels();
    graph.api.updateConnection("edge", { targetPortId: "alternate" });
    await new Promise(requestAnimationFrame);
    const reconnected = render();
    const actual = pixels();
    const sameOrder = Boolean(order) && order === probe.stockOrder?.ordered;
    const samePlan = Boolean(plan) && plan === probe.mixedPlan?.plan;
    probe.stockOrder = undefined;
    probe.mixedPlan = undefined;
    render();
    const fresh = pixels();
    scene.store.update("opaque-stroke", { primitives: [stroke(5)] });
    const wide = render();
    scene.store.update("opaque-stroke", { primitives: [stroke(0.125)] });
    const narrow = render();
    scene.store.add({
      id: "cover",
      x: 0,
      y: 0,
      zIndex: -1000000,
      bounds: { minX: 30, minY: 30, maxX: 70, maxY: 70 },
      primitives: [{ kind: "rect", x: 30, y: 30, width: 40, height: 40, fill: "#111111" }],
    });
    const interleaved = render();
    scene.store.update("cover", { zIndex: 1000000 });
    const separated = render();
    connections.unobservePort("alternate", scene);
    return {
      initial,
      samePayload,
      reconnected,
      sameOrder,
      samePlan,
      wide,
      narrow,
      interleaved,
      separated,
      changedStroke: actual.some((value, i) => original[i] !== value),
      matchesFresh: actual.every((value, i) => fresh[i] === value),
      error: gl.getError(),
    };
  });
  expect(result).toEqual({
    initial: true,
    samePayload: true,
    reconnected: true,
    sameOrder: true,
    samePlan: true,
    wide: false,
    narrow: true,
    interleaved: false,
    separated: true,
    changedStroke: true,
    matchesFresh: true,
    error: 0,
  });
});

test("the mixed connection plane recreates its framebuffer and fixed-time image after context restoration", async ({
  page,
}) => {
  await trackWebGLContexts(page);
  const graph = new GraphPageObject(page);
  await graph.initialize({
    blocks: [START, { ...END, y: 320 }],
    connections: [CONNECTION],
    settings: {
      renderer: "webgl",
      useBezierConnections: true,
      showConnectionArrows: false,
      showConnectionLabels: false,
    },
  });
  test.skip(!(await hasWebGL2(page)), "WebGL2 unavailable");
  await centerOrigin(graph);
  await expectRenderer(page, "webgl");
  await page.evaluate(() => {
    const { BlockConnection, dashFlow } = window.GraphModule;
    window.graph.scene.styles.add([
      {
        target: BlockConnection,
        style: { parts: { line: { effect: dashFlow.use({ pattern: [12, 8], speed: 30 }) } } },
      },
    ]);
  });
  await graph.waitForFrames(3);

  const capture = () =>
    page.evaluate(() => {
      const win = window as unknown as TWebGLProbeWindow;
      const { scene, scheduler, cameraService } = window.graph;
      scene.layer.performRender();
      scheduler.performUpdate();
      const backend = scene.layer.getBackend();
      if (!backend) throw new Error("The WebGL backend is missing");
      const probe = backend as typeof backend & {
        hasMixedVertexWork(): boolean;
        mixedTarget?: { handle: WebGLFramebuffer };
      };
      // Exercise the real mixed pass on a small fixture; only its performance cutoff is bypassed.
      probe.hasMixedVertexWork = () => true;
      backend.draw({ ...cameraService.getCameraState(), dpr: 2, time: 1.234, dimColor: scene.store.getDimColor() });
      const gl = backend.canvas.getContext("webgl2");
      const target = probe.mixedTarget?.handle;
      if (!gl || !target || !gl.isFramebuffer(target)) throw new Error("The mixed framebuffer was not created");
      const pixels = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
      gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      const original = (win.sceneTestMixedPixels ??= pixels);
      if (original.length !== pixels.length) throw new Error("The scene drawing buffer changed size");
      let differentBytes = 0;
      for (let i = 0; i < pixels.length; i++) if (pixels[i] !== original[i]) differentBytes++;
      const result = {
        image: backend.canvas.toDataURL(),
        differentBytes,
        drawCalls: backend.stats.drawCalls,
        newBackend: backend !== win.sceneTestMixedBackend,
        newTarget: target !== win.sceneTestMixedTarget,
        newContext: gl !== win.sceneTestMixedContext,
        error: gl.getError(),
      };
      win.sceneTestMixedBackend = backend;
      win.sceneTestMixedTarget = target;
      win.sceneTestMixedContext = gl;
      win.sceneTestLoss = gl.getExtension("WEBGL_lose_context") ?? undefined;
      return result;
    });

  const before = await capture();
  expect(before.error).toBe(0);
  expect(await attachedWebGLContexts(page)).toBe(1);

  // Shrink and refill the frame's command pool without rebuilding the backend or advancing the effect's clock.
  await graph.evaluate((each) => each.cameraService.set({ x: 10000, y: 10000 }));
  const away = await capture();
  expect(away.error).toBe(0);
  expect(away.newBackend).toBe(false);
  expect(away.newContext).toBe(false);
  expect(away.newTarget).toBe(false);
  expect(away.drawCalls, "offscreen paths leave the draw schedule").toBeLessThan(before.drawCalls);
  expect(away.differentBytes).toBeGreaterThan(0);

  await graph.evaluate((each) => each.cameraService.set({ x: 0, y: 0 }));
  for (let frame = 0; frame < 3; frame++) {
    const back = await capture();
    expect(back.error).toBe(0);
    expect(back.newBackend).toBe(false);
    expect(back.newContext).toBe(false);
    expect(back.newTarget).toBe(false);
    expect(back.drawCalls, `restored draw schedule, frame ${frame}`).toBe(before.drawCalls);
    expect(back.differentBytes, `fixed-time RGBA after pan, frame ${frame}`).toBe(0);
  }

  const extensionAvailable = await page.evaluate(() => {
    const extension = (window as unknown as TWebGLProbeWindow).sceneTestLoss;
    extension?.loseContext();
    return Boolean(extension);
  });
  expect(extensionAvailable, "WEBGL_lose_context is required to exercise recovery").toBe(true);
  await expectRenderer(page, "lost");
  expect(await attachedWebGLContexts(page)).toBe(0);

  await page.evaluate(() => (window as unknown as TWebGLProbeWindow).sceneTestLoss?.restoreContext());
  await expectRenderer(page, "webgl");
  const restored = await capture();
  expect(restored.error).toBe(0);
  expect(restored.newBackend).toBe(true);
  expect(restored.newContext).toBe(true);
  expect(restored.newTarget).toBe(true);
  expect(restored.differentBytes).toBe(0);
  expect(restored.image).toBe(before.image);
  expect(await attachedWebGLContexts(page)).toBe(1);

  await graph.evaluate((each) => each.updateSettings({ renderer: "canvas" }));
  await expectRenderer(page, "canvas");
  expect(await attachedWebGLContexts(page)).toBe(0);
});

test("a saved polyline with a filled arrow follows a CollapsibleGroup without rewriting its route", async ({
  page,
}) => {
  const connection: TMultipointConnection = {
    ...CONNECTION,
    points: [
      { x: 140, y: 140 },
      { x: 290, y: 370 },
      { x: 460, y: 370 },
      { x: 500, y: 450 },
      { x: 620, y: 450 },
    ],
  };
  const graph = new GraphPageObject(page);
  await graph.initialize({
    blocks: [
      { ...START, group: "group" },
      { ...END, y: 430 },
    ],
    connections: [connection],
    settings: { renderer: "webgl", showConnectionArrows: true, canDrag: "all", canDragCamera: false },
  });
  test.skip(!(await hasWebGL2(page)), "WebGL2 unavailable");
  await page.evaluate(() => {
    const { BlockGroups, CollapsibleGroup, MultipointConnection } = window.GraphModule;
    const graph = window.graph;
    graph.updateSettings({ connection: MultipointConnection });
    graph.addLayer(BlockGroups, { draggable: true });
    graph.rootStore.groupsList.setGroups([
      { id: "group", rect: { x: 40, y: 90, width: 160, height: 105 }, component: CollapsibleGroup },
    ]);
  });
  await centerOrigin(graph);
  await expectRenderer(page, "webgl");

  const bend: TSample = { ...SHAFT, x: 330, y: 368 };
  // Inside the triangle, more than one world unit away from the horizontal shaft at y=450.
  const arrow: TSample = { ...SHAFT, x: 607, y: 452, width: 2, height: 1 };
  // The midpoints of the first segment from the block port, collapsed group edge and dragged group edge.
  const expanded = { x: 215, y: 255 };
  const folded = { x: 275, y: 242 };
  const moved = { x: 300, y: 282 };
  const around = ({ x, y }: TPoint): TSample => ({ ...SHAFT, x: x - 3, y: y - 3, width: 6, height: 6 });
  const setCollapsed = async (collapsed: boolean): Promise<void> => {
    await page.evaluate((fold) => {
      const graph = window.graph;
      const group = graph.rootStore.groupsList.getGroupState("group")?.getViewComponent();
      if (!(group instanceof window.GraphModule.CollapsibleGroup)) throw new Error("CollapsibleGroup was not created");
      if (fold) group.collapse();
      else group.expand();
    }, collapsed);
    await graph.waitForFrames(3);
  };
  const assertRoute = async (here: TPoint, stale: TPoint): Promise<void> => {
    const [liveShaft, staleShaft, bendShaft, filledArrow] = await sampleScene(page, [
      around(here),
      around(stale),
      bend,
      arrow,
    ]);
    expect(liveShaft, "first segment follows the effective port").toBeGreaterThan(5);
    expect(staleShaft, "old first segment is cleared").toBe(0);
    expect(bendShaft, "saved interior bend remains in world coordinates").toBeGreaterThan(12);
    expect(filledArrow, "filled triangle away from the shaft").toBeGreaterThan(2);
    expect(await connectionHit(page, here)).toBe(true);
    expect(await connectionHit(page, stale)).toBe(false);
    expect(
      await page.evaluate(() => {
        const state = window.graph.rootStore.connectionsList.getConnectionState("edge")?.$state.value;
        return state && "points" in state ? state.points : undefined;
      })
    ).toEqual(connection.points);
  };

  await assertRoute(expanded, folded);
  await setCollapsed(true);
  await assertRoute(folded, expanded);
  await graph.drag({ x: 140, y: 114 }, { x: 190, y: 194 });
  await assertRoute(moved, folded);
  await setCollapsed(false);
  await assertRoute(expanded, moved);
});

test("a convex custom arrow keeps its fill and hit area in the WebGL scene", async ({ page }) => {
  const graph = new GraphPageObject(page);
  await graph.initialize({
    blocks: [START, END],
    connections: [CONNECTION],
    settings: { renderer: "webgl", useBezierConnections: false, showConnectionArrows: true },
  });
  test.skip(!(await hasWebGL2(page)), "WebGL2 unavailable");
  await page.evaluate(() => {
    const { BlockConnection, blockGeometry } = window.GraphModule;
    class CustomArrow extends BlockConnection {
      public static override geometry: typeof blockGeometry = (input) => {
        const result = blockGeometry(input);
        if (!result) return undefined;
        const { x, y } = input.target;
        return {
          ...result,
          arrow: {
            closed: true,
            points: new Float32Array([x, y, x - 40, y - 16, x - 65, y, x - 40, y + 17]),
          },
        };
      };
    }
    window.graph.updateSettings({ connection: CustomArrow });
  });
  await centerOrigin(graph);
  await expectRenderer(page, "webgl");

  const position = { x: 580, y: 129 };
  const [fill] = await sampleScene(page, [{ ...SHAFT, ...position, width: 4, height: 1 }]);
  expect(fill).toBeGreaterThan(8);
  expect(await connectionHit(page, position)).toBe(true);
});
