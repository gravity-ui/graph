import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import type { GraphConfig } from "../../page-objects/GraphPageObject";
import { GraphPageObject } from "../../page-objects/GraphPageObject";

/**
 * The scene's WebGL backend in a real browser: blocks and anchors draw through it, and a change after the first frame
 * (selection, raise) goes through `applyMany`. A backend failure falls back to Canvas2D silently, with the same picture,
 * so the renderer state is checked after every step.
 */

/** Schematic: from SCALES[1] (0.225) to SCALES[2] (0.7); anchors draw there. */
const SCALE = 0.5;

const CONFIG: GraphConfig = {
  blocks: [
    { id: "lower", is: "Block", x: 100, y: 100, width: 200, height: 100, name: "L", anchors: [] },
    { id: "upper", is: "Block", x: 220, y: 140, width: 200, height: 100, name: "U", anchors: [] },
    {
      id: "solo",
      is: "Block",
      x: 600,
      y: 100,
      width: 200,
      height: 100,
      name: "S",
      anchors: [{ id: "out", blockId: "solo", type: "OUT" }],
    },
  ],
  connections: [],
  settings: { renderer: "webgl", useBlocksAnchors: true },
};

const LOWER_BODY: [number, number, number] = [208, 32, 32];
const UPPER_BODY: [number, number, number] = [32, 80, 208];

type TWorldRect = { x: number; y: number; width: number; height: number };

async function hasWebGL2(page: Page): Promise<boolean> {
  return page.evaluate(() => Boolean(document.createElement("canvas").getContext("webgl2")));
}

async function rendererState(page: Page): Promise<string> {
  return page.evaluate(() => window.graph.scene.$renderer.value);
}

/** Counts the screen pixels of a world rect within `tolerance` of `rgb` on every channel, and the pixels checked. */
async function countColor(
  page: Page,
  rect: TWorldRect,
  rgb: [number, number, number],
  tolerance: number
): Promise<{ matched: number; total: number }> {
  const clip = await page.evaluate((world) => {
    const { scale, x, y } = window.graph.cameraService.getCameraState();
    const origin = window.graph.getGraphCanvas()?.getBoundingClientRect() ?? { left: 0, top: 0 };
    return {
      x: Math.round(origin.left + world.x * scale + x),
      y: Math.round(origin.top + world.y * scale + y),
      width: Math.max(1, Math.round(world.width * scale)),
      height: Math.max(1, Math.round(world.height * scale)),
    };
  }, rect);
  const png = await page.screenshot({ clip, scale: "css" });
  return page.evaluate(
    async ({ base64, target, within }) => {
      const image = new Image();
      image.src = `data:image/png;base64,${base64}`;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return { matched: 0, total: 0 };
      ctx.drawImage(image, 0, 0);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let matched = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (target.every((value, k) => Math.abs(value - data[i + k]) <= within)) matched++;
      }
      return { matched, total: data.length / 4 };
    },
    { base64: png.toString("base64"), target: rgb, within: tolerance }
  );
}

/** The anchor's port point in world units: the anchor component is created lazily, the port always exists. */
async function anchorPoint(page: Page, blockId: string, anchorId: string): Promise<{ x: number; y: number }> {
  return page.evaluate(
    ({ block, anchor }) => {
      const component = window.graph.rootStore.blocksList.getBlockState(block)?.getViewComponent();
      if (!component) throw new Error(`no block ${block}`);
      return component.getAnchorPort(anchor).getPoint();
    },
    { block: blockId, anchor: anchorId }
  );
}

