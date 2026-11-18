import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import type { TMultipointConnection } from "@gravity-ui/graph";

import { GraphPageObject } from "../../page-objects/GraphPageObject";

const viewport = { width: 480, height: 300 };
const strokeWidth = 16;
const dash = [19, 13];
const block = { is: "Block", name: "", x: -300, y: 40, width: 20, height: 20 };
test.use({ viewport, deviceScaleFactor: 2 });

async function measure(page: Page, dashed: boolean, reversal: boolean) {
  return page.evaluate(
    ({ strokeWidth, dash, dashed, viewport, reversal }) => {
      const { graph, GraphModule } = window;
      const view = graph.connections.getConnectionState("edge")?.getViewComponent();
      if (!(view instanceof GraphModule.MultipointConnection)) throw new Error("Missing stock polyline");
      const shape = view.getGeometry();
      if (!shape) throw new Error("Missing polyline geometry");
      const scene = graph.scene;
      scene.layer.performRender();
      graph.scheduler.performUpdate();
      const canvas = scene.$renderer.value === "webgl" ? scene.layer.getBackend()?.canvas : scene.layer.getCanvas();
      if (!(canvas instanceof HTMLCanvasElement)) throw new Error("Missing scene canvas");
      const dpr = canvas.width / viewport.width;
      const { width, height } = canvas;
      const reference = document.createElement("canvas");
      reference.width = width;
      reference.height = height;
      const ctx = reference.getContext("2d")!;
      ctx.drawImage(canvas, 0, 0);
      const actual = ctx.getImageData(0, 0, width, height).data;
      ctx.clearRect(0, 0, width, height);
      ctx.scale(dpr, dpr);
      ctx.strokeStyle = "rgba(255, 0, 0, 0.5)";
      ctx.lineWidth = strokeWidth;
      ctx.setLineDash(dashed ? dash : []);
      ctx.stroke(GraphModule.createSegmentsPath(shape.segments));
      const expected = ctx.getImageData(0, 0, width, height).data;
      const alpha = (x: number, y: number) => actual[(y * width + x) * 4 + 3];
      const ref = (x: number, y: number) => expected[(y * width + x) * 4 + 3];
      let peak = 0;
      let overdrawnPixels = 0;
      let missingInterior = 0;
      let strayInterior = 0;
      let gapHits = 0;
      let dashHits = 0;
      let gapX = 0;
      let phaseErrors = 0;
      // Allow one CSS pixel for the different antialiasing and cubic flattening used by the two backends.
      for (let y = 75 * dpr; y < 235 * dpr; y++) {
        for (let x = 60 * dpr; x < 450 * dpr; x++) {
          const value = alpha(x, y);
          peak = Math.max(peak, value);
          if (value > 130) overdrawnPixels++;
          const center = ref(x, y);
          if (Math.abs(center - value) < 35) continue;
          const neighbors = [ref(x - dpr, y), ref(x + dpr, y), ref(x, y - dpr), ref(x, y + dpr)];
          if (center >= 124 && neighbors.every((v) => v >= 124) && value < 85) missingInterior++;
          if (center === 0 && neighbors.every((v) => v === 0) && value > 40) strayInterior++;
        }
      }
      // Past all turns, solid dash and gap centers must match one uninterrupted Canvas stroke.
      for (let x = 220; x < 415; x++) {
        const px = x * dpr;
        const py = 220 * dpr;
        const on = ref(px, py);
        if (ref(px - 2 * dpr, py) !== on || ref(px + 2 * dpr, py) !== on) continue;
        if (on >= 124) dashHits++;
        else if (on === 0) {
          gapHits++;
          gapX = x;
        }
        if (Math.abs(alpha(px, py) - on) > 20) phaseErrors++;
      }
      const s = shape.segments;
      // The midpoint of the first rounded cubic, or the vertex for an exact reversal.
      const turn = reversal
        ? { x: s[6], y: s[7] }
        : {
            x: (s[8] + 3 * s[10] + 3 * s[12] + s[14]) / 8,
            y: (s[9] + 3 * s[11] + 3 * s[13] + s[15]) / 8,
          };
      return {
        peak,
        overdrawnPixels,
        isolatedShaft: alpha(85 * dpr, 100 * dpr),
        hitsDashGap: gapHits > 0 && graph.getElementOverPoint({ x: gapX, y: 220 }) === view,
        missingInterior,
        strayInterior,
        phaseErrors,
        dashHits,
        gapHits,
        hitsTurn: graph.getElementOverPoint(turn) === view,
        hitsOutside: graph.getElementOverPoint({ x: turn.x, y: turn.y - 30 }) === view,
        pixels: canvas.toDataURL(),
      };
    },
    { strokeWidth, dash, dashed, viewport, reversal }
  );
}

