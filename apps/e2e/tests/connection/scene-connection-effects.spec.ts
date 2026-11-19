import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { GraphPageObject } from "../../page-objects/GraphPageObject";

type TEffectTestWindow = Window & {
  sceneEffectTest: { setFirstTint(tint: readonly number[]): void; toggleFirst(active: boolean): void };
};

async function linePixels(page: Page): Promise<number[][]> {
  const png = await page.screenshot({ clip: { x: 250, y: 100, width: 1, height: 121 }, scale: "css" });
  return page.evaluate(async (data) => {
    const image = new Image();
    image.src = `data:image/png;base64,${data}`;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D is unavailable");
    ctx.drawImage(image, 0, 0);
    return [0, 120].map((y) => Array.from(ctx.getImageData(0, y, 1, 1).data.slice(0, 3)));
  }, png.toString("base64"));
}

test("tagged effects on stock connections keep independent uniforms and a plain Canvas stroke", async ({ page }) => {
  const graph = new GraphPageObject(page);
  const blocks = [100, 220].flatMap((y, i) =>
    [50, 530].map((x, side) => ({
      id: `${i}-${side}`,
      is: "Block",
      name: "Stage",
      x,
      y: y - 20,
      width: 60,
      height: 40,
      anchors: [],
    }))
  );
  await graph.initialize({
    blocks,
    connections: [0, 1].map((i) => ({
      id: `line-${i}`,
      sourceBlockId: `${i}-0`,
      targetBlockId: `${i}-1`,
      styles: { background: "#0000ff", selectedBackground: "#ff00ff" },
    })),
    settings: { renderer: "canvas", useBezierConnections: false, showConnectionArrows: false },
  });
  test.skip(
    !(await page.evaluate(() => Boolean(document.createElement("canvas").getContext("webgl2")))),
    "WebGL2 unavailable"
  );

  await page.evaluate(() => {
    const { BlockConnection, defineConnectionEffect, defineTag } = window.GraphModule;
    const { scene, cameraService } = window.graph;
    cameraService.set({ x: 0, y: 0, scale: 1 });
    const first = defineTag("first-tint");
    const second = defineTag("second-tint");
    const red = defineConnectionEffect({
      fragment: `vec4 effect(ConnectionFragment f, vec4 color) {
        return f.selected > 0.5 ? f.selectionColor : vec4(u_tint, color.a);
      }`,
      uniforms: { tint: { type: "vec3", value: [1, 0, 0] } },
    });
    const green = red.clone();
    green.uniforms.tint.value = [0, 1, 0];
    scene.styles.add([
      { target: BlockConnection, tags: [first], style: { parts: { line: { effect: red.use([]), width: 8 } } } },
      { target: BlockConnection, tags: [second], style: { parts: { line: { effect: green.use([]), width: 8 } } } },
    ]);
    scene.tags.set(first, { connection: ["line-0"] });
    scene.tags.set(second, { connection: ["line-1"] });
    (window as unknown as TEffectTestWindow).sceneEffectTest = {
      setFirstTint: (tint) => {
        red.uniforms.tint.value = tint;
      },
      toggleFirst: (active) => {
        if (active) scene.tags.set(first, { connection: ["line-0"] });
        else {
          scene.tags.clear(first);
          // Make the backend replace its style texture while the effect's path group is idle.
          for (let i = 0; i < 20; i++) scene.store.defineStyle({ parts: { line: { width: i } } });
        }
      },
    };
  });

  const blue = [0, 0, 255];
  const green = [0, 255, 0];
  await expect.poll(() => linePixels(page)).toEqual([blue, blue]);
  await graph.evaluate((each) => each.updateSettings({ renderer: "webgl" }));
  await expect.poll(() => linePixels(page)).toEqual([[255, 0, 0], green]);

  // A static effect's uniform changes without changing the graph, its camera, or the style row.
  await page.evaluate(() => (window as unknown as TEffectTestWindow).sceneEffectTest.setFirstTint([1, 1, 0]));
  await expect.poll(() => linePixels(page)).toEqual([[255, 255, 0], green]);
  await page.evaluate(() => (window as unknown as TEffectTestWindow).sceneEffectTest.toggleFirst(false));
  await expect.poll(() => linePixels(page)).toEqual([blue, green]);
  await page.evaluate(() => (window as unknown as TEffectTestWindow).sceneEffectTest.toggleFirst(true));
  await expect.poll(() => linePixels(page)).toEqual([[255, 255, 0], green]);
  await graph.evaluate((each) => each.api.selectConnections(["line-0"], true));
  await expect.poll(() => linePixels(page)).toEqual([[255, 0, 255], green]);
});