test.describe("Scene blocks with the WebGL renderer", () => {
  test("shares fading glyph storage with its opaque pass and preserves it through growth and replay", async ({
    page,
  }) => {
    const graph = new GraphPageObject(page);
    await graph.initialize({ ...CONFIG, blocks: [] });
    test.skip(!(await hasWebGL2(page)), "WebGL2 unavailable");
    await expect.poll(() => rendererState(page)).toBe("webgl");
    const result = await page.evaluate(() => {
      const { scene, cameraService, scheduler } = window.graph;
      const backend = scene.layer.getBackend();
      if (!backend) throw new Error("Missing backend");
      type Resource = { generation: number; destroy(): void };
      type Batch = {
        ranges: { count: number; ownerRanges(id: string): readonly { offset: number; count: number }[] };
        buffer: Resource;
        companion: { ranges: object; buffer: Resource };
        model: { destroy(): void };
        revealed?: Batch;
      };
      const probe = backend as typeof backend & {
        glyphs: { translucent: Batch };
        opaqueFrameDraws: { batch: Batch; count: number }[];
        visibility: WeakMap<Batch, { any(first: number, count: number): boolean }>;
        hasMixedVertexWork(): boolean;
        prepareMixedPlane(...args: unknown[]): unknown;
      };
      const source = probe.glyphs.translucent;
      const revealed = source.revealed;
      if (!revealed) return { available: false as const };
      const gl = backend.canvas.getContext("webgl2");
      if (!gl) throw new Error("Missing WebGL context");
      const primitive = (text: string, color: string, fadeInUntil: number | undefined) => ({
        kind: "text" as const,
        text,
        family: "sans-serif",
        weight: "bold",
        size: 64,
        lineHeight: 72,
        x: 20,
        y: 20,
        width: 20000,
        wrap: false,
        color,
        minScale: 0.2,
        fadeInUntil,
      });
      const texts = [primitive("Fade", "#e02020", 0.3), primitive("Alpha", "rgba(32,32,224,0.5)", 0.3)];
      for (const [index, text] of texts.entries()) {
        scene.store.add({
          id: `fade-${index}`,
          x: index * 30,
          y: 0,
          zIndex: index * 2,
          bounds: { minX: 0, minY: 0, maxX: 20000, maxY: 120 },
          primitives: [text],
        });
      }
      scene.store.add({
        id: "between",
        x: 0,
        y: 0,
        zIndex: 1,
        bounds: { minX: 60, minY: 40, maxX: 100, maxY: 100 },
        primitives: [{ kind: "rect", x: 60, y: 40, width: 40, height: 60, fill: "#00ff00" }],
      });
      // A resident path exercises the real filtered translucent command path rather than a text-only shortcut.
      scene.store.add({
        id: "resident-path",
        entityType: "connection",
        x: 0,
        y: 0,
        zIndex: -1,
        bounds: { minX: 0, minY: 150, maxX: 200, maxY: 160 },
        primitives: [
          {
            kind: "path",
            segments: new Float32Array(window.GraphModule.lineSegment({ x: 0, y: 155 }, { x: 200, y: 155 })),
            stroke: { color: "rgba(0,255,0,0.5)", width: 4 },
          },
        ],
      });
      const render = (scale: number) => {
        cameraService.set({ scale, x: 0, y: 0 });
        scene.layer.performRender();
        scheduler.performUpdate();
      };
      const pixels = () => {
        const out = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
        gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, out);
        return out;
      };
      const visibility = () => {
        const visible = probe.visibility.get(source);
        if (!visible) throw new Error("Glyph visibility was not prepared");
        return [0, 1].map((index) =>
          source.ranges.ownerRanges(`fade-${index}`).some(({ offset, count }) => visible.any(offset, count))
        );
      };
      const drawsRevealed = () => probe.opaqueFrameDraws.some((draw) => draw.batch === revealed && draw.count > 0);
      const shared = () =>
        source.ranges === revealed.ranges &&
        source.buffer === revealed.buffer &&
        source.companion === revealed.companion;
      render(0.25);
      const fading = { visible: visibility(), opaque: drawsRevealed() };
      const encodes = backend.stats.encodes,
        bytes = backend.stats.uploadBytes;
      render(0.4);
      const complete = { visible: visibility(), opaque: drawsRevealed() };
      render(0.25);
      const returning = { visible: visibility(), opaque: drawsRevealed() };
      const camera = { encodes: backend.stats.encodes - encodes, bytes: backend.stats.uploadBytes - bytes };
      const initialGeneration = source.buffer.generation;
      texts[0] = primitive("Fade ".repeat(100), "#e02020", 0.3);
      scene.store.update("fade-0", { primitives: [texts[0]] });
      render(0.4);
      const grown = source.buffer.generation > initialGeneration;
      const beforeRebind = pixels();
      // A second element-table row replaces the GPU texture and must rebind both glyph views.
      for (let i = 0; i < 1025; i++)
        scene.store.add({
          id: `empty-${i}`,
          x: 0,
          y: 0,
          zIndex: 3,
          bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
          primitives: [],
        });
      render(0.4);
      const beforeReplay = pixels();
      backend.replay(scene.store);
      render(0.4);
      const afterReplay = pixels();
      const sharedAfterReplay = shared();
      for (const [index, text] of texts.entries())
        scene.store.update(`fade-${index}`, {
          primitives: [{ ...text, fadeInUntil: undefined }],
        });
      render(0.4);
      const ordinary = pixels();
      const differences = (a: Uint8Array, b: Uint8Array) => a.reduce((n, value, i) => n + Number(value !== b[i]), 0);
      // Only bypass the workload cutoff: the real mixed plane must preserve an upper opaque glyph view.
      probe.hasMixedVertexWork = () => true;
      const prepareMixed = probe.prepareMixedPlane.bind(probe);
      let mixedUsed = false;
      probe.prepareMixedPlane = (...args) => {
        const prepared = prepareMixed(...args);
        mixedUsed = Boolean(prepared);
        return prepared;
      };
      for (const [index, text] of texts.entries()) scene.store.update(`fade-${index}`, { primitives: [text] });
      render(0.4);
      const upperMixed = mixedUsed;
      const mixedFaded = pixels();
      for (const [index, text] of texts.entries())
        scene.store.update(`fade-${index}`, {
          primitives: [{ ...text, fadeInUntil: undefined }],
        });
      render(0.4);
      const mixedOrdinary = pixels();
      scene.store.delete("fade-0");
      scene.store.add({
        id: "fade-0",
        parent: "resident-path",
        childOrder: 0,
        x: 0,
        y: 0,
        zIndex: 0,
        bounds: { minX: 0, minY: 0, maxX: 20000, maxY: 120 },
        primitives: [texts[0]],
      });
      render(0.4);
      const lowerMixed = mixedUsed;
      const lowerFaded = pixels();
      scene.store.update("fade-0", { primitives: [{ ...texts[0], fadeInUntil: undefined }] });
      render(0.4);
      const lowerOrdinary = pixels();
      const error = gl.getError();
      const destroys = [0, 0, 0];
      for (const [index, resource] of [source.buffer, source.companion.buffer, revealed.model].entries()) {
        const destroy = resource.destroy.bind(resource);
        resource.destroy = () => {
          destroys[index]++;
          destroy();
        };
      }
      backend.dispose();
      backend.dispose();
      return {
        available: true as const,
        fading,
        complete,
        returning,
        camera,
        grown,
        sharedAfterReplay,
        rebindDifference: differences(beforeRebind, beforeReplay),
        replayDifference: differences(beforeReplay, afterReplay),
        ordinaryDifference: differences(afterReplay, ordinary),
        upperMixed,
        lowerMixed,
        mixedDifference: differences(mixedFaded, mixedOrdinary),
        lowerDifference: differences(lowerFaded, lowerOrdinary),
        ink: beforeReplay.filter((value, index) => index % 4 === 3 && value > 0).length,
        error,
        destroys,
      };
    });
    expect(result.available).toBe(true);
    if (!result.available) return;
    expect(result.fading).toEqual({ visible: [true, true], opaque: false });
    expect(result.complete).toEqual({ visible: [false, true], opaque: true });
    expect(result.returning).toEqual(result.fading);
    expect(result.camera).toEqual({ encodes: 0, bytes: 0 });
    expect(result.grown).toBe(true);
    expect(result.sharedAfterReplay).toBe(true);
    expect(result.rebindDifference).toBe(0);
    expect(result.replayDifference).toBe(0);
    expect(result.ordinaryDifference).toBe(0);
    expect(result.upperMixed).toBe(true);
    expect(result.lowerMixed).toBe(false);
    expect(result.mixedDifference).toBe(0);
    expect(result.lowerDifference).toBe(0);
    expect(result.ink).toBeGreaterThan(100);
    expect(result.error).toBe(0);
    expect(result.destroys).toEqual([1, 1, 1]);
  });

  test("skips wholly hidden opaque fills and glyphs and draws them again at their visible scale", async ({ page }) => {
    const graph = new GraphPageObject(page);
    await graph.initialize({ ...CONFIG, blocks: [] });
    test.skip(!(await hasWebGL2(page)), "WebGL2 unavailable");
    await expect.poll(() => rendererState(page)).toBe("webgl");
    const result = await page.evaluate(() => {
      const { scene, cameraService, scheduler } = window.graph;
      const backend = scene.layer.getBackend();
      if (!backend) throw new Error("Missing backend");
      type Batch = { ranges: { count: number } };
      const { glyphs, rects, triangles, opaqueFrameDraws } = backend as unknown as {
        glyphs: { opaque: Batch };
        rects: { opaque: Batch };
        triangles: { opaque: Batch };
        opaqueFrameDraws: { batch: Batch }[];
      };
      const batches = [rects.opaque, triangles.opaque, glyphs.opaque];
      const visible = () => {
        scene.layer.performRender();
        scheduler.performUpdate();
        return batches.map((batch) => opaqueFrameDraws.some((draw) => draw.batch === batch));
      };
      for (const [index, id] of ["one", "two"].entries()) {
        scene.store.add({
          id,
          x: 100 * index,
          y: 0,
          zIndex: index,
          bounds: { minX: 0, minY: 0, maxX: 100, maxY: 100 },
          primitives: [
            { kind: "rect", x: 10, y: 10, width: 20, height: 20, fill: "#ff0000", minScale: 0.3 },
            { kind: "polygon", points: new Float32Array([35, 10, 55, 10, 45, 30]), fill: "#00ff00", minScale: 0.3 },
            {
              kind: "text",
              x: 10,
              y: 40,
              width: 100,
              text: "Live",
              family: "sans-serif",
              size: 16,
              lineHeight: 20,
              color: "#0000ff",
              minScale: 0.3,
            },
          ],
        });
      }
      cameraService.set({ scale: 0.5, x: 0, y: 0 });
      const showing = visible();
      const resident = batches.map((batch) => batch.ranges.count);
      cameraService.set({ scale: 0.1, x: 0, y: 0 });
      const outOfScale = visible();
      cameraService.set({ scale: 0.5, x: 0, y: 0 });
      scene.store.update("one", { hidden: true });
      const partial = visible();
      scene.store.update("two", { hidden: true });
      const allHidden = visible();
      scene.store.update("one", { hidden: false });
      return { showing, resident, outOfScale, partial, allHidden, restored: visible() };
    });
    expect(result.resident.every((count) => count >= 2)).toBe(true);
    for (const state of [result.showing, result.partial, result.restored]) expect(state).toEqual([true, true, true]);
    for (const state of [result.outOfScale, result.allHidden]) expect(state).toEqual([false, false, false]);
  });

  test("retains visibility after geometry edits and refreshes hidden owners, nesting and parts", async ({ page }) => {
    const graph = new GraphPageObject(page);
    await graph.initialize({ ...CONFIG, blocks: [] });
    test.skip(!(await hasWebGL2(page)), "WebGL2 unavailable");
    const styleId = await page.evaluate(() => {
      const { defineConnectionEffect, lineSegment } = window.GraphModule;
      const { scene, cameraService } = window.graph;
      cameraService.set({ scale: 0.8, x: 0, y: 0 });
      const effect = defineConnectionEffect({
        fragment: "vec4 effect(ConnectionFragment f, vec4 color) { return vec4(color.rgb, 0.5); }",
      });
      const bounds = { minX: 70, minY: 120, maxX: 330, maxY: 180 };
      const segments = new Float32Array(lineSegment({ x: 100, y: 150 }, { x: 300, y: 150 }));
      scene.store.add({
        id: "lower-path",
        x: 0,
        y: 0,
        zIndex: 100,
        bounds,
        primitives: [{ kind: "path", segments, stroke: { color: "#ff0000", width: 60 }, effect: effect.use([]) }],
      });
      scene.store.add({ id: "handover-owner", x: 0, y: 0, zIndex: 200, bounds, primitives: [] });
      scene.store.add({
        id: "handover-parent",
        parent: "handover-owner",
        x: 0,
        y: 0,
        zIndex: 0,
        bounds,
        primitives: [],
      });
      scene.store.add({
        id: "handover-child",
        parent: "handover-parent",
        x: 0,
        y: 0,
        zIndex: 0,
        bounds,
        primitives: [
          { kind: "path", part: "line", segments, stroke: { color: "#00ff00", width: 60 }, effect: effect.use([]) },
        ],
      });
      scene.store.add({
        id: "upper-path",
        x: 0,
        y: 0,
        zIndex: 300,
        bounds,
        primitives: [{ kind: "path", segments, stroke: { color: "rgba(0, 0, 255, 0.5)", width: 60 } }],
      });
      const row = scene.store.defineStyle({});
      scene.store.setStyle("handover-child", row);
      return row;
    });
    await expect.poll(() => rendererState(page)).toBe("webgl");
    await graph.waitForFrames(3);
    const result = await page.evaluate((row) => {
      const { scene, scheduler, cameraService } = window.graph;
      type TVisibility = { isShown(...args: unknown[]): boolean };
      const backend = scene.layer.getBackend() as unknown as {
        canvas: HTMLCanvasElement;
        translucentParts: object;
        orderStamp: readonly number[];
        preparedGroups: { ordered: readonly unknown[] };
        activeGroups: readonly unknown[];
        allBatches(): Iterable<object>;
        visibility: WeakMap<object, TVisibility>;
      };
      const gl = backend.canvas.getContext("webgl2");
      if (!gl) throw new Error("WebGL2 unavailable");
      const render = (): void => {
        scene.layer.performRender();
        scheduler.performUpdate();
      };
      const pixels = (): Uint8Array => {
        const { scale, width } = cameraService.getCameraState();
        const dpr = gl.drawingBufferWidth / width;
        const side = Math.round(24 * dpr);
        const data = new Uint8Array(side * side * 4);
        gl.readPixels(
          Math.round((200 * scale - 12) * dpr),
          gl.drawingBufferHeight - Math.round((150 * scale + 12) * dpr),
          side,
          side,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          data
        );
        return data;
      };
      render();
      const before = pixels();
      const cache = [...backend.allBatches()].map((batch) => backend.visibility.get(batch)).find(Boolean);
      if (!cache) throw new Error("Missing visibility cache for the active translucent paths");
      const prototype = Object.getPrototypeOf(cache) as TVisibility;
      const original = prototype.isShown;
      let calls = 0;
      const edits = [];
      prototype.isShown = function (...args): boolean {
        calls++;
        return original.apply(this, args);
      };
      try {
        const primitives = scene.store.get("handover-child")!.primitives;
        const changes = [
          { y: 100 },
          { y: 0 },
          {
            primitives: primitives.map((part) =>
              part.kind === "path" ? { ...part, stroke: { color: "#00ff00", width: 20 } } : part
            ),
          },
          { primitives },
        ];
        for (const change of changes) {
          calls = 0;
          scene.store.update("handover-child", change);
          render();
          const next = pixels();
          edits.push({
            calls,
            differentBytes: next.reduce((count, value, index) => count + Number(value !== before[index]), 0),
          });
        }
      } finally {
        prototype.isShown = original;
      }
      const runs = backend.translucentParts;
      const stamp = backend.orderStamp;
      const states = [];
      for (const target of ["handover-owner", "handover-parent", "part"]) {
        for (const hidden of [true, false]) {
          // This is the store update made by HTML viewport handover; children receive no update of their own.
          if (target === "part") scene.store.replaceStyles(new Map([[row, { parts: { line: { visible: !hidden } } }]]));
          else scene.store.update(target, { hidden });
          render();
          const next = pixels();
          states.push({
            target,
            hidden,
            sameRuns: backend.translucentParts === runs,
            sameStamp: backend.orderStamp === stamp,
            differentBytes: next.reduce((count, value, index) => count + Number(value !== before[index]), 0),
            pixel: Array.from(next.subarray(0, 4)),
          });
        }
      }
      const preparedBeforeRemoval = backend.preparedGroups.ordered.length;
      for (const id of ["lower-path", "handover-child", "upper-path"]) scene.store.delete(id);
      scene.store.add({
        id: "remaining-rects",
        x: 0,
        y: 0,
        zIndex: 0,
        bounds: { minX: 100, minY: 100, maxX: 300, maxY: 200 },
        primitives: ["rgba(255,0,0,0.5)", "rgba(0,0,255,0.5)"].map((fill) => ({
          kind: "rect" as const,
          x: 100,
          y: 100,
          width: 200,
          height: 100,
          fill,
        })),
      });
      render();
      const rawGroups = backend.activeGroups;
      scene.store.update("remaining-rects", { x: 1 });
      render();
      return {
        edits,
        states,
        preparedBeforeRemoval,
        preparedAfterRemoval: backend.preparedGroups.ordered.length,
        rawGroups: rawGroups.length,
        sameRawGroups: rawGroups === backend.activeGroups,
        rawPixel: Array.from(pixels().subarray(0, 4)),
        before: Array.from(before.subarray(0, 4)),
        error: gl.getError(),
        level: scene.$level.value,
      };
    }, styleId);
    expect(result.level).toBe("detailed");
    expect(result.preparedBeforeRemoval).toBeGreaterThan(0);
    expect(result.preparedAfterRemoval).toBe(0);
    expect(result.rawGroups).toBe(0);
    expect(result.sameRawGroups).toBe(true);
    for (const [channel, expected] of [64, 0, 128, 192].entries())
      expect(Math.abs(result.rawPixel[channel] - expected)).toBeLessThanOrEqual(2);
    expect(result.before[1]).toBeGreaterThan(40);
    for (const [index, edit] of result.edits.entries()) {
      expect(edit.calls, `geometry edit ${index}`).toBe(0);
      if (index % 2 === 0) expect(edit.differentBytes).toBeGreaterThan(0);
      else expect(edit.differentBytes).toBe(0);
    }
    for (const state of result.states) {
      if (state.target !== "part") {
        expect(state.sameRuns).toBe(true);
        expect(state.sameStamp).toBe(true);
      }
      if (state.hidden) {
        expect(state.differentBytes).toBeGreaterThan(0);
        expect(state.pixel[1]).toBe(0);
      } else expect(state.differentBytes).toBe(0);
    }
    expect(result.error).toBe(0);
    expect(await rendererState(page)).toBe("webgl");
  });

  test("retains translucent order across zoom, effect activation, LOD and part visibility", async ({ page }) => {
    const graph = new GraphPageObject(page);
    await graph.initialize({ ...CONFIG, blocks: [] });
    test.skip(!(await hasWebGL2(page)), "WebGL2 unavailable");
    const row = await page.evaluate(() => {
      const { defineConnectionEffect, lineSegment } = window.GraphModule;
      const { scene, cameraService } = window.graph;
      // The translucent pass first draws plain strokes below the custom effect's activity range.
      cameraService.set({ scale: 0.08, x: 0, y: 0 });
      const styleId = scene.store.defineStyle({});
      const mutedId = scene.store.defineStyle({ parts: { glow: { visible: false } } });
      const glow = defineConnectionEffect({
        extraWidth: 8,
        fragment: "vec4 effect(ConnectionFragment f, vec4 color) { return vec4(color.rgb, 0.5); }",
      });
      for (let i = 0; i < 8; i++) {
        scene.store.add({
          id: `effect-${i}`,
          x: 100 + i * 90,
          y: 0,
          zIndex: 200,
          bounds: { minX: -810, minY: -710, maxX: 810, maxY: 1210 },
          primitives: [
            { kind: "rect", x: 20, y: 440, width: 30, height: 30, fill: "#00ff00" },
            {
              kind: "path",
              part: "glow",
              minScale: 0.07,
              levelMask: i < 2 ? 7 : 2,
              segments: new Float32Array(lineSegment({ x: 0, y: 100 }, { x: 0, y: 400 })),
              stroke: { color: i % 2 === 0 ? "#ff0000" : "#0000ff", width: 16 },
              effect: glow.use([], { minScale: 0.09 }),
            },
          ],
        });
        scene.store.setStyle(`effect-${i}`, styleId);
      }
      return { styleId, mutedId };
    });
    await expect.poll(() => rendererState(page)).toBe("webgl");
    await graph.waitForFrames(3);
    const result = await page.evaluate(({ styleId, mutedId }) => {
      const { scene, scheduler, cameraService } = window.graph;
      const backend = scene.layer.getBackend();
      if (!backend) throw new Error("Missing backend");
      const probe = backend as typeof backend & { translucentParts: object; orderStamp: object };
      const gl = backend.canvas.getContext("webgl2");
      if (!gl) throw new Error("WebGL2 unavailable");
      const render = (): void => {
        scene.layer.performRender();
        scheduler.performUpdate();
      };
      render();
      const runs = probe.translucentParts,
        stamp = probe.orderStamp,
        encodes = backend.stats.encodes;
      const pixel = (x = 14, y = 21): number[] => {
        const rgba = new Uint8Array(4);
        const dpr = gl.drawingBufferWidth / cameraService.getCameraState().width;
        gl.readPixels(
          Math.floor(x * dpr),
          gl.drawingBufferHeight - Math.floor(y * dpr),
          1,
          1,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          rgba
        );
        return Array.from(rgba);
      };
      const frames = [0.1, 0.08, 0.5, 0.25, 0.1, 0.065, 0.1, 0.225, 0.7, 1, 0.1].map((scale) => {
        cameraService.set({ scale, x: 0, y: 0 });
        render();
        return {
          scale,
          sameRuns: probe.translucentParts === runs,
          sameStamp: probe.orderStamp === stamp,
          encodes: backend.stats.encodes - encodes,
          levels: backend.stats.translucentLevels,
        };
      });
      const visible = pixel();
      for (let i = 0; i < 8; i++) scene.store.setStyle(`effect-${i}`, mutedId);
      render();
      const muted = { pixel: pixel(), sameOrder: probe.translucentParts === runs };
      for (let i = 0; i < 8; i++) scene.store.setStyle(`effect-${i}`, styleId);
      render();
      const restored = { pixel: pixel(), sameOrder: probe.translucentParts === runs };
      scene.store.replaceStyles(new Map([[styleId, { base: { glow: { visible: false } } }]]));
      render();
      const hidden = { pixel: pixel(), body: pixel(13, 45), levels: backend.stats.translucentLevels };
      scene.store.replaceStyles(
        new Map([[styleId, { base: { glow: { visible: false } }, parts: { glow: { visible: true } } }]])
      );
      render();
      const revealed = { pixel: pixel(), levels: backend.stats.translucentLevels };
      const beforeRaise = probe.translucentParts;
      scene.store.update("effect-0", { zIndex: 300 });
      render();
      return {
        frames,
        visible,
        muted,
        restored,
        hidden,
        revealed,
        raised: pixel(),
        changedOrder: probe.translucentParts !== beforeRaise,
        encodes: backend.stats.encodes - encodes,
        error: gl.getError(),
      };
    }, row);
    expect(result.muted).toEqual({ pixel: [0, 0, 0, 0], sameOrder: true });
    expect(result.restored).toEqual({ pixel: result.visible, sameOrder: true });
    expect(result.hidden.levels).toBe(0);
    expect(result.revealed.levels).toBeGreaterThan(0);
    for (const frame of result.frames) {
      expect(frame.sameRuns, JSON.stringify(frame)).toBe(true);
      expect(frame.sameStamp).toBe(true);
      expect(frame.encodes).toBe(0);
    }
    expect(Math.abs(result.visible[0] - 64)).toBeLessThanOrEqual(2);
    expect(Math.abs(result.visible[2] - 128)).toBeLessThanOrEqual(2);
    expect(result.hidden.pixel).toEqual([0, 0, 0, 0]);
    expect(result.hidden.body).toEqual([0, 255, 0, 255]);
    expect(result.revealed.pixel).toEqual(result.visible);
    expect(result.encodes).toBe(0);
    expect(result.changedOrder).toBe(true);
    expect(result.raised[0]).toBeGreaterThan(result.raised[2]);
    expect(result.error).toBe(0);
  });

  test("draws a decoded sprite in scene order with top-left UVs and straight alpha", async ({ page }) => {
    const graph = new GraphPageObject(page);
    await graph.initialize({ ...CONFIG, blocks: [] });
    test.skip(!(await hasWebGL2(page)), "WebGL2 unavailable");
    await expect.poll(() => rendererState(page)).toBe("webgl");

    await page.evaluate(async () => {
      const chart = document.createElement("canvas");
      chart.width = chart.height = 8;
      const ctx = chart.getContext("2d")!;
      ctx.fillStyle = "#00ff00";
      ctx.fillRect(0, 0, 4, 4);
      ctx.fillStyle = "rgba(255,0,0,0.5)";
      ctx.fillRect(0, 4, 8, 4);
      const image = new Image();
      image.src = chart.toDataURL();
      await image.decode();

      window.graph.cameraService.set({ scale: 1, x: 0, y: 0 });
      const box = { x: 0, y: 0, width: 80, height: 80 };
      window.graph.scene.store.add({
        id: "sprite",
        zIndex: 100,
        x: 40,
        y: 40,
        bounds: { minX: 0, minY: 0, maxX: 80, maxY: 80 },
        primitives: [
          { kind: "rect", ...box, fill: "#0000ff" },
          { kind: "sprite", ...box, image },
          { kind: "rect", x: 40, y: 40, width: 40, height: 40, fill: "#ffff00" },
        ],
      });
    });
    await graph.waitForFrames(3);
    const samples: [number, number, [number, number, number]][] = [
      [60, 60, [0, 255, 0]], // top-left texel
      [100, 60, [0, 0, 255]], // transparent texel reveals the earlier primitive
      [60, 100, [128, 0, 127]], // half-transparent red over blue
      [100, 100, [255, 255, 0]], // later primitive covers the sprite
    ];
    for (const [x, y, color] of samples) {
      const sample = await countColor(page, { x, y, width: 4, height: 4 }, color, 4);
      expect(sample.matched, `world (${x}, ${y})`).toBe(sample.total);
    }
  });

  test("draws a filled arrow triangle in scene order", async ({ page }) => {
    const graphPO = new GraphPageObject(page);
    await graphPO.initialize({ ...CONFIG, blocks: [] });
    test.skip(!(await hasWebGL2(page)), "Headless Chromium has no WebGL2");

    await page.evaluate((scale) => {
      const graph = window.graph;
      graph.cameraService.set({ scale, x: 0, y: 0 });
      graph.scene.store.add({
        id: "arrow-pixel-test",
        zIndex: 100,
        x: 100,
        y: 100,
        bounds: { minX: 0, minY: 0, maxX: 80, maxY: 80 },
        primitives: [
          { kind: "rect", x: 0, y: 0, width: 80, height: 80, fill: "#0020c0" },
          { kind: "polygon", points: new Float32Array([0, 0, 80, 40, 0, 80]), fill: "#ff0000" },
        ],
      });
    }, SCALE);
    await expect.poll(() => rendererState(page), { timeout: 10_000 }).toBe("webgl");
    await graphPO.waitForFrames(3);

    const inside = { x: 110, y: 120, width: 8, height: 8 };
    const outside = { ...inside, x: 156 };
    const opaque = await countColor(page, inside, [255, 0, 0], 3);
    expect(opaque.matched).toBe(opaque.total);
    const background = await countColor(page, outside, [0, 32, 192], 3);
    expect(background.matched).toBe(background.total);

    await page.evaluate(() => {
      const { store } = window.graph.scene;
      const element = store.get("arrow-pixel-test");
      if (!element) throw new Error("missing triangle");
      store.update(element.id, {
        primitives: element.primitives.map((primitive) =>
          primitive.kind === "polygon" ? { ...primitive, fill: "rgba(255, 0, 0, 0.5)" } : primitive
        ),
      });
    });
    await graphPO.waitForFrames(3);
    expect(await rendererState(page)).toBe("webgl");
    const translucent = await countColor(page, inside, [128, 16, 96], 3);
    expect(translucent.matched).toBe(translucent.total);
  });

  test("draws blocks and a selected anchor's ring through WebGL, and a selection raise after the first frame", async ({
    page,
  }) => {
    const graphPO = new GraphPageObject(page);
    await graphPO.initialize(CONFIG);
    test.skip(!(await hasWebGL2(page)), "Headless Chromium has no WebGL2");

    await page.evaluate(
      ({ scale, lower, upper }) => {
        const { CanvasBlock, defineTag } = window.GraphModule;
        const graph = window.graph;
        const lowerTag = defineTag("e2e-lower");
        const upperTag = defineTag("e2e-upper");
        const color = (rgb: number[]): string => `rgb(${rgb.join(", ")})`;
        graph.scene.styles.add([
          { target: CanvasBlock, tags: [lowerTag], style: { parts: { body: { color: color(lower) } } } },
          { target: CanvasBlock, tags: [upperTag], style: { parts: { body: { color: color(upper) } } } },
        ]);
        graph.scene.tags.add(lowerTag, { block: ["lower"] });
        graph.scene.tags.add(upperTag, { block: ["upper"] });
        graph.cameraService.set({ scale, x: 0, y: 0 });
      },
      { scale: SCALE, lower: LOWER_BODY, upper: UPPER_BODY }
    );
    await expect.poll(() => rendererState(page), { timeout: 10_000 }).toBe("webgl");
    await graphPO.waitForFrames(3);
    expect(await page.evaluate(() => window.graph.scene.$level.value)).toBe("schematic");

    // A block body with the theme's colour, in its lower left part (the title is centred at the top).
    const body = await page.evaluate(() => window.graph.graphColors.block.background);
    expect(body).toBe("#e0e0e0");
    const soloBody = { x: 620, y: 160, width: 30, height: 20 };
    const plain = await countColor(page, soloBody, [224, 224, 224], 3);
    expect(plain.matched).toBe(plain.total);

    // The overlap of "lower" and "upper": "upper" comes later and draws on top.
    const overlap = { x: 235, y: 150, width: 40, height: 20 };
    const before = await countColor(page, overlap, UPPER_BODY, 6);
    expect(before.matched).toBe(before.total);

    // The ring of a selected anchor: right of the OUT point, outside the block, between radius 6.5 and 11.5.
    const out = await anchorPoint(page, "solo", "out");
    const ringArea = { x: out.x - 14, y: out.y - 14, width: 28, height: 28 };
    const ring = (await page.evaluate(() => window.graph.graphColors.anchor.selectedBorder)).toLowerCase();
    expect(ring).toBe("#ffcc00");
    const ringColor: [number, number, number] = [255, 204, 0];
    expect((await countColor(page, ringArea, ringColor, 40)).matched).toBe(0);
    await page.evaluate(() => window.graph.api.setAnchorSelection("solo", "out", true));
    await graphPO.waitForFrames(3);
    expect(await rendererState(page)).toBe("webgl");
    const selected = await countColor(page, ringArea, ringColor, 40);
    // The ring is about 2.5 CSS px wide at this scale: some 60 px of a 14 x 14 px area.
    expect(selected.matched).toBeGreaterThan(20);

    // Selecting "lower" raises it above "upper" (an update after the first frame, through applyMany).
    await page.evaluate(() => window.graph.api.selectBlocks(["lower"], true));
    await graphPO.waitForFrames(3);
    expect(await rendererState(page)).toBe("webgl");
    const after = await countColor(page, overlap, LOWER_BODY, 6);
    expect(after.matched).toBe(after.total);
    const stillPlain = await countColor(page, soloBody, [224, 224, 224], 3);
    expect(stillPlain.matched).toBe(stillPlain.total);
    expect(await rendererState(page)).toBe("webgl");
  });
});
