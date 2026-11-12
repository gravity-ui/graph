// WebGL scene vertical-slice harness: checks C1-C16 and measurements M2-M4, run in Chromium with the real GPU.
// Pixels are read with gl.readPixels in the same task as a synchronous render (the drawing buffer is not preserved).
// readPixels returns PREMULTIPLIED RGBA; every sampled point lies over an opaque block or is compared as such, so the
// values are compared as read (premultiplied) and need no un-premultiplication. C14 also compares a translucent rect
// over nothing: it premultiplies the Canvas2D reference instead.
import { Graph } from "GRAPH";
import { dashFlow } from "GRAPH_SRC/components/canvas/connections/effects";
import { lineSegment } from "GRAPH_SRC/components/canvas/connections/geometry/segments";
import { drawElements } from "GRAPH_SRC/lib/scene/drawPrimitives";
import type { TSceneElementInput } from "GRAPH_SRC/lib/scene/SceneStore";
import type { TSceneRendererState } from "GRAPH_SRC/services/scene/types";
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
  return { graph, store: graph.scene.store };
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

  const layer = graph.scene.layer;
  graph.start();
  const camera = graph.cameraService;
  const setCamera = (scale: number): void => camera.set({ scale, x: ORIGIN.x, y: ORIGIN.y });
  setCamera(1);

  const seenStates: TSceneRendererState[] = [graph.scene.$renderer.value];
  graph.scene.$renderer.subscribe((state) => {
    if (seenStates[seenStates.length - 1] !== state) seenStates.push(state);
  });

  // M4 and M2: luma before the backend is requested, then the time to the webgl state.
  const lumaBefore = typeof (globalThis as { luma?: unknown }).luma;
  await frame();
  const requestedAt = performance.now();
  graph.updateSettings({ renderer: "webgl" });
  while (graph.scene.$renderer.value !== "webgl") {
    if (performance.now() - requestedAt > 15000) {
      record(
        "SETUP",
        false,
        `state never reached webgl, stuck at ${graph.scene.$renderer.value} (${seenStates.join(">")})`
      );
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
    if (graph.scene.$renderer.value !== "webgl") reads.badState++;
    if (graph.scene.$renderer.value === "webgl" && backend) {
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
    const phaseOf = (): string => graph.scene.$renderer.value;
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
    while (graph.scene.$renderer.value !== "webgl" && performance.now() - waitStart < 8000) await wait(10);
    const finalState = graph.scene.$renderer.value;
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
    const style = store.defineStyle({ parts: { border: { color: "#ffcc00" } } });
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
      const hide = store.defineStyle({ parts: { anchor: { visible: false } } });
      store.setStyle("V", hide);
      const hiddenFill = fillAt();
      const hiddenBorder = borderAt();
      // Recolouring the part still recolours only its paint (the fill) and keeps the border.
      const recolour = store.defineStyle({ parts: { anchor: { color: GOLD } } });
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

  /** The Canvas2D interpreter's picture of the scene at the current camera, in device px (straight alpha). */
  const canvas2DPicture = (): CanvasRenderingContext2D => {
    const canvas = Object.assign(document.createElement("canvas"), {
      width: VIEW.width * dpr,
      height: VIEW.height * dpr,
    });
    const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
    const { x, y, scale, width, height } = camera.getCameraState();
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * x, dpr * y);
    const viewport = { minX: -x / scale, minY: -y / scale, maxX: (width - x) / scale, maxY: (height - y) / scale };
    drawElements(ctx, store.query(viewport), scale, { styles: store.getStyles(), dimColor: store.getDimColor() });
    return ctx;
  };

  // C13: styles in WebGL. A translucent border override is blended like the Canvas2D picture (no screen door of alpha
  // to coverage), a style's raise draws a block above a later block of the same bucket, a base colour fills a rect
  // that has no fill.
  await check("C13", async () => {
    const stats = layer.getBackend()?.stats;
    if (!stats) throw new Error("no backend in C13");
    const TRANSLUCENT = "rgba(255, 0, 0, 0.3)";
    const FIRST = "#00a000";
    const SECOND = "#a000a0";
    const BASE = "#00c0ff";
    const ids = ["T", "U1", "U2", "W"];
    try {
      // A block whose border band (8 world units, inside) lies over its opaque body.
      store.add({
        id: "T",
        zIndex: 600,
        x: 0,
        y: 160,
        bounds: { minX: -1, minY: -1, maxX: 121, maxY: 81 },
        primitives: [
          { kind: "rect", x: 0, y: 0, width: 120, height: 80, fill: BODY_A, part: "body" },
          {
            kind: "rect",
            x: 0,
            y: 0,
            width: 120,
            height: 80,
            border: { color: BORDER, width: 8, align: "inside" },
            part: "border",
          },
        ],
      });
      const square = (id: string, x: number, y: number, fill?: string): TSceneElementInput => ({
        id,
        zIndex: 600,
        x,
        y,
        bounds: { minX: 0, minY: 0, maxX: 80, maxY: 60 },
        primitives: [{ kind: "rect", x: 0, y: 0, width: 80, height: 60, ...(fill ? { fill } : {}), part: "body" }],
      });
      store.add(square("U1", 160, 160, FIRST));
      store.add(square("U2", 200, 180, SECOND));
      store.add(square("W", 160, 260));

      // Translucent border override: re-encoded into the translucent pass, compared with the Canvas2D picture.
      readRegion(0, 0, 1, 1);
      const encodesBefore = stats.encodes;
      store.setStyle("T", store.defineStyle({ parts: { border: { color: TRANSLUCENT } } }));
      const band = regionAt(1, 180, 6, 40);
      const encodesAfter = stats.encodes;
      const [bx, by] = screenOf(1, 180);
      const reference = canvas2DPicture().getImageData(Math.floor(bx * dpr), Math.floor(by * dpr), band.w, band.h).data;
      let worst = 0;
      let minRed = 255;
      let maxRed = 0;
      for (let i = 0; i < band.data.length; i += 4) {
        for (let c = 0; c < 3; c++) worst = Math.max(worst, Math.abs(band.data[i + c] - reference[i + c]));
        minRed = Math.min(minRed, band.data[i]);
        maxRed = Math.max(maxRed, band.data[i]);
      }
      const blended = [0, 1, 2].map((c) => Math.round(0.3 * [255, 0, 0][c] + 0.7 * bodyA[c]));
      const sample = [band.data[0], band.data[1], band.data[2], band.data[3]];
      const ref = [reference[0], reference[1], reference[2], reference[3]];
      record(
        "C13",
        worst <= TOLERANCE && encodesAfter > encodesBefore,
        `translucent border ${TRANSLUCENT} over the body: ${band.w}x${band.h} device px of the band, worst channel ` +
          `difference from the Canvas2D picture=${worst} (want <=${TOLERANCE}); red min..max=${minRed}..${maxRed}; ` +
          `first px webgl=${show(sample)} canvas2d=${show(ref)} analytic=${show(blended)}; ` +
          `encodes ${encodesBefore}->${encodesAfter} (want more: baked into the element)`
      );

      // Raise: U2 is added later, so it covers U1 in the overlap until U1's style raises it by one.
      const overlap = (): TPixel => pixelAt(220, 200);
      const plain = overlap();
      const raise = store.defineStyle({ raise: 1 });
      store.setStyle("U1", raise);
      const raised = overlap();
      store.setStyle("U1", 0);
      const lowered = overlap();
      record(
        "C13",
        near(plain, hex(SECOND)) && near(raised, hex(FIRST)) && near(lowered, hex(SECOND)),
        `raise: overlap(220,200) plain=${show(plain)} want ${show(hex(SECOND))}; U1 with raise 1=${show(raised)} ` +
          `want ${show(hex(FIRST))}; back to row 0=${show(lowered)} want ${show(hex(SECOND))}`
      );

      // Base colour: W's rect has no fill, so it draws nothing until a style gives its part a base colour.
      const inside = (): TPixel => pixelAt(200, 290);
      const empty = inside();
      const encodesBeforeBase = stats.encodes;
      store.setStyle("W", store.defineStyle({ base: { body: { color: BASE } } }));
      const filled = inside();
      const encodesAfterBase = stats.encodes;
      const [wx, wy] = screenOf(200, 290);
      const wantRef = canvas2DPicture().getImageData(Math.floor(wx * dpr), Math.floor(wy * dpr), 1, 1).data;
      record(
        "C13",
        empty[3] === 0 &&
          near(filled, hex(BASE)) &&
          near(filled, Array.from(wantRef)) &&
          encodesAfterBase === encodesBeforeBase,
        `base fill: rect without fill=${show(empty)} (want alpha 0); with base ${BASE}=${show(filled)} want ` +
          `${show(hex(BASE))}, Canvas2D=${show(Array.from(wantRef))}; encodes ${encodesBeforeBase}->${encodesAfterBase} ` +
          `(want equal: a table property)`
      );
    } finally {
      for (const id of ids) if (store.get(id)) store.delete(id);
    }
  });

  /**
   * The worst channel difference between the WebGL pixels of a world rect and the Canvas2D picture, compared
   * premultiplied (readPixels is premultiplied, getImageData straight), and the first pixel of each (premultiplied).
   */
  const againstCanvas2D = (
    wx: number,
    wy: number,
    ww: number,
    wh: number
  ): { worst: number; webgl: TPixel; canvas2d: TPixel } => {
    const region = regionAt(wx, wy, ww, wh);
    const [sx, sy] = screenOf(wx, wy);
    const reference = canvas2DPicture().getImageData(
      Math.floor(sx * dpr),
      Math.floor(sy * dpr),
      region.w,
      region.h
    ).data;
    const premultiplied = (i: number, c: number): number =>
      c === 3 ? reference[i + 3] : Math.round((reference[i + c] * reference[i + 3]) / 255);
    let worst = 0;
    for (let i = 0; i < region.data.length; i += 4) {
      for (let c = 0; c < 4; c++) worst = Math.max(worst, Math.abs(region.data[i + c] - premultiplied(i, c)));
    }
    return {
      worst,
      webgl: [region.data[0], region.data[1], region.data[2], region.data[3]],
      canvas2d: [premultiplied(0, 0), premultiplied(0, 1), premultiplied(0, 2), premultiplied(0, 3)],
    };
  };

  /** The smallest red value of a world rect, in WebGL and in the Canvas2D picture: the core of dark glyphs. */
  const minRed = (wx: number, wy: number, ww: number, wh: number): { webgl: number; canvas2d: number } => {
    const region = regionAt(wx, wy, ww, wh);
    const [sx, sy] = screenOf(wx, wy);
    const reference = canvas2DPicture().getImageData(
      Math.floor(sx * dpr),
      Math.floor(sy * dpr),
      region.w,
      region.h
    ).data;
    let webgl = 255;
    let canvas2d = 255;
    for (let i = 0; i < region.data.length; i += 4) {
      webgl = Math.min(webgl, region.data[i]);
      canvas2d = Math.min(canvas2d, reference[i]);
    }
    return { webgl, canvas2d };
  };

  // C14: dim. A style's `dim` moves every paint of an element towards the scene's dim colour (the theme's layer
  // background) like the Canvas2D picture, re-encodes nothing and keeps the element's primitives in the opaque pass;
  // a part's own dim wins over the element's, and a translucent baked colour is dimmed by the shader too.
  await check("C14", async () => {
    const backend = layer.getBackend();
    const stats = backend?.stats;
    if (!backend || !stats) throw new Error("no backend in C14");
    // The harness reads the backend's per-pass rect instances (a private field) to see which pass an element is in.
    const rects = (backend as unknown as { rects: Record<"opaque" | "translucent", { ranges: { count: number } }> })
      .rects;
    const passCounts = (): string =>
      `opaque=${rects.opaque.ranges.count} translucent=${rects.translucent.ranges.count}`;
    const TRANSLUCENT = "rgba(0, 0, 255, 0.5)";
    const dimColor = store.getDimColor();
    if (!/^#[0-9a-f]{6}$/i.test(dimColor)) throw new Error(`C14 expects a #rrggbb dim colour, got ${dimColor}`);
    const dimRgb = hex(dimColor);
    const mixed = (rgb: readonly number[], t: number): number[] =>
      [0, 1, 2].map((c) => Math.round(rgb[c] + (dimRgb[c] - rgb[c]) * t));
    const ids = ["DM", "DY"];
    try {
      const countsBefore = { opaque: rects.opaque.ranges.count, translucent: rects.translucent.ranges.count };
      // A block with a body, an inside border band (8 world units), a black title and an anchor-like circle without a
      // part.
      store.add({
        id: "DM",
        zIndex: 700,
        x: 0,
        y: 340,
        bounds: { minX: -1, minY: -1, maxX: 161, maxY: 101 },
        primitives: [
          { kind: "rect", x: 0, y: 0, width: 160, height: 100, fill: BODY_A, part: "body" },
          {
            kind: "rect",
            x: 0,
            y: 0,
            width: 160,
            height: 100,
            border: { color: BORDER, width: 8, align: "inside" },
            part: "border",
          },
          {
            kind: "text",
            text: "Dim",
            family: "sans-serif",
            weight: "bold",
            size: 24,
            lineHeight: 28,
            color: "#000000",
            x: 12,
            y: 14,
            width: 120,
            part: "title",
          },
          { kind: "circle", cx: 60, cy: 70, r: 14, fill: ANCHOR },
        ],
      });
      // A translucent rect of a lower bucket, added after DM and partly under it.
      store.add({
        id: "DY",
        zIndex: 650,
        x: 120,
        y: 360,
        bounds: { minX: 0, minY: 0, maxX: 120, maxY: 80 },
        primitives: [{ kind: "rect", x: 0, y: 0, width: 120, height: 80, fill: TRANSLUCENT, part: "body" }],
      });
      const countsAdded = { opaque: rects.opaque.ranges.count, translucent: rects.translucent.ranges.count };
      const titleBefore = minRed(12, 354, 50, 28);

      readRegion(0, 0, 1, 1);
      const encodesBefore = stats.encodes;
      store.setStyle("DM", store.defineStyle({ dim: 0.5 }));
      const body = againstCanvas2D(88, 386, 24, 10);
      const band = againstCanvas2D(1, 370, 6, 40);
      const circle = againstCanvas2D(54, 404, 12, 12);
      const overlap = againstCanvas2D(124, 380, 24, 40);
      const title = minRed(12, 354, 50, 28);
      const encodesAfter = stats.encodes;
      const countsDimmed = passCounts();
      const wantBody = mixed(bodyA, 0.5);
      const wantTitle = mixed([0, 0, 0], 0.5)[0];
      const worst = Math.max(body.worst, band.worst, circle.worst, overlap.worst);
      record(
        "C14",
        worst <= TOLERANCE &&
          near(body.webgl, wantBody) &&
          near(band.webgl, mixed(hex(BORDER), 0.5)) &&
          near(circle.webgl, mixed(hex(ANCHOR), 0.5)) &&
          titleBefore.webgl <= TOLERANCE &&
          Math.abs(title.webgl - wantTitle) <= TOLERANCE &&
          Math.abs(title.webgl - title.canvas2d) <= TOLERANCE &&
          encodesAfter === encodesBefore,
        `dim 0.5 towards ${dimColor}: worst channel difference from the Canvas2D picture=${worst} (want ` +
          `<=${TOLERANCE}; body ${body.worst}, border band ${band.worst}, unparted circle ${circle.worst}, over the ` +
          `translucent rect ${overlap.worst}); body webgl=${show(body.webgl)} canvas2d=${show(body.canvas2d)} ` +
          `analytic=${show(wantBody)}; band=${show(band.webgl)}; circle=${show(circle.webgl)}; black title min red ` +
          `before=${titleBefore.webgl}, dimmed webgl=${title.webgl} canvas2d=${title.canvas2d} analytic=${wantTitle}; ` +
          `encodes ${encodesBefore}->${encodesAfter} (want equal: a table property)`
      );

      // The opaque pass: the dim moved no instance between passes, and DY, drawn after DM in the translucent pass,
      // stays under DM's dimmed body because DM wrote depth in the opaque pass.
      const countsPass =
        countsAdded.opaque === countsBefore.opaque + 3 &&
        countsAdded.translucent === countsBefore.translucent + 1 &&
        countsDimmed === `opaque=${countsAdded.opaque} translucent=${countsAdded.translucent}`;
      record(
        "C14",
        countsPass && near(overlap.webgl, wantBody) && overlap.worst <= TOLERANCE,
        `rect instances per pass: before DM and DY opaque=${countsBefore.opaque} ` +
          `translucent=${countsBefore.translucent}; with them opaque=${countsAdded.opaque} ` +
          `translucent=${countsAdded.translucent} (want +3 / +1); with dim ${countsDimmed} (want unchanged); ` +
          `DM over the translucent DY=${show(overlap.webgl)} want the dimmed body ${show(wantBody)}`
      );

      // A part's own dim wins over the element's; a translucent colour is dimmed in straight alpha, then premultiplied.
      store.setStyle("DM", store.defineStyle({ dim: 0.5, parts: { border: { dim: 0 } } }));
      store.setStyle("DY", store.defineStyle({ dim: 0.5 }));
      const keptBand = againstCanvas2D(1, 370, 6, 40);
      const stillBody = againstCanvas2D(88, 386, 24, 10);
      const glass = againstCanvas2D(175, 380, 50, 40);
      const encodesCascade = stats.encodes;
      const glassRgb = mixed([0, 0, 255], 0.5).map((c) => Math.round(c * (128 / 255)));
      record(
        "C14",
        Math.max(keptBand.worst, stillBody.worst, glass.worst) <= TOLERANCE &&
          near(keptBand.webgl, hex(BORDER)) &&
          near(stillBody.webgl, wantBody) &&
          near(glass.webgl, glassRgb) &&
          Math.abs(glass.webgl[3] - 128) <= TOLERANCE &&
          encodesCascade === encodesBefore &&
          passCounts() === countsDimmed,
        `border part dim 0 under element dim 0.5: band=${show(keptBand.webgl)} want ${show(hex(BORDER))} ` +
          `(worst vs Canvas2D ${keptBand.worst}); body=${show(stillBody.webgl)} want ${show(wantBody)} ` +
          `(worst ${stillBody.worst}); translucent ${TRANSLUCENT} with dim 0.5 over nothing=${show(glass.webgl)} ` +
          `canvas2d=${show(glass.canvas2d)} analytic premultiplied=${show([...glassRgb, 128])} (worst ${glass.worst}); ` +
          `encodes ${encodesBefore}->${encodesCascade} (want equal); ${passCounts()} (want ${countsDimmed})`
      );
    } finally {
      for (const id of ids) if (store.get(id)) store.delete(id);
    }
  });

  /** The largest red value of a world rect, premultiplied, in WebGL and in the Canvas2D picture: white glyph cores. */
  const maxRed = (wx: number, wy: number, ww: number, wh: number): { webgl: number; canvas2d: number } => {
    const region = regionAt(wx, wy, ww, wh);
    const [sx, sy] = screenOf(wx, wy);
    const reference = canvas2DPicture().getImageData(
      Math.floor(sx * dpr),
      Math.floor(sy * dpr),
      region.w,
      region.h
    ).data;
    let webgl = 0;
    let canvas2d = 0;
    for (let i = 0; i < region.data.length; i += 4) {
      webgl = Math.max(webgl, region.data[i]);
      canvas2d = Math.max(canvas2d, Math.round((reference[i] * reference[i + 3]) / 255));
    }
    return { webgl, canvas2d };
  };

  /** Premultiplied "over" of straight colours with alphas, bottom first; rgb rounded, alpha in 0..255. */
  const over = (...layers: [rgb: readonly number[], alpha: number][]): number[] => {
    let rgb = [0, 0, 0];
    let alpha = 0;
    for (const [color, a] of layers) {
      rgb = rgb.map((channel, c) => color[c] * a + channel * (1 - a));
      alpha = a + alpha * (1 - a);
    }
    return [...rgb.map(Math.round), Math.round(alpha * 255)];
  };

  // C15: opacity. A faded element matches the Canvas2D picture (each primitive fades on its own); translucent
  // primitives are drawn in scene order across programs: the upper element's body over the lower element's title, a
  // path over a rect of an element below it.
  await check("C15", async () => {
    const backend = layer.getBackend();
    const stats = backend?.stats;
    if (!backend || !stats) throw new Error("no backend in C15");
    const rects = (backend as unknown as { rects: Record<"opaque" | "translucent", { ranges: { count: number } }> })
      .rects;
    const passCounts = (): string =>
      `opaque=${rects.opaque.ranges.count} translucent=${rects.translucent.ranges.count}`;
    const white = [255, 255, 255];
    const red = [255, 0, 0];
    const blue = [0, 0, 255];
    const half = store.defineStyle({ opacity: 0.5 });
    const ids = ["OA", "P1", "P2", "R3", "Q3"];
    try {
      // 1. One element at opacity 0.5: body, inside border band, white title and an unparted circle.
      readRegion(0, 0, 1, 1);
      const noTranslucent = stats.translucentDrawCalls;
      store.add({
        id: "OA",
        zIndex: 800,
        x: 0,
        y: 160,
        bounds: { minX: -1, minY: -1, maxX: 161, maxY: 101 },
        primitives: [
          { kind: "rect", x: 0, y: 0, width: 160, height: 100, fill: BODY_A, part: "body" },
          {
            kind: "rect",
            x: 0,
            y: 0,
            width: 160,
            height: 100,
            border: { color: BORDER, width: 8, align: "inside" },
            part: "border",
          },
          {
            kind: "text",
            text: "Fade",
            family: "sans-serif",
            weight: "bold",
            size: 24,
            lineHeight: 28,
            color: "#ffffff",
            x: 12,
            y: 14,
            width: 120,
            part: "title",
          },
          { kind: "circle", cx: 60, cy: 70, r: 14, fill: ANCHOR },
        ],
      });
      readRegion(0, 0, 1, 1);
      const countsOpaque = passCounts();
      const encodesBefore = stats.encodes;
      store.setStyle("OA", half);
      const body = againstCanvas2D(100, 220, 24, 10);
      const band = againstCanvas2D(1, 190, 6, 40);
      const circle = againstCanvas2D(54, 224, 12, 12);
      const title = maxRed(12, 174, 60, 28);
      const fadedDraws = stats.translucentDrawCalls;
      const encodesAfter = stats.encodes;
      const countsFaded = passCounts();
      const wantBody = over([bodyA, 0.5]);
      const wantBand = over([bodyA, 0.5], [hex(BORDER), 0.5]);
      const wantCircle = over([bodyA, 0.5], [hex(ANCHOR), 0.5]);
      const wantTitle = over([bodyA, 0.5], [white, 0.5])[0];
      const worst = Math.max(body.worst, band.worst, circle.worst);
      record(
        "C15",
        worst <= TOLERANCE &&
          near(body.webgl, wantBody) &&
          Math.abs(body.webgl[3] - wantBody[3]) <= TOLERANCE &&
          near(band.webgl, wantBand) &&
          near(circle.webgl, wantCircle) &&
          Math.abs(title.webgl - title.canvas2d) <= TOLERANCE &&
          Math.abs(title.webgl - wantTitle) <= TOLERANCE &&
          encodesAfter > encodesBefore &&
          noTranslucent === 0 &&
          fadedDraws === 3,
        `opacity 0.5: worst channel difference from the Canvas2D picture=${worst} (want <=${TOLERANCE}; body ` +
          `${body.worst}, border band over the body ${band.worst}, unparted circle ${circle.worst}); body ` +
          `webgl=${show(body.webgl)} canvas2d=${show(body.canvas2d)} analytic=${show(wantBody)}; band=${show(band.webgl)} ` +
          `analytic=${show(wantBand)} (border over body: each primitive fades on its own); circle=${show(circle.webgl)} ` +
          `analytic=${show(wantCircle)}; white title max red webgl=${title.webgl} canvas2d=${title.canvas2d} ` +
          `analytic=${wantTitle}; encodes ${encodesBefore}->${encodesAfter} (want more: re-encoded); rect instances ` +
          `${countsOpaque} -> ${countsFaded}; translucent draw calls with no translucent content=${noTranslucent} ` +
          `(want 0), with OA faded=${fadedDraws} (want 3: rects, glyphs, rect)`
      );
      store.delete("OA");

      // 2. Two faded blocks of one bucket, P2 later than P1: P2's body covers P1's title.
      const titled = (id: string, x: number, y: number, fill: string, text: string, titleY: number) => ({
        id,
        zIndex: 810,
        x,
        y,
        bounds: { minX: -1, minY: -1, maxX: 161, maxY: 81 },
        primitives: [
          { kind: "rect" as const, x: 0, y: 0, width: 160, height: 80, fill, part: "body" },
          {
            kind: "text" as const,
            text,
            family: "sans-serif",
            weight: "bold",
            size: 24,
            lineHeight: 28,
            color: "#ffffff",
            x: 12,
            y: titleY,
            width: 140,
            part: "title",
          },
        ],
      });
      store.add(titled("P1", 0, 280, BODY_A, "Lower", 10));
      store.add(titled("P2", 60, 300, BODY_B, "Upper", 46));
      store.setStyle("P1", half);
      store.setStyle("P2", half);
      // P1's title where P2's body lies over it, and the two bodies away from the titles.
      const covered = maxRed(62, 301, 26, 16);
      const bodies = againstCanvas2D(100, 325, 30, 12);
      const pairDraws = stats.translucentDrawCalls;
      const wantCovered = over([bodyA, 0.5], [white, 0.5], [hex(BODY_B), 0.5])[0];
      const wrongCovered = over([bodyA, 0.5], [hex(BODY_B), 0.5], [white, 0.5])[0];
      const wantBodies = over([bodyA, 0.5], [hex(BODY_B), 0.5]);
      record(
        "C15",
        Math.abs(covered.webgl - covered.canvas2d) <= TOLERANCE &&
          Math.abs(covered.webgl - wantCovered) <= TOLERANCE &&
          bodies.worst <= TOLERANCE &&
          near(bodies.webgl, wantBodies) &&
          pairDraws === 4,
        `P1's white title under P2's faded body: max red webgl=${covered.webgl} canvas2d=${covered.canvas2d} ` +
          `analytic=${wantCovered} (the title over P2's body would give ${wrongCovered}); the bodies' overlap ` +
          `webgl=${show(bodies.webgl)} canvas2d=${show(bodies.canvas2d)} analytic=${show(wantBodies)} (worst ` +
          `${bodies.worst}); translucent draw calls=${pairDraws} (want 4: rects, glyphs, rects, glyphs)`
      );
      store.delete("P1");
      store.delete("P2");

      // 3. A faded path over a faded rect of an element below it in the same bucket.
      store.add({
        id: "R3",
        zIndex: 820,
        x: 0,
        y: 410,
        bounds: { minX: 0, minY: 0, maxX: 160, maxY: 60 },
        primitives: [{ kind: "rect", x: 0, y: 0, width: 160, height: 60, fill: "#0000ff" }],
      });
      store.add({
        id: "Q3",
        zIndex: 820,
        x: 0,
        y: 0,
        bounds: { minX: -20, minY: 434, maxX: 200, maxY: 446 },
        primitives: [
          { kind: "path", segments: lineOf([-20, 440], [200, 440]), stroke: { color: "#ff0000", width: 10 } },
        ],
      });
      store.setStyle("R3", half);
      store.setStyle("Q3", half);
      const crossing = againstCanvas2D(40, 438, 40, 4);
      const pathDraws = stats.translucentDrawCalls;
      const wantCrossing = over([blue, 0.5], [red, 0.5]);
      const wrongCrossing = over([red, 0.5], [blue, 0.5]);
      record(
        "C15",
        crossing.worst <= TOLERANCE &&
          near(crossing.webgl, wantCrossing) &&
          Math.abs(crossing.webgl[3] - wantCrossing[3]) <= TOLERANCE &&
          pathDraws === 2,
        `faded red path over the faded blue rect of an earlier element: webgl=${show(crossing.webgl)} ` +
          `canvas2d=${show(crossing.canvas2d)} analytic=${show(wantCrossing)} (the rect over the path would give ` +
          `${show(wrongCrossing)}; worst ${crossing.worst}); translucent draw calls=${pathDraws} (want 2: rect, path)`
      );
    } finally {
      for (const id of ids) if (store.get(id)) store.delete(id);
    }
  });

  // C16: translucent batching by overlap levels. Faded elements that do not overlap share draw calls; overlapping ones
  // keep scene order; a move re-levels them in the next frame; a translucent buffer that grows while a draw pointed
  // inside it still draws right.
  await check("C16", async () => {
    const backend = layer.getBackend();
    const stats = backend?.stats;
    if (!backend || !stats) throw new Error("no backend in C16");
    type TBatchView = {
      ranges: { count: number; layoutRevision: number };
      buffer: { byteLength: number; generation: number };
    };
    const internals = backend as unknown as {
      rects: Record<"translucent", TBatchView>;
      translucentRuns: { source: number; first: number; count: number }[];
      translucentBatches: unknown[];
    };
    const white = [255, 255, 255];
    const half = store.defineStyle({ opacity: 0.5 });
    const ids: string[] = [];
    /** A faded element: a body rect and a white title, at zIndex 900 (one bucket, so order decides). */
    const faded = (
      id: string,
      x: number,
      y: number,
      w: number,
      h: number,
      fill: string,
      titleY: number,
      text = "Abcdefgh",
      size = 16
    ): void => {
      store.add({
        id,
        zIndex: 900,
        x,
        y,
        bounds: { minX: 0, minY: 0, maxX: w, maxY: h },
        primitives: [
          { kind: "rect", x: 0, y: 0, width: w, height: h, fill, part: "body" },
          {
            kind: "text",
            text,
            family: "sans-serif",
            weight: "bold",
            size,
            lineHeight: size + 2,
            color: "#ffffff",
            x: 3,
            y: titleY,
            width: w - 6,
            part: "title",
          },
        ],
      });
      store.setStyle(id, half);
      ids.push(id);
    };
    const remove = (): void => {
      for (const id of ids.splice(0)) if (store.get(id)) store.delete(id);
    };
    try {
      setCamera(1);
      // 1. A 10 x 10 grid of faded elements, 5 and 8 world units apart: one level, one draw per program.
      for (let i = 0; i < 100; i++) {
        faded(`G${i}`, -96 + (i % 10) * 39, 130 + Math.floor(i / 10) * 36, 34, 28, BODY_A, 3, "Ab", 12);
      }
      readRegion(0, 0, 1, 1);
      const gridDraws = stats.translucentDrawCalls;
      const gridLevels = stats.translucentLevels;
      const corner = (i: number): [number, number] => [-96 + (i % 10) * 39, 130 + Math.floor(i / 10) * 36];
      const bodies = [0, 55, 99].map((i) => {
        const [x, y] = corner(i);
        return againstCanvas2D(x + 2, y + 20, 30, 6);
      });
      const [tx, ty] = corner(44);
      const gridTitle = maxRed(tx + 2, ty + 2, 30, 16);
      const wantGridBody = over([bodyA, 0.5]);
      const wantGridTitle = over([bodyA, 0.5], [white, 0.5])[0];
      const gridWorst = Math.max(...bodies.map((body) => body.worst));
      record(
        "C16",
        gridDraws <= 6 &&
          gridLevels === 1 &&
          gridWorst <= TOLERANCE &&
          bodies.every((body) => near(body.webgl, wantGridBody)) &&
          Math.abs(gridTitle.webgl - gridTitle.canvas2d) <= TOLERANCE &&
          Math.abs(gridTitle.webgl - wantGridTitle) <= TOLERANCE,
        `100 faded elements apart (body rect + title): translucent draw calls=${gridDraws} (want <=6; rects, ` +
          `glyphs), levels=${gridLevels} (want 1); bodies of elements 0, 55, 99 worst vs Canvas2D=${gridWorst} ` +
          `(want <=${TOLERANCE}) webgl=${bodies.map((body) => show(body.webgl)).join(" ")} analytic=` +
          `${show(wantGridBody)}; title 44 max red webgl=${gridTitle.webgl} canvas2d=${gridTitle.canvas2d} ` +
          `analytic=${wantGridTitle}; levels ${stats.lastLevelsMs.toFixed(3)} ms, order ` +
          `${stats.lastTranslucentOrderMs.toFixed(3)} ms`
      );
      remove();

      // 2. A stack of three: each later body covers the earlier body, and S2's body covers S1's title.
      const S1 = BODY_A;
      const S2 = "#208040";
      const S3 = "#202080";
      faded("S1", 0, 140, 120, 80, S1, 4);
      faded("S2", 40, 150, 120, 80, S2, 50);
      faded("S3", 80, 160, 120, 80, S3, 50);
      readRegion(0, 0, 1, 1);
      const stackDraws = stats.translucentDrawCalls;
      const stackLevels = stats.translucentLevels;
      // Below S3's title and above S2's (both at y + 50).
      const triple = againstCanvas2D(84, 166, 30, 28);
      const wantTriple = over([hex(S1), 0.5], [hex(S2), 0.5], [hex(S3), 0.5]);
      const wrongTriple = over([hex(S1), 0.5], [hex(S3), 0.5], [hex(S2), 0.5]);
      // S1's title where S2's body lies over it.
      const stackTitle = maxRed(42, 151, 26, 10);
      const wantStackTitle = over([hex(S1), 0.5], [white, 0.5], [hex(S2), 0.5])[0];
      const wrongStackTitle = over([hex(S1), 0.5], [hex(S2), 0.5], [white, 0.5])[0];
      record(
        "C16",
        triple.worst <= TOLERANCE &&
          near(triple.webgl, wantTriple) &&
          Math.abs(stackTitle.webgl - stackTitle.canvas2d) <= TOLERANCE &&
          Math.abs(stackTitle.webgl - wantStackTitle) <= TOLERANCE &&
          stackDraws === 6 &&
          stackLevels === 3,
        `stack of three faded elements: the triple overlap webgl=${show(triple.webgl)} canvas2d=` +
          `${show(triple.canvas2d)} analytic=${show(wantTriple)} (worst ${triple.worst}; S3 under S2 would give ` +
          `${show(wrongTriple)}); S1's white title under S2's body max red webgl=${stackTitle.webgl} canvas2d=` +
          `${stackTitle.canvas2d} analytic=${wantStackTitle} (over S2's body would give ${wrongStackTitle}); ` +
          `translucent draw calls=${stackDraws} (want 6: rects and glyphs per level), levels=${stackLevels} (want 3)`
      );
      remove();

      // 3. Drag: D2, between D1 and D3 in scene order, moves onto D1 by an x update; D2's body must cover D1's title
      //    in the next frame. The move changes no range: D2's instances stay between D1's and D3's and are drawn
      //    from there on level 1.
      faded("D1", 0, 250, 120, 70, BODY_A, 30);
      faded("D2", 140, 250, 120, 70, BODY_B, 4);
      faded("D3", 0, 330, 120, 60, "#406020", 4);
      readRegion(0, 0, 1, 1);
      const apartDraws = stats.translucentDrawCalls;
      const apartLevels = stats.translucentLevels;
      const rectRanges = internals.rects.translucent.ranges;
      const layoutBefore = rectRanges.layoutRevision;
      store.update("D2", { x: 40 });
      const dragged = maxRed(42, 281, 26, 15);
      const draggedDraws = stats.translucentDrawCalls;
      const draggedLevels = stats.translucentLevels;
      const layoutAfter = rectRanges.layoutRevision;
      const draggedBodies = againstCanvas2D(84, 300, 30, 16);
      const third = againstCanvas2D(20, 360, 60, 20);
      const wantDragged = over([bodyA, 0.5], [white, 0.5], [hex(BODY_B), 0.5])[0];
      const wrongDragged = over([bodyA, 0.5], [hex(BODY_B), 0.5], [white, 0.5])[0];
      const wantDraggedBodies = over([bodyA, 0.5], [hex(BODY_B), 0.5]);
      record(
        "C16",
        Math.abs(dragged.webgl - dragged.canvas2d) <= TOLERANCE &&
          Math.abs(dragged.webgl - wantDragged) <= TOLERANCE &&
          draggedBodies.worst <= TOLERANCE &&
          near(draggedBodies.webgl, wantDraggedBodies) &&
          third.worst <= TOLERANCE &&
          apartDraws === 2 &&
          apartLevels === 1 &&
          draggedDraws === 6 &&
          draggedLevels === 2 &&
          layoutAfter === layoutBefore,
        `drag by x: D1's white title under the dragged D2's body, next frame, max red webgl=${dragged.webgl} ` +
          `canvas2d=${dragged.canvas2d} analytic=${wantDragged} (the stale order would give ${wrongDragged}); ` +
          `bodies' overlap webgl=${show(draggedBodies.webgl)} analytic=${show(wantDraggedBodies)} (worst ` +
          `${draggedBodies.worst}); D3's body worst vs Canvas2D ${third.worst}; translucent draw calls apart=` +
          `${apartDraws} (want 2), levels ${apartLevels} (want 1); after the drag=${draggedDraws} (want 6: D2's ` +
          `instances drawn where they lie, so level 0 takes two draws per program), levels ${draggedLevels} (want ` +
          `2); rect layout revision ${layoutBefore}->${layoutAfter} (want equal: no data moved); levels ` +
          `${stats.lastLevelsMs.toFixed(3)} ms, order ${stats.lastTranslucentOrderMs.toFixed(3)} ms`
      );

      // 4. The previous frame drew rects from instances 1 and 2. Grow the translucent rect buffer past its capacity in
      //    one frame: the draws that start inside it must still read the right instances.
      const rects = internals.rects.translucent;
      const runsBefore = internals.translucentRuns.filter(
        (run) => internals.translucentBatches[run.source] === rects && run.first > 0
      ).length;
      const capacity = rects.buffer.byteLength / (28 * 4);
      const generation = rects.buffer.generation;
      const extra = capacity - rects.ranges.count + 16;
      // 17 per row, left of C11's rects (x >= 300).
      const smallAt = (i: number): [number, number] => [160 + (i % 17) * 8, 330 + Math.floor(i / 17) * 8];
      for (let i = 0; i < extra; i++) {
        const id = `E${i}`;
        const [sx, sy] = smallAt(i);
        store.add({
          id,
          zIndex: 900,
          x: sx,
          y: sy,
          bounds: { minX: 0, minY: 0, maxX: 6, maxY: 6 },
          primitives: [{ kind: "rect", x: 0, y: 0, width: 6, height: 6, fill: "#c03000" }],
        });
        store.setStyle(id, half);
        ids.push(id);
      }
      const grownTitle = maxRed(42, 281, 26, 15);
      const grownBodies = againstCanvas2D(84, 300, 30, 16);
      const [lx, ly] = smallAt(extra - 1);
      const firstSmall = againstCanvas2D(161, 331, 4, 4);
      const lastSmall = againstCanvas2D(lx + 1, ly + 1, 4, 4);
      const runsAfter = internals.translucentRuns.filter(
        (run) => internals.translucentBatches[run.source] === rects && run.first > 0
      );
      const grownWorst = Math.max(grownBodies.worst, firstSmall.worst, lastSmall.worst);
      record(
        "C16",
        runsBefore > 0 &&
          runsAfter.length > 0 &&
          rects.buffer.generation !== generation &&
          rects.buffer.byteLength > capacity * 28 * 4 &&
          grownWorst <= TOLERANCE &&
          Math.abs(grownTitle.webgl - grownTitle.canvas2d) <= TOLERANCE &&
          Math.abs(grownTitle.webgl - wantDragged) <= TOLERANCE,
        `resize while pointed inside: rect runs with first>0 before=${runsBefore} (want >0); ${extra} faded rects ` +
          `added in one frame, translucent rect capacity ${capacity} -> ${rects.buffer.byteLength / (28 * 4)} ` +
          `instances (generation ${generation} -> ${rects.buffer.generation}); rect runs with first>0 after: ` +
          `${runsAfter.map((run) => `${run.first}+${run.count}`).join(", ")}; D1's title under D2 max red ` +
          `webgl=${grownTitle.webgl} canvas2d=${grownTitle.canvas2d} analytic=${wantDragged}; worst vs Canvas2D ` +
          `(bodies ${grownBodies.worst}, first small ${firstSmall.worst}, last small ${lastSmall.worst})=${grownWorst} ` +
          `(want <=${TOLERANCE}); translucent draw calls=${stats.translucentDrawCalls}`
      );
      remove();

      // 5. Raises among 10,000 faded elements in one band, off screen. Raising an opaque element renumbers the dense
      //    ranks of the whole band, but the faded ones keep their order: no level update and no new draw runs.
      //    Raising a faded element updates the levels. The elements stay: 10,000 deletes one by one would cost more
      //    than the check (each delete compacts the instance lists).
      const FADED = 10000;
      const probes = ["MO0", "MO1", "MO2"];
      for (const id of probes) {
        store.add({
          id,
          zIndex: 960,
          x: 1900,
          y: 1900,
          bounds: { minX: 0, minY: 0, maxX: 20, maxY: 16 },
          primitives: [{ kind: "rect", x: 0, y: 0, width: 20, height: 16, fill: "#3060a0" }],
        });
      }
      const addStart = performance.now();
      for (let i = 0; i < FADED; i++) {
        const id = `F${i}`;
        store.add({
          id,
          zIndex: 960,
          x: 2000 + (i % 100) * 30,
          y: 2000 + Math.floor(i / 100) * 30,
          bounds: { minX: 0, minY: 0, maxX: 20, maxY: 16 },
          primitives: [
            { kind: "rect", x: 0, y: 0, width: 20, height: 16, fill: BODY_A, part: "body" },
            {
              kind: "text",
              text: "Ab",
              family: "sans-serif",
              size: 10,
              lineHeight: 12,
              color: "#ffffff",
              x: 2,
              y: 2,
              width: 16,
              part: "title",
            },
          ],
        });
        store.setStyle(id, half);
      }
      const addMs = performance.now() - addStart;
      const tick = (): number => {
        layer.performRender();
        const start = performance.now();
        graph.scheduler.performUpdate();
        return performance.now() - start;
      };
      const firstTick = tick();
      const fullLevelsMs = stats.lastLevelsMs;
      const fullOrderMs = stats.lastTranslucentOrderMs;
      const fadedLevels = stats.translucentLevels;
      const raise = (id: string): { call: number; tick: number; levels: boolean; order: boolean } => {
        stats.lastLevelsMs = -1;
        stats.lastTranslucentOrderMs = -1;
        const start = performance.now();
        store.raise(id);
        const call = performance.now() - start;
        return { call, tick: tick(), levels: stats.lastLevelsMs !== -1, order: stats.lastTranslucentOrderMs !== -1 };
      };
      const opaque = probes.map(raise);
      const fadedRaise = raise("F0");
      const ms = (value: number): string => value.toFixed(2);
      record(
        "C16",
        opaque.every((result) => !result.levels && !result.order) && fadedRaise.levels && fadedLevels === 1,
        `raises among ${FADED} faded elements (one band, ${fadedLevels} level): opaque raise x3 call ` +
          `${opaque.map((result) => ms(result.call)).join("/")} ms + tick ${opaque.map((result) => ms(result.tick)).join("/")} ` +
          `ms, level update ran=${opaque.map((result) => result.levels).join("/")} (want false), draw runs rebuilt=` +
          `${opaque.map((result) => result.order).join("/")} (want false); faded raise call ${ms(fadedRaise.call)} ms + ` +
          `tick ${ms(fadedRaise.tick)} ms, level update ran=${fadedRaise.levels} (want true; ${ms(stats.lastLevelsMs)} ` +
          `ms), draw runs rebuilt=${fadedRaise.order} (no level changed); adding them took ${ms(addMs)} ms, the ` +
          `first tick ${ms(firstTick)} ms (full level build ${ms(fullLevelsMs)} ms, compact sort ${ms(fullOrderMs)} ms)`
      );
    } finally {
      remove();
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
