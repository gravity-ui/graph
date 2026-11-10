// WebGL scene vertical-slice harness: checks C1-C12 and measurements M2-M4, run in Chromium with the real GPU.
// Pixels are read with gl.readPixels in the same task as a synchronous render (the drawing buffer is not preserved).
// readPixels returns PREMULTIPLIED RGBA; every sampled point lies over an opaque block or is compared as such, so the
// values are compared as read (premultiplied) and need no un-premultiplication.
import { Graph } from "GRAPH";
import { dashFlow } from "GRAPH_SRC/components/canvas/connections/effects";
import { lineSegment } from "GRAPH_SRC/components/canvas/connections/geometry/segments";
import { SceneRendererLayer } from "GRAPH_SRC/lib/scene/SceneRendererLayer";
import type { TSceneRendererState } from "GRAPH_SRC/lib/scene/SceneRendererLayer";
import { SceneStore } from "GRAPH_SRC/lib/scene/SceneStore";
import type { TSceneElementInput } from "GRAPH_SRC/lib/scene/SceneStore";
import type { TScenePrimitive } from "GRAPH_SRC/lib/scene/types";

type TPixel = [number, number, number, number];

type TCheckResult = { id: string; pass: boolean | "info"; details: string };

type TRunOptions = { screenshot: () => Promise<string> };

type TCircle = Extract<TScenePrimitive, { kind: "circle" }>;

const TOLERANCE = 8;
const VIEW = { width: 800, height: 600 };
/** Camera position of the slice: world (0, 0) lies at this CSS point at scale 1, so world x = -50 is on screen. */
const ORIGIN = { x: 100, y: 100 };

const BODY_A = "#204060";
const BODY_B = "#604020";
const BORDER = "#dfdfdf";
const GREEN = "#00ff00";
const ANCHOR = "#ff8800";

function hex(color: string): TPixel {
  const value = parseInt(color.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255, 255];
}

function near(a: readonly number[], b: readonly number[], tolerance = TOLERANCE): boolean {
  return a.slice(0, 3).every((channel, index) => Math.abs(channel - b[index]) <= tolerance);
}

const show = (pixel: readonly number[]): string => `rgba(${pixel.join(",")})`;
const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
const frame = (): Promise<void> => new Promise((resolve) => requestAnimationFrame(() => resolve()));

function lineOf(from: [number, number], to: [number, number]): Float32Array {
  return new Float32Array(lineSegment({ x: from[0], y: from[1] }, { x: to[0], y: to[1] }));
}

function blockPrimitives(body: string, title: string, titleY: number, anchors: boolean): TScenePrimitive[] {
  const primitives: TScenePrimitive[] = [
    { kind: "rect", x: 0, y: 0, width: 200, height: 100, fill: body, part: "body" },
    {
      kind: "rect",
      x: 0,
      y: 0,
      width: 200,
      height: 100,
      border: { color: BORDER, width: { px: 3, minWorld: 3, maxWorld: 10 }, align: "inside" },
      part: "border",
    },
    {
      kind: "text",
      text: title,
      family: "sans-serif",
      size: 16,
      lineHeight: 20,
      color: "#ffffff",
      x: 10,
      y: titleY,
      width: 120,
      part: "title",
    },
  ];
  if (anchors) {
    for (let i = 0; i < 8; i++) {
      primitives.push({ kind: "circle", cx: 12.5 + i * 25, cy: 100, r: 4, fill: ANCHOR, part: "anchor" });
    }
  }
  return primitives;
}

const BLOCK_BOUNDS = { minX: -1, minY: -1, maxX: 201, maxY: 110 };

function blockInput(id: string, x: number, body: string, title: string, titleY: number, anchors: boolean) {
  const input: TSceneElementInput = {
    id,
    zIndex: 200,
    x,
    y: 0,
    bounds: BLOCK_BOUNDS,
    primitives: blockPrimitives(body, title, titleY, anchors),
  };
  return input;
}

function createHarness(root: HTMLElement) {
  root.style.width = `${VIEW.width}px`;
  root.style.height = `${VIEW.height}px`;
  const graph = new Graph({} as unknown as ConstructorParameters<typeof Graph>[0], root);
  const store = new SceneStore();
  return { graph, store };
}

