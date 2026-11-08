import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";

import type { GraphConfig } from "../../page-objects/GraphPageObject";
import { GraphPageObject } from "../../page-objects/GraphPageObject";

const BLOCKS = [
  { id: "source", is: "Block", x: 100, y: 100, width: 200, height: 100, name: "Source", anchors: [], selected: false },
  { id: "target", is: "Block", x: 600, y: 300, width: 200, height: 100, name: "Target", anchors: [], selected: false },
];

const CONNECTIONS = [{ id: "c1", sourceBlockId: "source", targetBlockId: "target" }];

function config(useBezierConnections: boolean): GraphConfig {
  return {
    blocks: BLOCKS,
    connections: CONNECTIONS,
    settings: { useBezierConnections, showConnectionArrows: false },
  };
}

type TLineKind = "webgl" | "dashFlow" | "pulse";

/** Switches the graph to a connection class whose line is a WebGLLine, optionally with a library effect. */
async function useWebGLConnection(page: Page, kind: TLineKind): Promise<void> {
  await page.evaluate((lineKind) => {
    const { BlockConnection, WebGLLine, dashFlow, pulse } = window.GraphModule;
    class Line extends WebGLLine {
      getStroke(state: Parameters<InstanceType<typeof WebGLLine>["getStroke"]>[0]) {
        const base = super.getStroke(state);
        if (lineKind === "dashFlow") {
          return {
            ...base,
            color: "#2f7cf6",
            width: 3,
            effect: dashFlow.use({ pattern: [40, 30], speed: 120, fade: true }),
          };
        }
        if (lineKind === "pulse") {
          return { ...base, color: "#fb4", width: 3, effect: pulse.use({ period: 3, wavelength: 400 }) };
        }
        return base;
      }
    }
    class GL extends BlockConnection {
      static line = Line;
    }
    window.graph.updateSettings({ connection: GL });
  }, kind);
}

async function hasWebGL2(page: Page): Promise<boolean> {
  return page.evaluate(() => Boolean(document.createElement("canvas").getContext("webgl2")));
}

/** Counts non-transparent pixels of the graph canvases within `radius` device pixels of a world point. */
async function countPixelsAround(page: Page, point: { x: number; y: number }, radius = 3): Promise<number> {
  return page.evaluate(
    ({ point: p, radius: r }) => {
      const { scale, x, y } = window.graph.cameraService.getCameraState();
      const sx = p.x * scale + x;
      const sy = p.y * scale + y;
      let count = 0;
      for (const canvas of Array.from(document.querySelectorAll<HTMLCanvasElement>("#root canvas"))) {
        const ratio = canvas.width / canvas.getBoundingClientRect().width;
        const ctx = canvas.getContext("2d");
        if (!ctx) continue;
        const cx = Math.round(sx * ratio);
        const cy = Math.round(sy * ratio);
        const size = Math.round(r * 2 * ratio) + 1;
        const data = ctx.getImageData(cx - Math.round(r * ratio), cy - Math.round(r * ratio), size, size).data;
        for (let i = 3; i < data.length; i += 4) if (data[i] > 0) count++;
      }
      return count;
    },
    { point, radius }
  );
}

type TParityResult = {
  checked: number;
  mismatches: number;
  boundaryMismatches: number;
  hits: number;
  maxDeviation: number;
  band: number;
};

/** Compares Path2DLine and WebGLLine hit tests over a 2-unit grid; the exact distance comes from dense sampling. */
async function measureParity(page: Page, connectionId: string, scale: number): Promise<TParityResult> {
  return page.evaluate(
    ({ id, cameraScale }) => {
      const { Path2DLine, WebGLLine } = window.GraphModule;
      window.graph.cameraService.set({ scale: cameraScale });
      const view = window.graph.rootStore.connectionsList.getConnectionState(id)?.getViewComponent();
      if (!view) throw new Error("No connection view");
      const path2d = new Path2DLine(view as never);
      const webgl = new WebGLLine(view as never);
      const geometry = (view as unknown as { getGeometry(): { segments: Float32Array } | undefined }).getGeometry();
      if (!geometry) throw new Error("No geometry");
      const { segments } = geometry;
      const width = path2d.getStroke((view as unknown as { state: never }).state).width;
      const threshold = 8;
      const boundary = width / 2 + threshold;
      // The analytic test flattens to half a CSS pixel (0.5 / scale world units) and the rasterizer adds a fraction of
      // a unit: 0.75 world units at scale 1, wider when zoomed out.
      const band = 0.25 + 0.5 / cameraScale;

      const samples: number[] = [];
      const steps = 800;
      for (let s = 0; s + 7 < segments.length; s += 8) {
        for (let i = 0; i <= steps; i++) {
          const t = i / steps;
          const u = 1 - t;
          const a = u * u * u;
          const b = 3 * u * u * t;
          const c = 3 * u * t * t;
          const d = t * t * t;
          samples.push(
            a * segments[s] + b * segments[s + 2] + c * segments[s + 4] + d * segments[s + 6],
            a * segments[s + 1] + b * segments[s + 3] + c * segments[s + 5] + d * segments[s + 7]
          );
        }
      }
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (let i = 0; i < samples.length; i += 2) {
        minX = Math.min(minX, samples[i]);
        maxX = Math.max(maxX, samples[i]);
        minY = Math.min(minY, samples[i + 1]);
        maxY = Math.max(maxY, samples[i + 1]);
      }
      const pad = boundary + 12;
      const result = { checked: 0, mismatches: 0, boundaryMismatches: 0, hits: 0, maxDeviation: 0, band };
      for (let x = Math.floor(minX - pad); x <= maxX + pad; x += 2) {
        for (let y = Math.floor(minY - pad); y <= maxY + pad; y += 2) {
          let best = Infinity;
          for (let i = 0; i < samples.length; i += 2) {
            const dx = samples[i] - x;
            const dy = samples[i + 1] - y;
            const d2 = dx * dx + dy * dy;
            if (d2 < best) best = d2;
          }
          const distance = Math.sqrt(best);
          const a = path2d.hitTest(x, y, threshold);
          const b = webgl.hitTest(x, y, threshold);
          result.checked++;
          if (a) result.hits++;
          if (a !== b) {
            result.mismatches++;
            const deviation = Math.abs(distance - boundary);
            result.maxDeviation = Math.max(result.maxDeviation, deviation);
            if (deviation > band) result.boundaryMismatches++;
          }
        }
      }
      return result;
    },
    { id: connectionId, cameraScale: scale }
  );
}