async function setup(page: Page, renderer: "canvas" | "webgl"): Promise<GraphPageObject> {
  const graph = new GraphPageObject(page);
  await graph.initialize({
    blocks: [
      { ...block, id: "a" },
      { ...block, id: "b", y: 100 },
    ],
    settings: { renderer, showConnectionArrows: false, showConnectionLabels: false },
  });
  test.skip(
    renderer === "webgl" &&
      !(await page.evaluate(() => document.createElement("canvas").getContext("webgl2") !== null)),
    "WebGL2 unavailable"
  );
  await expect.poll(() => page.evaluate(() => window.graph.scene.$renderer.value)).toBe(renderer);
  await page.evaluate((width) => {
    const { graph, GraphModule } = window;
    graph.updateSettings({ connection: GraphModule.MultipointConnection });
    const wide = GraphModule.defineTag("e2e-polyline-width");
    graph.scene.styles.add([
      { target: GraphModule.BlockConnection, tags: [wide], style: { parts: { line: { width } } } },
    ]);
    graph.scene.tags.add(wide, { connection: ["edge", "overlay"] });
    graph.cameraService.set({ x: 0, y: 0, scale: 1 });
  }, strokeWidth);
  return graph;
}

for (const renderer of ["canvas", "webgl"] as const) {
  for (const [turn, returnY] of [
    ["acute", 145],
    ["reversing", 100],
  ] as const) {
    test(`${renderer} paints a translucent ${turn} polyline once and preserves its dashes across repeated bends`, async ({
      page,
    }) => {
      const graph = await setup(page, renderer);
      const corner = { x: 400, y: 100 };
      const points = [{ x: 80, y: 100 }, corner, { x: 140, y: returnY }, { x: 150, y: 220 }, { x: 430, y: 220 }];
      for (const dashed of [false, true]) {
        const edge: TMultipointConnection = {
          id: "edge",
          sourceBlockId: "a",
          targetBlockId: "b",
          points,
          dashed,
          styles: { background: "rgba(255, 0, 0, 0.5)", dashes: dash },
        };
        await graph.evaluate((graph, edge) => graph.updateEntities({ connections: [edge] }), edge);
        await graph.waitForFrames(3);
        const clean = await measure(page, dashed, turn === "reversing");
        const repeated = { ...edge, points: [points[0], corner, corner, ...points.slice(2)] };
        await graph.evaluate((graph, edge) => graph.updateEntities({ connections: [edge] }), repeated);
        await graph.waitForFrames(3);
        const duplicate = await measure(page, dashed, turn === "reversing");
        expect(duplicate.pixels === clean.pixels, "same image with a repeated coordinate").toBe(true);
        expect(duplicate.hitsTurn).toBe(true);
        expect(duplicate.hitsOutside).toBe(false);
        expect.soft(clean.peak, "one half-opacity stroke").toBeLessThanOrEqual(130);
        expect.soft(clean.overdrawnPixels).toBe(0);
        expect(Math.abs(clean.isolatedShaft - 128), "isolated 50% shaft").toBeLessThanOrEqual(1);
        expect.soft(clean.missingInterior, "missing interior of native stroke").toBe(0);
        expect.soft(clean.strayInterior, "paint outside native stroke").toBe(0);
        expect.soft(clean.phaseErrors, "dash/gap interiors after the turns").toBe(0);
        expect(clean.dashHits).toBeGreaterThan(20);
        if (dashed) {
          expect(clean.gapHits).toBeGreaterThan(20);
          expect(clean.hitsDashGap, "a dashed connection is picked along its shaft").toBe(true);
        }
      }
    });
  }
  test(`${renderer} composites distinct translucent polylines in painter order after zoom`, async ({ page }) => {
    const graph = await setup(page, renderer);
    const points = [
      { x: 80, y: 100 },
      { x: 400, y: 100 },
      { x: 140, y: 100 },
      { x: 150, y: 220 },
    ];
    const red: TMultipointConnection = {
      id: "edge",
      sourceBlockId: "a",
      targetBlockId: "b",
      points,
      styles: { background: "rgba(255, 0, 0, 0.5)" },
    };
    const blue = { ...red, id: "overlay", styles: { background: "rgba(0, 0, 255, 0.5)" } };
    await graph.evaluate((graph, edges) => graph.updateEntities({ connections: edges }), [red, blue]);
    await page.evaluate(() => {
      const { graph, GraphModule } = window;
      const upper = GraphModule.defineTag("e2e-upper-connection");
      graph.scene.styles.add([{ target: GraphModule.BlockConnection, tags: [upper], style: { raise: 1 } }]);
      graph.scene.tags.add(upper, { connection: ["overlay"] });
    });
    for (const scale of [1, 0.5]) {
      await graph.evaluate((graph, scale) => graph.cameraService.set({ x: 0, y: 0, scale }), scale);
      await graph.waitForFrames(3);
      const samples = await page.evaluate(
        ({ scale, width }) => {
          const { scene, scheduler } = window.graph;
          scene.layer.performRender();
          scheduler.performUpdate();
          const canvas = scene.$renderer.value === "webgl" ? scene.layer.getBackend()?.canvas : scene.layer.getCanvas();
          if (!(canvas instanceof HTMLCanvasElement)) throw new Error("Missing scene canvas");
          const k = (scale * canvas.width) / width;
          const ctx = document.createElement("canvas").getContext("2d")!;
          return [90, 280].map((x) => {
            ctx.clearRect(0, 0, 1, 1);
            ctx.drawImage(canvas, Math.round(x * k), Math.round(100 * k), 1, 1, 0, 0, 1, 1);
            return Array.from(ctx.getImageData(0, 0, 1, 1).data);
          });
        },
        { scale, width: viewport.width }
      );
      for (const pixel of samples) {
        // Blue over red. The second sample is on the retraced portion of both logical paths.
        const expected = [85, 0, 170, 192];
        expect
          .soft(Math.max(...pixel.map((value, i) => Math.abs(value - expected[i]))), `actual RGBA ${pixel}`)
          .toBeLessThanOrEqual(2);
      }
    }
  });
}