async function run(options: TRunOptions): Promise<TCheckResult[]> {
  const results: TCheckResult[] = [];
  const record = (id: string, pass: boolean | "info", details: string): void => {
    results.push({ id, pass, details });
  };
  const errors: string[] = [];
  window.addEventListener("error", (event) => errors.push(event.message));
  window.addEventListener("unhandledrejection", (event) => errors.push(String(event.reason)));

  const root = document.getElementById("root") as HTMLElement;
  const { graph, store } = createHarness(root);
  const dpr = window.devicePixelRatio;

  store.add(blockInput("A", 0, BODY_A, "Alpha", 10, true));
  store.add(blockInput("B", 150, BODY_B, "Beta", 70, false));
  store.add({
    id: "L",
    zIndex: 100,
    x: 0,
    y: 0,
    bounds: { minX: -50, minY: 44, maxX: 400, maxY: 56 },
    primitives: [{ kind: "path", segments: lineOf([-50, 50], [400, 50]), stroke: { color: GREEN, width: 6 } }],
  });

  const layer = graph.addLayer(SceneRendererLayer, { store, renderer: "canvas" });
  graph.start();
  const camera = graph.cameraService;
  const setCamera = (scale: number): void => camera.set({ scale, x: ORIGIN.x, y: ORIGIN.y });
  setCamera(1);

  const seenStates: TSceneRendererState[] = [layer.$state.value];
  layer.$state.subscribe((state) => {
    if (seenStates[seenStates.length - 1] !== state) seenStates.push(state);
  });

  // M4 and M2: luma before the backend is requested, then the time to the webgl state.
  const lumaBefore = typeof (globalThis as { luma?: unknown }).luma;
  await frame();
  const requestedAt = performance.now();
  layer.setRenderer("webgl");
  while (layer.$state.value !== "webgl") {
    if (performance.now() - requestedAt > 15000) {
      record("SETUP", false, `state never reached webgl, stuck at ${layer.$state.value} (${seenStates.join(">")})`);
      break;
    }
    await wait(5);
  }
  const toWebglMs = performance.now() - requestedAt;
  // The depth buffer and the sample count of the context the backend got (it asks for depth and antialias).
  const contextInfo = ((): { depthBits: number; samples: number } => {
    const backendCanvas = layer.getBackend()?.canvas;
    const gl = backendCanvas?.getContext("webgl2") as WebGL2RenderingContext | null | undefined;
    return gl
      ? { depthBits: gl.getParameter(gl.DEPTH_BITS) as number, samples: gl.getParameter(gl.SAMPLES) as number }
      : { depthBits: NaN, samples: NaN };
  })();
  if (!(contextInfo.depthBits >= 24)) {
    record("SETUP", false, `DEPTH_BITS=${contextInfo.depthBits} < 24: the depth keys would collide`);
  }
  record("HEADER", "info", `context DEPTH_BITS=${contextInfo.depthBits} SAMPLES=${contextInfo.samples}`);
  const lumaAfter = typeof (globalThis as { luma?: unknown }).luma;
  // M2 is taken from the FIRST backend, before any check runs.
  const firstStats = layer.getBackend()?.stats;
  const m2 = {
    deviceMs: firstStats?.deviceMs ?? NaN,
    firstFrameMs: firstStats?.firstFrameMs ?? NaN,
  };

  /** Reads of the current check: where each came from. A check other than C9 must read only from webgl. */
  const reads = { webgl: 0, twoD: 0, badState: 0 };
  const check = async (id: string, body: () => Promise<void>): Promise<void> => {
    reads.webgl = 0;
    reads.twoD = 0;
    reads.badState = 0;
    const before = results.length;
    try {
      await body();
    } catch (error) {
      record(id, false, `exception: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
    }
    const mine = results.slice(before).filter((result) => result.id === id);
    if (mine.length === 0) record(id, false, "the check recorded no result");
    if (id !== "C9") {
      const source = `reads webgl=${reads.webgl} 2d=${reads.twoD} not-webgl-state=${reads.badState}`;
      for (const result of mine) {
        result.details += ` [${source}]`;
        if (reads.twoD > 0 || reads.badState > 0) {
          result.pass = false;
          result.details += " FAIL: read from the 2D interpreter or state was not webgl";
        }
      }
    }
  };

  const layerCanvas2D = (): HTMLCanvasElement => {
    const canvas = layer.getCanvas();
    if (!canvas) throw new Error("the layer has no canvas");
    return canvas;
  };

  /** A device-px region, top-left origin, rendered synchronously and read in the same task. */
  const readRegion = (xDev: number, yDev: number, w: number, h: number): Uint8Array => {
    layer.performRender();
    graph.scheduler.performUpdate();
    const out = new Uint8Array(w * h * 4);
    const backend = layer.getBackend();
    if (layer.$state.value !== "webgl") reads.badState++;
    if (layer.$state.value === "webgl" && backend) {
      reads.webgl++;
      const gl = backend.canvas.getContext("webgl2") as WebGL2RenderingContext;
      const raw = new Uint8Array(w * h * 4);
      gl.readPixels(xDev, gl.drawingBufferHeight - yDev - h, w, h, gl.RGBA, gl.UNSIGNED_BYTE, raw);
      for (let row = 0; row < h; row++) {
        out.set(raw.subarray((h - 1 - row) * w * 4, (h - row) * w * 4), row * w * 4);
      }
      return out;
    }
    reads.twoD++;
    const ctx = layerCanvas2D().getContext("2d") as CanvasRenderingContext2D;
    out.set(ctx.getImageData(xDev, yDev, w, h).data);
    return out;
  };

  const screenOf = (wx: number, wy: number): [number, number] => {
    const state = camera.getCameraState();
    return [wx * state.scale + state.x, wy * state.scale + state.y];
  };

  /** The pixel under a WORLD point at the current camera. */
  const pixelAt = (wx: number, wy: number): TPixel => {
    const [sx, sy] = screenOf(wx, wy);
    const data = readRegion(Math.floor(sx * dpr), Math.floor(sy * dpr), 1, 1);
    return [data[0], data[1], data[2], data[3]];
  };

  /** Pixels of a WORLD rect, as device px rows. */
  const regionAt = (wx: number, wy: number, ww: number, wh: number): { data: Uint8Array; w: number; h: number } => {
    const [sx, sy] = screenOf(wx, wy);
    const state = camera.getCameraState();
    const w = Math.round(ww * state.scale * dpr);
    const h = Math.round(wh * state.scale * dpr);
    return { data: readRegion(Math.floor(sx * dpr), Math.floor(sy * dpr), w, h), w, h };
  };

  const countWhite = (wx: number, wy: number, ww: number, wh: number): number => {
    const { data } = regionAt(wx, wy, ww, wh);
    let count = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] >= 235 && data[i + 1] >= 235 && data[i + 2] >= 235 && data[i + 3] === 255) count++;
    }
    return count;
  };

  const TITLE_BOX = [10, 10, 60, 18] as const;
  const bodyA = hex(BODY_A);
  const green = hex(GREEN);

  // C1
  await check("C1", async () => {
    const body = pixelAt(75, 50);
    const line = pixelAt(-20, 50);
    const white = countWhite(...TITLE_BOX);
    const pass = near(body, bodyA) && near(line, green) && white > 0;
    record(
      "C1",
      pass,
      `body(75,50)=${show(body)} want ${show(bodyA)}; line(-20,50)=${show(line)} want ${show(green)}; ` +
        `white title pixels=${white} (want >0) [premultiplied, alpha 255]`
    );
  });

  // C2
  await check("C2", async () => {
    store.update("A", { zIndex: 50 });
    const lowered = pixelAt(75, 50);
    store.update("A", { zIndex: 200 });
    const raised = pixelAt(75, 50);
    record(
      "C2",
      near(lowered, green) && near(raised, bodyA),
      `lowered(75,50)=${show(lowered)} want green ${show(green)}; raised=${show(raised)} want ${show(bodyA)}`
    );
  });

  // C3
  await check("C3", async () => {
    try {
      store.add({
        id: "R",
        zIndex: 300,
        x: 50,
        y: 20,
        bounds: { minX: 0, minY: 0, maxX: 100, maxY: 60 },
        primitives: [{ kind: "rect", x: 0, y: 0, width: 100, height: 60, fill: "rgba(255,0,0,0.5)" }],
      });
      const got = pixelAt(75, 50);
      const want = [Math.round((255 + bodyA[0]) / 2), Math.round((0 + bodyA[1]) / 2), Math.round((0 + bodyA[2]) / 2)];
      record("C3", near(got, want), `blend(75,50)=${show(got)} want ${show(want)} (+-${TOLERANCE})`);
    } finally {
      if (store.get("R")) store.delete("R");
    }
  });

  // C4
  await check("C4", async () => {
    let white = -1;
    let cover: TPixel = [0, 0, 0, 0];
    try {
      store.update("B", { x: 5 });
      white = countWhite(...TITLE_BOX);
      cover = pixelAt(30, 18);
    } finally {
      store.update("B", { x: 150 });
    }
    record(
      "C4",
      white === 0 && near(cover, hex(BODY_B)),
      `white pixels in A's title box with B at x=5: ${white} (want 0); pixel(30,18)=${show(cover)} ` +
        `want B body ${show(hex(BODY_B))}`
    );
  });

  // C5
  await check("C5", async () => {
    const y = 300;
    try {
      store.add({
        id: "D",
        zIndex: 150,
        x: 0,
        y: 0,
        bounds: { minX: 0, minY: y - 8, maxX: 300, maxY: y + 8 },
        primitives: [
          {
            kind: "path",
            segments: lineOf([0, y], [300, y]),
            stroke: { color: "#ffff00", width: 6 },
            effect: dashFlow.use({ pattern: [8, 8], speed: 120 }),
          },
        ],
      });
      const read = (): Uint8Array => regionAt(0, y, 32, 1).data;
      const columnsOf = (data: Uint8Array): number[] => {
        // One value per CSS px column (every dpr-th device px).
        const out: number[] = [];
        for (let i = 0; i < data.length; i += 4 * dpr) out.push(data[i]);
        return out;
      };
      const first = read();
      const t1 = performance.now();
      // Busy-wait exactly 100 ms of wall time (no frames in between): the layer clock is performance.now() based.
      while (performance.now() - t1 < 100) {
        /* spin */
      }
      const second = read();
      const elapsedMs = performance.now() - t1;
      let differing = 0;
      for (let i = 0; i < first.length; i += 4) {
        if (Math.abs(first[i] - second[i]) > TOLERANCE || Math.abs(first[i + 1] - second[i + 1]) > TOLERANCE)
          differing++;
      }
      const differs = differing >= 8;
      const firstB = columnsOf(first);
      const secondB = columnsOf(second);
      // Count draw() calls over 10 real frames (driven by the scheduler) while the effect animates, then remove the
      // effect, let the change settle and count over 10 more frames.
      const backend = layer.getBackend();
      if (!backend) throw new Error("no backend in C5");
      let draws = 0;
      const originalDraw = backend.draw.bind(backend);
      backend.draw = (f): boolean => {
        draws++;
        return originalDraw(f);
      };
      for (let i = 0; i < 10; i++) await frame();
      const whileAnimating = draws;
      draws = 0;
      store.update("D", {
        primitives: [{ kind: "path", segments: lineOf([0, y], [300, y]), stroke: { color: "#ffff00", width: 6 } }],
      });
      for (let i = 0; i < 4; i++) await frame();
      const settledAt = draws;
      for (let i = 0; i < 10; i++) await frame();
      const after = draws - settledAt;
      backend.draw = originalDraw;
      record(
        "C5",
        differs && whileAnimating >= 8 && after === 0,
        `differing device px between reads ${elapsedMs.toFixed(1)} ms apart: ` +
        `${differing}/${first.length / 4} ` +
          `(want >=8); red channel per css px ` +
          `t0=[${firstB.join(",")}] t1=[${secondB.join(",")}]; draw calls over 10 frames while animating=` +
          `${whileAnimating} (want >=8); while settling after removal=${settledAt}, over the next 10 frames=${after} ` +
          `(want 0)`
      );
    } finally {
      if (store.get("D")) store.delete("D");
    }
  });

  // C6
  await check("C6", async () => {
    const border = hex(BORDER);
    const sizes: string[] = [];
    let pass = true;
    for (const [scale, want, tolerance] of [
      [2, 6, 1],
      [1, 3, 1],
      [0.1, 1, 0.5],
    ] as const) {
      setCamera(scale);
      const state = camera.getCameraState();
      const [sx, sy] = screenOf(0, 50);
      const xDev = Math.round(sx * dpr);
      const row = readRegion(xDev, Math.floor(sy * dpr), 40, 1);
      let widthDev = 0;
      while (widthDev < 40 && near(row.subarray(widthDev * 4, widthDev * 4 + 4), border)) widthDev++;
      const next = row.subarray(widthDev * 4, widthDev * 4 + 4);
      const css = widthDev / dpr;
      const ok = Math.abs(css - want) <= tolerance;
      pass = pass && ok;
      sizes.push(
        `scale ${state.scale}: ${widthDev} dev px = ${css} css px (want ${want}+-${tolerance}, ${ok ? "ok" : "BAD"}, ` +
          `next ${show(Array.from(next))})`
      );
    }
    setCamera(1);
    record("C6", pass, sizes.join(" | "));
  });

  // C7
  await check("C7", async () => {
    const div = document.createElement("div");
    try {
      store.update("A", { hidden: true });
      layer.performRender();
      graph.scheduler.performUpdate();
      div.style.cssText =
        `position:absolute;left:${ORIGIN.x}px;top:${ORIGIN.y}px;width:200px;height:100px;box-sizing:border-box;` +
        "border:2px solid #f0f;background:transparent;z-index:1000;pointer-events:none";
      root.appendChild(div);
      layer.performRender();
      graph.scheduler.performUpdate();
      await frame();
      const base64 = await options.screenshot();
      const shot = await new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("screenshot did not decode"));
        image.src = `data:image/png;base64,${base64}`;
      });
      const canvas = Object.assign(document.createElement("canvas"), { width: shot.width, height: shot.height });
      const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
      ctx.drawImage(shot, 0, 0);
      const k = shot.width / VIEW.width;
      const at = (x: number, y: number): TPixel => {
        const d = ctx.getImageData(Math.floor(x * k), Math.floor(y * k), 1, 1).data;
        return [d[0], d[1], d[2], d[3]];
      };
      const lineY = ORIGIN.y + 50;
      const magenta = hex("#ff00ff");
      const inside = at(ORIGIN.x + 100, lineY);
      const leftBorder = at(ORIGIN.x + 1, lineY);
      const rightBorder = at(ORIGIN.x + 199, lineY);
      const outside = at(ORIGIN.x - 20, lineY);
      const body = at(ORIGIN.x + 100, ORIGIN.y + 80);
      record(
        "C7",
        near(inside, green) && near(leftBorder, magenta) && near(rightBorder, magenta) && near(outside, green),
        `screenshot ${shot.width}x${shot.height}; inside the div on the line=${show(inside)} want green; left div ` +
          `border over the line=${show(leftBorder)}, right=${show(rightBorder)} want ${show(magenta)}; line ` +
          `outside the div=${show(outside)}; empty spot of hidden A=${show(body)}`
      );
    } finally {
      div.remove();
      store.update("A", { hidden: false });
    }
  });

  // C8
  await check("C8", async () => {
    const before = pixelAt(87.5, 106);
    const current = store.get("A");
    if (!current) throw new Error("A missing in C8");
    const primitives = current.primitives.map((primitive, index) => {
      if (index !== 6) return primitive;
      const circle = primitive as TCircle;
      return { ...circle, r: circle.r * 1.8 };
    });
    const stats = layer.getBackend()?.stats;
    if (!stats) throw new Error("no backend in C8");
    store.update("A", { primitives });
    const grown = pixelAt(87.5, 106);
    const kind = stats.lastUploadKind;
    const ms = stats.lastEncodeMs;
    record(
      "C8",
      near(grown, hex(ANCHOR)) && !near(before, hex(ANCHOR)) && kind === "range",
      `pixel 6 below the 4th anchor centre: before=${show(before)} after=${show(grown)} want ${show(hex(ANCHOR))}; ` +
        `lastUploadKind=${kind} (want range); re-encode ${ms.toFixed(3)} ms; ` +
        `primitives ${current.primitives.length}->${primitives.length}`
    );
  });

  // C9
  let replayMs = NaN;
  await check("C9", async () => {
    const states: string[] = [];
    const pixelsPerPhase: string[] = [];
    let ok = true;
    let thrown = "";
    const phaseOf = (): string => layer.$state.value;
    const x0 = 0;
    const failures: string[] = [];
    const startIndex = seenStates.length - 1;
    const backendBefore = layer.getBackend();
    // The extension is taken while the context is alive: a lost context does not hand it out again.
    const loseExtension = (layer.getBackend()?.canvas.getContext("webgl2") as WebGL2RenderingContext).getExtension(
      "WEBGL_lose_context"
    );
    try {
      for (let f = 1; f <= 30; f++) {
        const x = x0 + 2 * f;
        store.update("A", { x });
        if (f === 10) {
          loseExtension?.loseContext();
        }
        if (f === 20) {
          loseExtension?.restoreContext();
        }
        await frame();
        await frame();
        const state = phaseOf();
        const inside = pixelAt(x + 75, 70);
        const left = pixelAt(x - 4, 70);
        const follows = near(inside, bodyA) && !near(left, bodyA);
        states.push(state);
        if (!follows) {
          ok = false;
          failures.push(`f${f}(${state}) x=${x}: inside=${show(inside)} left=${show(left)}`);
        }
      }
    } catch (error) {
      thrown = String(error);
      ok = false;
    }
    // Wait for the layer to finish restoring, then read once with the new backend.
    const waitStart = performance.now();
    while (layer.$state.value !== "webgl" && performance.now() - waitStart < 8000) await wait(10);
    const finalState = layer.$state.value;
    const finalInside = pixelAt(60 + 75, 70);
    const finalOk = finalState === "webgl" && near(finalInside, bodyA);
    const seen = seenStates.slice(startIndex);
    const wanted = ["webgl", "lost", "restoring", "webgl"];
    const sequenceOk = seen.length === wanted.length && wanted.every((state, i) => seen[i] === state);
    const backendAfter = layer.getBackend();
    const newBackend = backendAfter !== undefined && backendAfter !== backendBefore;
    replayMs = backendAfter?.stats.lastReplayMs ?? NaN;
    pixelsPerPhase.push(`states per frame: ${states.join(",")}`);
    record(
      "C9",
      ok && finalOk && sequenceOk && newBackend && thrown === "" && errors.length === 0,
      `new backend object after restore=${newBackend}; ` +
        `transitions seen=[${seen.join(">")}] want [${wanted.join(">")}]; ` +
        `${pixelsPerPhase.join("")}; ` +
        `final state=${finalState} body=${show(finalInside)}; thrown="${thrown}"; page errors=${errors.length}` +
        `${errors.length ? ` [${errors.join(" | ")}]` : ""}; follow failures=${failures.length}` +
        `${failures.length ? ` [${failures.slice(0, 6).join(" | ")}]` : ""}`
    );
    store.update("A", { x: 0 });
  });

  // C10
  await check("C10", async () => {
    const stats = layer.getBackend()?.stats;
    if (!stats) throw new Error("no backend in C10");
    // Draw once so the pending update does not count against the style change.
    readRegion(0, 0, 1, 1);
    const encodes = stats.encodes;
    const style = store.defineStyle({ border: { color: "#ffcc00" } });
    store.setStyle("A", style);
    const got = pixelAt(1.5, 50);
    const after = stats.encodes;
    record(
      "C10",
      near(got, hex("#ffcc00")) && after === encodes,
      `border pixel (1.5,50)=${show(got)} want ${show(hex("#ffcc00"))}; encodes ${encodes}->${after} (want equal)`
    );
  });

  // C11
  await check("C11", async () => {
    const stats = layer.getBackend()?.stats;
    if (!stats) throw new Error("no backend in C11");
    const uploadsBefore = stats.uploads;
    const fill = "#00ffff";
    const COUNT = 3000;
    const COLUMNS = 50;
    for (let i = 0; i < COUNT; i++) {
      const x = 300 + (i % COLUMNS) * 5;
      const y = 120 + Math.floor(i / COLUMNS) * 5;
      store.add({
        id: `s${i}`,
        zIndex: 400,
        x,
        y,
        bounds: { minX: 0, minY: 0, maxX: 4, maxY: 4 },
        primitives: [{ kind: "rect", x: 0, y: 0, width: 4, height: 4, fill }],
      });
    }
    const last = COUNT - 1;
    const lx = 300 + (last % COLUMNS) * 5 + 2;
    const ly = 120 + Math.floor(last / COLUMNS) * 5 + 2;
    const lastPixel = pixelAt(lx, ly);
    const firstPixel = pixelAt(302, 122);
    const middleIndex = 1500;
    const middlePixel = pixelAt(300 + (middleIndex % COLUMNS) * 5 + 2, 120 + Math.floor(middleIndex / COLUMNS) * 5 + 2);
    const gap = pixelAt(lx + 3, ly);
    record(
      "C11",
      near(lastPixel, hex(fill)) && near(firstPixel, hex(fill)) && near(middlePixel, hex(fill)),
      `3000 rects added; last (${lx},${ly})=${show(lastPixel)} first=${show(firstPixel)} middle=${show(middlePixel)} ` +
        `want ${show(hex(fill))}; gap between=${show(gap)}; stats.uploads ${uploadsBefore}->${stats.uploads}; ` +
        `instances in the frame=${stats.instances} drawCalls=${stats.drawCalls}; lastUploadKind=${stats.lastUploadKind}`
    );
  });

  // C12: visible: false hides the WHOLE primitive (the Canvas2D interpreter's meaning), not just the part's paint.
  await check("C12", async () => {
    const GOLD = "#ffcc00";
    const FILL = "#ff0000";
    const BAND = "#0000ff";
    try {
      store.add({
        id: "V",
        zIndex: 500,
        x: 600,
        y: 300,
        bounds: { minX: 0, minY: 0, maxX: 60, maxY: 40 },
        primitives: [
          {
            kind: "rect",
            x: 0,
            y: 0,
            width: 60,
            height: 40,
            fill: FILL,
            border: { color: BAND, width: 6, align: "inside" },
            part: "anchor",
          },
        ],
      });
      const fillAt = (): TPixel => pixelAt(630, 320);
      const borderAt = (): TPixel => pixelAt(602, 320);
      const shownFill = fillAt();
      const shownBorder = borderAt();
      const hide = store.defineStyle({ anchor: { visible: false } });
      store.setStyle("V", hide);
      const hiddenFill = fillAt();
      const hiddenBorder = borderAt();
      // Recolouring the part still recolours only its paint (the fill) and keeps the border.
      const recolour = store.defineStyle({ anchor: { color: GOLD } });
      store.setStyle("V", recolour);
      const recolouredFill = fillAt();
      const recolouredBorder = borderAt();
      const empty = pixelAt(630, 280);
      const gone = (pixel: TPixel): boolean => near(pixel, empty);
      record(
        "C12",
        near(shownFill, hex(FILL)) &&
          near(shownBorder, hex(BAND)) &&
          gone(hiddenFill) &&
          gone(hiddenBorder) &&
          near(recolouredFill, hex(GOLD)) &&
          near(recolouredBorder, hex(BAND)),
        `rect with fill+border, part "anchor": shown fill=${show(shownFill)} border=${show(shownBorder)}; ` +
          `visible:false fill=${show(hiddenFill)} border=${show(hiddenBorder)} want both = empty ${show(empty)}; ` +
          `colour override fill=${show(recolouredFill)} want ${show(hex(GOLD))}, border=${show(recolouredBorder)} ` +
          `want ${show(hex(BAND))}`
      );
    } finally {
      if (store.get("V")) store.delete("V");
    }
  });

  // Measurements.
  record(
    "M2",
    "info",
    `deviceMs=${m2.deviceMs.toFixed(1)} firstFrameMs=${m2.firstFrameMs.toFixed(1)} (first backend) ` +
      `setRenderer(webgl)->state webgl=${toWebglMs.toFixed(1)} ms (cold: first import, device attach, compile)`
  );
  record("M3", "info", `lastReplayMs=${replayMs.toFixed(3)} (backend created by the C9 restore, 3 elements)`);
  record(
    "M4",
    "info",
    `typeof globalThis.luma before setRenderer(webgl)=${lumaBefore}, after state webgl=${lumaAfter}`
  );
  return results;
}

Object.assign(window, { slice: { run } });