test("effect scale ranges keep resident paths, stop animation and preserve custom depth", async ({ page }) => {
  const graph = new GraphPageObject(page);
  await graph.initialize({ blocks: [], connections: [], settings: { renderer: "webgl" } });
  test.skip(
    !(await page.evaluate(() => Boolean(document.createElement("canvas").getContext("webgl2")))),
    "WebGL2 unavailable"
  );
  await expect.poll(() => page.evaluate(() => window.graph.scene.$renderer.peek())).toBe("webgl");
  await page.evaluate(() => {
    const { defineConnectionEffect, lineSegment } = window.GraphModule;
    const { scene, cameraService } = window.graph;
    cameraService.set({ x: 0, y: 0, scale: 1 });
    const red = defineConnectionEffect({
      animated: true,
      fragment: "vec4 effect(ConnectionFragment f, vec4 color) { return vec4(u_tint, 1.); }",
      uniforms: { tint: { type: "vec3", value: [1, 0, 0] } },
    });
    (window as unknown as TEffectTestWindow).sceneEffectTest = {
      setFirstTint: (tint) => {
        red.uniforms.tint.value = tint;
      },
      toggleFirst: () => undefined,
    };
    const depth = defineConnectionEffect({
      animated: true,
      fragment: `vec4 effect(ConnectionFragment f, vec4 color) {
        gl_FragDepth = gl_FragCoord.z;
        return vec4(1., 0., 0., 1.);
      }`,
    });
    const comment = defineConnectionEffect({
      animated: true,
      fragment: `// gl_FragDepth is deliberately not written by this effect.
        vec4 effect(ConnectionFragment f, vec4 color) { return vec4(1., 0., 0., 1.); }`,
    });
    [red, red, depth, comment].forEach((effect, i) => {
      scene.store.add({
        id: `scoped-${i}`,
        x: 0,
        y: 0,
        zIndex: i,
        bounds: { minX: 100, minY: 95 + i * 80, maxX: 400, maxY: 105 + i * 80 },
        primitives: [
          {
            kind: "path",
            segments: new Float32Array(lineSegment({ x: 100, y: 100 + i * 80 }, { x: 400, y: 100 + i * 80 })),
            stroke: { color: "#0000ff", width: 12 },
            effect: { ...effect.use([]), minScale: i === 1 ? 0.75 : 0.5, maxScale: 1.25 },
            interaction: { selected: true, hovered: false, selectionColor: "#ff00ff" },
            effectShowsSelection: i === 1,
          },
        ],
      });
    });
  });
  await graph.waitForFrames(3);
  const draw = (scale: number, x = 0) =>
    page.evaluate(
      ({ scale, x }) => {
        const { scene, cameraService, scheduler } = window.graph;
        scene.layer.performRender();
        scheduler.performUpdate();
        const backend = scene.layer.getBackend();
        if (!backend) throw new Error("Missing backend");
        const frame = {
          ...cameraService.getCameraState(),
          x,
          scale,
          dpr: 1,
          time: 1.234,
          dimColor: scene.store.getDimColor(),
        };
        backend.draw(frame);
        const uploads = backend.stats.lastUploadBytes;
        const animated = backend.draw(frame);
        const gl = backend.canvas.getContext("webgl2");
        if (!gl) throw new Error("Missing context");
        const colors = [0, 1, 2, 3].map((i) => {
          const pixel = new Uint8Array(4);
          gl.readPixels(
            Math.floor(250 * scale),
            gl.drawingBufferHeight - Math.floor((100 + i * 80) * scale) - 1,
            1,
            1,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            pixel
          );
          return Array.from(pixel.slice(0, 3));
        });
        return { colors, animated, uploads, error: gl.getError() };
      },
      { scale, x }
    );
  const blue = [0, 0, 255];
  const red = [255, 0, 0];
  const selected = [255, 0, 255];
  for (const [scale, colors, animated] of [
    [0.25, [blue, selected, blue, blue], false],
    [0.5, [red, selected, red, red], true],
    [0.75, [red, red, red, red], true],
    [1.25, [blue, selected, blue, blue], false],
    [0.75, [red, red, red, red], true],
  ] as const) {
    const result = await draw(scale);
    expect(result.colors, `scale ${scale}`).toEqual(colors);
    expect(result.animated, `scale ${scale}`).toBe(animated);
    expect(result.uploads).toBe(0);
    expect(result.error).toBe(0);
  }
  expect((await draw(1, 10000)).animated, "offscreen effects stop requesting frames").toBe(false);
  await page.evaluate(async () => {
    const canvas = window.graph.scene.layer.getBackend()?.canvas;
    const extension = canvas?.getContext("webgl2")?.getExtension("WEBGL_lose_context");
    if (!canvas || !extension) throw new Error("Context loss extension unavailable");
    await new Promise<void>((resolve) => {
      canvas.addEventListener("webglcontextrestored", () => resolve(), { once: true });
      canvas.addEventListener("webglcontextlost", () => setTimeout(() => extension.restoreContext(), 100), {
        once: true,
      });
      extension.loseContext();
    });
  });
  await expect.poll(() => page.evaluate(() => window.graph.scene.$renderer.peek())).toBe("webgl");
  expect((await draw(0.25)).colors, "plain siblings survive context restoration").toEqual([blue, selected, blue, blue]);
  expect((await draw(1)).colors, "custom depth effects resume after restoration").toEqual([red, red, red, red]);
  await graph.evaluate((each) => each.cameraService.set({ scale: 0.25 }));
  await graph.waitForFrames(3);
  const wakes = await page.evaluate(async () => {
    const backend = window.graph.scene.layer.getBackend();
    if (!backend) throw new Error("Missing backend");
    const original = backend.draw.bind(backend);
    let count = 0;
    backend.draw = (frame) => {
      count++;
      return original(frame);
    };
    (window as unknown as TEffectTestWindow).sceneEffectTest.setFirstTint([0, 1, 0]);
    for (let i = 0; i < 3; i++) await new Promise(requestAnimationFrame);
    backend.draw = original;
    return count;
  });
  expect(wakes, "inactive uniforms do not wake the renderer").toBe(0);
  expect((await draw(1)).colors, "reactivation reads the latest uniforms").toEqual([
    [0, 255, 0],
    [0, 255, 0],
    red,
    red,
  ]);
  await page.evaluate(() => {
    for (let i = 0; i < 4; i++) window.graph.scene.store.update(`scoped-${i}`, { hidden: true });
  });
  expect((await draw(1)).animated, "hidden effects stop requesting frames").toBe(false);
});