test("custom depth respects opaque paint and later strokes of the same element blend separately", async ({ page }) => {
  const graph = await setup(page, "webgl");
  await page.evaluate(() => {
    const { graph, GraphModule } = window;
    const { scene } = graph;
    graph.updateEntities({
      connections: [
        {
          id: "edge",
          sourceBlockId: "a",
          targetBlockId: "b",
          points: [
            { x: 80, y: 100 },
            { x: 400, y: 100 },
            { x: 140, y: 100 },
          ],
          styles: { background: "rgba(255, 0, 0, 0.5)" },
        } as TMultipointConnection,
      ],
    });
    scene.store.add({
      id: "opaque-crossing",
      x: 0,
      y: 0,
      zIndex: 1,
      bounds: { minX: 270, minY: 120, maxX: 290, maxY: 145 },
      primitives: [{ kind: "rect", x: 270, y: 120, width: 20, height: 25, fill: "#00ff00" }],
    });
    const behind = GraphModule.defineConnectionEffect({
      fragment: `vec4 effect(ConnectionFragment f, vec4 color) {
        gl_FragDepth = 1.0 / 16777215.0;
        return color;
      }`,
    });
    const points = [
      { x: 80, y: 180 },
      { x: 400, y: 180 },
      { x: 140, y: 180 },
    ];
    const upper = GraphModule.multipointGeometry({
      source: points[0],
      target: points[2],
      points,
      useBezier: false,
      bezierDirection: "horizontal",
      connection: { id: "upper", sourceBlockId: "a", targetBlockId: "b" },
    })!;
    scene.store.add({
      id: "custom-depth-crossing",
      x: 0,
      y: 0,
      zIndex: 201,
      bounds: { minX: 70, minY: 70, maxX: 410, maxY: 190 },
      primitives: [
        {
          kind: "path",
          segments: new Float32Array(GraphModule.lineSegment({ x: 280, y: 75 }, { x: 280, y: 160 })),
          stroke: { color: "#0000ff", width: 12 },
          effect: behind.use([]),
        },
        { kind: "path", segments: upper.segments, stroke: { color: "rgba(255,0,0,0.5)", width: 16 } },
        { kind: "path", segments: upper.segments, stroke: { color: "rgba(0,0,255,0.5)", width: 16 } },
      ],
    });
  });
  await graph.waitForFrames(3);
  const samples = await page.evaluate((width) => {
    const { scene, scheduler } = window.graph;
    scene.layer.performRender();
    scheduler.performUpdate();
    const canvas = scene.layer.getBackend()!.canvas;
    const k = canvas.width / width;
    const ctx = document.createElement("canvas").getContext("2d")!;
    return [90, 100, 130, 180].map((y) => {
      ctx.clearRect(0, 0, 1, 1);
      ctx.drawImage(canvas, 280 * k, y * k, 1, 1, 0, 0, 1, 1);
      return Array.from(ctx.getImageData(0, 0, 1, 1).data);
    });
  }, viewport.width);
  expect(samples.slice(0, 3)).toEqual([
    [0, 0, 255, 255],
    [0, 0, 255, 255],
    [0, 255, 0, 255],
  ]);
  const blueOverRed = [85, 0, 170, 192];
  expect(Math.max(...samples[3].map((value, channel) => Math.abs(value - blueOverRed[channel])))).toBeLessThanOrEqual(
    1
  );
});