test.describe("WebGL connections", () => {
  test("WebGLLine connection renders with webgl and is selected by a click", async ({ page }) => {
    const graphPO = new GraphPageObject(page);
    await graphPO.initialize(config(false));
    test.skip(!(await hasWebGL2(page)), "Headless Chromium has no WebGL2");

    await useWebGLConnection(page, "webgl");
    await graphPO.waitForFrames(3);
    expect(await graphPO.getConnectionsRenderer()).toBe("webgl");

    const conn = graphPO.connection("c1");
    expect(await conn.isSelected()).toBe(false);
    await conn.click({ curveTime: 0.5 });
    expect(await conn.isSelected()).toBe(true);
  });

  test("falls back to Path2D when WebGL2 is unavailable", async ({ page }) => {
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext as (
        this: HTMLCanvasElement,
        ...args: unknown[]
      ) => unknown;
      HTMLCanvasElement.prototype.getContext = function patched(
        this: HTMLCanvasElement,
        type: string,
        ...rest: unknown[]
      ) {
        if (type === "webgl2") return null;
        return original.call(this, type, ...rest);
      } as typeof HTMLCanvasElement.prototype.getContext;
    });
    const graphPO = new GraphPageObject(page);
    await graphPO.initialize(config(false));
    await useWebGLConnection(page, "webgl");
    await graphPO.waitForFrames(3);

    expect(await graphPO.getConnectionsRenderer()).toBe("webgl-fallback");

    const conn = graphPO.connection("c1");
    const midpoint = await conn.getPointOnCurve(0.5);
    expect(await countPixelsAround(page, midpoint)).toBeGreaterThan(0);

    await conn.click({ curveTime: 0.5 });
    expect(await conn.isSelected()).toBe(true);
  });

  for (const bezier of [false, true]) {
    for (const scale of [1, 0.25]) {
      test(`hit-test parity of Path2DLine and WebGLLine (${bezier ? "bezier" : "straight"}, scale ${scale})`, async ({
        page,
      }, testInfo) => {
        const graphPO = new GraphPageObject(page);
        await graphPO.initialize(config(bezier));
        const result = await measureParity(page, "c1", scale);
        const summary = `${bezier ? "bezier" : "straight"} scale ${scale}: checked ${result.checked}, hits ${result.hits}, mismatches ${result.mismatches}, outside the ${result.band} band ${result.boundaryMismatches}, max deviation ${result.maxDeviation.toFixed(2)}`;
        console.log(`[parity] ${summary}`);
        testInfo.annotations.push({ type: "parity", description: summary });
        expect(result.hits).toBeGreaterThan(0);
        expect(result.boundaryMismatches).toBe(0);
      });
    }
  }

  for (const kind of ["dashFlow", "pulse"] as const) {
    test(`${kind} renders in WebGL without console errors`, async ({ page }) => {
      const errors: string[] = [];
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text());
      });
      page.on("pageerror", (error) => errors.push(error.message));

      const graphPO = new GraphPageObject(page);
      await graphPO.initialize(config(true));
      test.skip(!(await hasWebGL2(page)), "Headless Chromium has no WebGL2");

      await useWebGLConnection(page, kind);
      await graphPO.waitForFrames(10);
      expect(await graphPO.getConnectionsRenderer()).toBe("webgl");
      expect(errors).toEqual([]);
    });
  }
});