test("mixed connection sources activate the same effect independently without replacing their address stream", async ({
  page,
}) => {
  const graph = new GraphPageObject(page);
  await graph.initialize({ blocks: [], connections: [], settings: { renderer: "webgl" } });
  test.skip(
    !(await page.evaluate(() => Boolean(document.createElement("canvas").getContext("webgl2")))),
    "WebGL2 unavailable"
  );
  await expect.poll(() => page.evaluate(() => window.graph.scene.$renderer.peek())).toBe("webgl");
  await page.evaluate(() => {
    const { pulse, lineSegment } = window.GraphModule;
    const { scene, cameraService } = window.graph;
    cameraService.set({ x: 0, y: 0, scale: 1 });
    for (let i = 0; i < 2; i++)
      scene.store.add({
        id: `mixed-scope-${i}`,
        entityType: "connection",
        x: 0,
        y: 0,
        zIndex: i,
        bounds: { minX: 100, minY: 95 + i * 80, maxX: 400, maxY: 105 + i * 80 },
        primitives: [
          {
            kind: "path",
            segments: new Float32Array(lineSegment({ x: 100, y: 100 + i * 80 }, { x: 400, y: 100 + i * 80 })),
            stroke: { color: "#0000ff", width: 12 },
            interaction: i === 1 ? { selected: true, hovered: false, selectionColor: "#ff00ff" } : undefined,
            effectShowsSelection: i === 1,
            effect: pulse.use({ period: 2 }, { minScale: i === 0 ? 0.5 : 0.75, maxScale: 1.25 }),
          },
        ],
      });
  });
  await graph.waitForFrames(3);
  const result = await page.evaluate(() => {
    const { scene, cameraService } = window.graph;
    scene.layer.performRender();
    const backend = scene.layer.getBackend();
    if (!backend) throw new Error("Missing backend");
    const probe = backend as typeof backend & {
      hasMixedVertexWork(): boolean;
      mixedDraw?: { ids: { data: Float32Array } };
      mixedTarget?: unknown;
    };
    // Keep the production mixed pass; bypass only its large-scene performance cutoff.
    probe.hasMixedVertexWork = () => true;
    const gl = backend.canvas.getContext("webgl2");
    if (!gl) throw new Error("Missing context");
    let ids: Float32Array | undefined;
    return [1, 0.5, 0.75, 1.25, 0.5].map((scale) => {
      const animated = backend.draw({
        ...cameraService.getCameraState(),
        scale,
        dpr: 1,
        time: 1, // trough of the 2-second pulse
        dimColor: scene.store.getDimColor(),
      });
      const previous = ids;
      ids = probe.mixedDraw?.ids.data;
      const pixels = [0, 1].map((i) => {
        const pixel = new Uint8Array(4);
        gl.readPixels(
          Math.floor(250 * scale),
          gl.drawingBufferHeight - Math.floor((100 + i * 80) * scale) - 1,
          1,
          1,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          pixel
        );
        return Array.from(pixel);
      });
      return {
        scale,
        pixels,
        animated,
        mixed: Boolean(probe.mixedTarget),
        sameIds: previous?.buffer === ids?.buffer && previous?.length === ids?.length,
        uploads: backend.stats.lastUploadBytes,
        error: gl.getError(),
      };
    });
  });
  for (const [i, row] of result.entries()) {
    expect(row.mixed).toBe(true);
    expect(row.error).toBe(0);
    if (i > 0) {
      expect(row.sameIds).toBe(true);
      expect(row.uploads).toBe(0);
    }
    expect(row.animated).toBe(row.scale < 1.25);
    // At the trough the plain blue line is 15% opaque. The selected line mixes blue with magenta,
    // then becomes solid magenta when its own effect is out of range.
    expect(Math.abs(row.pixels[0][3] - (row.scale < 1.25 ? 38 : 255))).toBeLessThanOrEqual(1);
    const selected = row.pixels[1];
    const active = row.scale >= 0.75 && row.scale < 1.25;
    expect(Math.abs(selected[0] - (active ? 217 : 255))).toBeLessThanOrEqual(1);
    expect(selected.slice(1)).toEqual([0, 255, 255]);
  }
});