test("WebGL without default antialiasing covers a fringe crossed by the same translucent stroke after resize", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, options?: object) {
      return Reflect.apply(original, this, [type, type === "webgl2" ? { ...options, antialias: false } : options]);
    } as typeof original;
  });
  const graph = await setup(page, "webgl");
  expect(
    await page.evaluate(
      () => window.graph.scene.layer.getBackend()?.canvas.getContext("webgl2")?.getContextAttributes()?.antialias
    )
  ).toBe(false);

  async function draw(shift: number, crossing: boolean) {
    const y = 100.125;
    const points = [
      { x: 80, y },
      { x: 350, y },
    ];
    if (crossing) points.push({ x: 350, y: 200 }, { x: 220, y: 200 }, { x: 220, y: 50 });
    const edge: TMultipointConnection = {
      id: "edge",
      sourceBlockId: "a",
      targetBlockId: "b",
      points: points.map((point) => ({ ...point, x: point.x + shift })),
      styles: { background: "rgba(255, 0, 0, 0.5)" },
    };
    await graph.evaluate((graph, edge) => {
      graph.cameraService.set({ x: 0, y: 0, scale: 1 });
      graph.updateEntities({ connections: [edge] });
    }, edge);
    await graph.waitForFrames(3);
    return page.evaluate((shift) => {
      const { scene, scheduler } = window.graph;
      scene.layer.performRender();
      scheduler.performUpdate();
      const canvas = scene.layer.getBackend()!.canvas;
      const k = canvas.width / innerWidth;
      const ctx = document.createElement("canvas").getContext("2d")!;
      const alpha = (x: number, y: number) => {
        ctx.clearRect(0, 0, 1, 1);
        ctx.drawImage(canvas, Math.floor((x + shift) * k), Math.floor(y * k), 1, 1, 0, 0, 1, 1);
        return ctx.getImageData(0, 0, 1, 1).data[3];
      };
      return {
        width: canvas.width,
        shaft: alpha(90, 100),
        fringe: alpha(90, 108),
        crossing: alpha(220, 108),
        vertical: alpha(220, 120),
      };
    }, shift);
  }

  for (const shift of [0, 310]) {
    if (shift) {
      await page.setViewportSize({ width: 704, height: 340 });
      await expect.poll(() => page.evaluate(() => window.graph.layers.getRootSize().width)).toBe(704);
    }
    const samples = await draw(shift, true);
    expect(samples.width).toBe(shift ? 1408 : 960);
    // The horizontal leg covers a quarter of this device pixel. The later vertical leg covers it completely.
    expect(samples.shaft).toBe(128);
    expect(samples.fringe).toBeGreaterThan(0);
    expect(samples.fringe).toBeLessThan(100);
    expect(samples.vertical).toBe(128);
    expect.soft(samples.crossing, `after x shift ${shift}, samples ${JSON.stringify(samples)}`).toBe(128);
  }
  const straight = await draw(310, false);
  expect(straight.shaft).toBe(128);
  expect(straight.crossing).toBe(straight.fringe);
  expect(straight.vertical).toBe(0);
});