test("alternating stock effects share a native draw without changing translucent pixels", async ({ page }) => {
  const graph = new GraphPageObject(page);
  await graph.initialize({ blocks: [], connections: [], settings: { renderer: "webgl" } });
  test.skip(
    !(await page.evaluate(() => Boolean(document.createElement("canvas").getContext("webgl2")))),
    "WebGL2 unavailable"
  );
  await expect.poll(() => page.evaluate(() => window.graph.scene.$renderer.peek())).toBe("webgl");
  await page.evaluate(() => {
    const { dashFlow, pulse, lineSegment, bezierSegment } = window.GraphModule;
    const { scene, cameraService } = window.graph;
    cameraService.set({ x: 0, y: 0, scale: 1 });
    for (let i = 0; i < 48; i++) {
      const effect =
        i % 3 === 0
          ? undefined
          : i % 3 === 1
            ? dashFlow.use({ pattern: [12, 8], speed: 30 })
            : pulse.use({ period: 2 }, { minScale: 0.5 });
      scene.store.add({
        id: `alternating-${i}`,
        entityType: "connection",
        x: 0,
        y: 0,
        zIndex: 0,
        bounds: { minX: 90, minY: 60, maxX: 410, maxY: 165 },
        primitives: [
          {
            kind: "path",
            segments: new Float32Array(
              i % 2
                ? bezierSegment(
                    { x: 100, y: 100 + i * 0.5 },
                    { x: 200, y: 70 },
                    { x: 300, y: 150 },
                    { x: 400, y: 100 + i * 0.5 }
                  )
                : lineSegment({ x: 100, y: 100 + i * 0.5 }, { x: 400, y: 100 + i * 0.5 })
            ),
            part: "line",
            stroke: { color: i % 3 === 0 ? "rgba(20,80,220,0.6)" : i % 3 === 1 ? "#e56918" : "#20b548", width: 12 },
            effect,
          },
        ],
      });
    }
    scene.store.add({
      id: "opaque-cover",
      x: 0,
      y: 0,
      zIndex: 1,
      bounds: { minX: 230, minY: 95, maxX: 265, maxY: 125 },
      primitives: [{ kind: "rect", x: 230, y: 95, width: 35, height: 30, fill: "#543321" }],
    });
  });
  await graph.waitForFrames(3);
  const result = await page.evaluate(() => {
    const { scene, cameraService, scheduler } = window.graph;
    scene.layer.performRender();
    const backend = scene.layer.getBackend();
    if (!backend) throw new Error("Missing backend");
    const probe = backend as typeof backend & {
      prepareStockPaths(...args: unknown[]): { plan: { commands: { native?: unknown }[] } } | undefined;
      orderedStockPaths(...args: unknown[]): unknown;
      stockOrder?: unknown;
      stockDraw?: unknown;
      preparedGroups: { ordered: readonly unknown[] };
      stockCommands: { last?: unknown };
    };
    const prepare = probe.prepareStockPaths;
    const order = probe.orderedStockPaths;
    const gl = backend.canvas.getContext("webgl2");
    if (!gl) throw new Error("Missing context");
    const pixels = () => {
      const data = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
      gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, data);
      return data;
    };
    const original = { ...scene.store.get("alternating-24")! };
    const custom = window.GraphModule.defineConnectionEffect({
      fragment: "vec4 effect(ConnectionFragment f, vec4 color) { return color; }",
    });
    const scopedCustom = window.GraphModule.defineConnectionEffect({
      extraWidth: 6,
      fragment: `vec4 effect(ConnectionFragment f, vec4 color) {
        gl_FragDepth = 1.0;
        return vec4(0.9, 0.2, 0.7, 0.5);
      }`,
    });
    return ["initial", "raise", "move", "nonpath", "custom", "scoped-custom", "restore"].flatMap((phase) => {
      if (phase === "raise")
        scene.store.setStyle(
          "alternating-3",
          scene.store.defineStyle({ raise: 2, parts: { line: { color: "#ff00ff" } } })
        );
      if (phase === "move") scene.store.update("alternating-3", { x: 13, y: 7 });
      if (phase === "nonpath" || phase === "scoped-custom")
        scene.store.add({
          id: "transparent-cover",
          x: 0,
          y: 0,
          zIndex: 1,
          bounds: { minX: 200, minY: 85, maxX: 300, maxY: 140 },
          primitives: [{ kind: "rect", x: 200, y: 85, width: 100, height: 55, fill: "rgba(255,0,0,0.4)" }],
        });
      if (phase === "custom") {
        scene.store.delete("transparent-cover");
        scene.store.update(original.id, {
          primitives: original.primitives.map((p) => (p.kind === "path" ? { ...p, effect: custom.use([]) } : p)),
        });
      }
      if (phase === "scoped-custom") {
        scene.store.update(original.id, {
          primitives: original.primitives.map((p) =>
            p.kind === "path" ? { ...p, effect: scopedCustom.use([], { minScale: 0.5 }) } : p
          ),
        });
      }
      if (phase === "restore") {
        scene.store.delete("transparent-cover");
        scene.store.update(original.id, { primitives: original.primitives });
      }
      scene.layer.performRender();
      scheduler.performUpdate();
      const scales = phase === "scoped-custom" ? [0.25, 0.75, 0.25] : [0.25, 0.75, 1];
      return scales.map((scale) => {
        const frame = {
          ...cameraService.getCameraState(),
          scale,
          dpr: 2,
          time: 1.234,
          dimColor: scene.store.getDimColor(),
        };
        probe.prepareStockPaths = () => undefined;
        probe.orderedStockPaths = () => undefined;
        backend.draw(frame);
        const reference = pixels(),
          before = backend.stats.drawCalls;
        let native: number | undefined;
        probe.prepareStockPaths = function (...args) {
          const prepared = prepare.apply(this, args);
          native = prepared?.plan.commands.filter((command) => command.native !== undefined).length;
          return prepared;
        };
        probe.orderedStockPaths = order;
        backend.draw(frame);
        probe.prepareStockPaths = prepare;
        const actual = pixels();
        return {
          scale,
          phase,
          strict: Boolean(probe.stockOrder),
          hasGroupedCommands: probe.preparedGroups.ordered.length > 0 || Boolean(probe.stockCommands.last),
          before,
          after: backend.stats.drawCalls,
          stock: Boolean(probe.stockDraw),
          native,
          different: actual.reduce((n, value, i) => n + Number(value !== reference[i]), 0),
          error: gl.getError(),
        };
      });
    });
  });
  for (const row of result) {
    expect(row.stock).toBe(true);
    expect(row.strict, JSON.stringify(row)).toBe(!["custom", "nonpath", "scoped-custom"].includes(row.phase));
    if (row.strict)
      expect(row.hasGroupedCommands, "release the preceding shared schedule on the stock-only path").toBe(false);
    if (row.phase === "scoped-custom") {
      expect(row.native, "the translucent rect always remains a barrier").toBe(row.scale === 0.25 ? 1 : 2);
    }
    expect(row.before).toBeGreaterThan(40);
    expect(row.after).toBeLessThan(10);
    expect(row.different).toBe(0);
    expect(row.error).toBe(0);
  }
});
