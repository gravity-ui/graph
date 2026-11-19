// WebGL scene vertical-slice harness: checks C1-C35 and measurements M2-M8, run in
// Chromium with the real GPU.
// Pixels are read with gl.readPixels in the same task as a synchronous render (the drawing buffer is not preserved).
// readPixels returns PREMULTIPLIED RGBA; every sampled point lies over an opaque block or is compared as such, so the
// values are compared as read (premultiplied) and need no un-premultiplication. C14 also compares a translucent rect
// over nothing: it premultiplies the Canvas2D reference instead.
import {
  Anchor,
  BlockGroups,
  CanvasBlock,
  CollapsibleGroup,
  Graph,
  SceneComponent,
  createBlockPointPortId,
  hoveredTag,
  pointerTargetAfter,
} from "GRAPH";
import type {
  ChildDescriptor,
  TAnchor,
  TAnchorClass,
  TBlock,
  TBlockComponentState,
  TCollapsibleGroup,
  TGraphComponentProps,
  TSceneLevel,
} from "GRAPH";
import { dashFlow } from "GRAPH_SRC/components/canvas/connections/effects";
import { lineSegment } from "GRAPH_SRC/components/canvas/connections/geometry/segments";
import { initGraphColors } from "GRAPH_SRC/graphConfig";
import { drawElements } from "GRAPH_SRC/lib/scene/drawPrimitives";
import { elementBounds } from "GRAPH_SRC/lib/scene/elementBounds";
import { resolveTextSize } from "GRAPH_SRC/lib/scene/textLayout";
import { sceneTextLayout, sceneTextMetrics } from "GRAPH_SRC/lib/scene/textMetrics";
import type { TSceneElementInput } from "GRAPH_SRC/lib/scene/SceneStore";
import type { TSceneRendererState } from "GRAPH_SRC/services/scene/types";
import type { TScenePrimitive, TSceneStyle } from "GRAPH_SRC/lib/scene/types";
import type { InstanceRanges } from "GRAPH_SRC/lib/scene/webgl/InstanceRanges";
import { spaceKerning } from "GRAPH_SRC/lib/scene/webgl/glyphs";
import type { TTranslucentPart } from "GRAPH_SRC/lib/scene/webgl/translucentOrder";

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

/** C30: a 16 x 16 square instead of the stock dot, on the schematic level. */
class SliceSquareAnchor extends Anchor {
  public static override SIZE = 16;
  public static override LOOK_EXTENT = 8;

  protected override schematic(): readonly TScenePrimitive[] {
    return [{ kind: "rect", part: "anchor", x: -8, y: -8, width: 16, height: 16 }];
  }
}

/** C30 and C30b: an 80 x 80 square on the minimalistic level only, declared in its creation levels. */
class SliceFarAnchor extends Anchor {
  public static override LOOK_EXTENT = 40;

  public static override CREATION_LEVELS: readonly TSceneLevel[] = ["minimalistic", "schematic", "detailed"];

  protected override minimalistic(): readonly TScenePrimitive[] {
    return [{ kind: "rect", part: "anchor", x: -40, y: -40, width: 80, height: 80 }];
  }
}

/** C30 and C30b: OUT anchors are squares, IN anchors draw on the minimalistic level. */
class SliceShapesBlock extends CanvasBlock {
  protected override getAnchorClass(anchor: TAnchor): TAnchorClass {
    return anchor.type === "OUT" ? SliceSquareAnchor : SliceFarAnchor;
  }
}

type TSliceChipProps = TGraphComponentProps & { id: string; x: number; color: string; inner?: ChildDescriptor[] };

/** C31: a 40 x 30 rect at (x, 60) in its block's frame, and what is nested in it, drawn on every level. */
class SliceChip extends SceneComponent<TSliceChipProps> {
  public static override entityType = "sliceChip";

  public override getEntityId(): string {
    return this.props.id;
  }

  public setHiddenLook(hidden: boolean): void {
    this.setVisibility(!hidden, { removeHitbox: false });
  }

  protected override schematic(): readonly TScenePrimitive[] {
    return [{ kind: "rect", part: "chip", x: this.props.x, y: 60, width: 40, height: 30, fill: this.props.color }];
  }

  protected override updateChildren(): ChildDescriptor[] {
    return this.props.inner ?? [];
  }
}

/** C31: chip A (blue, x 20..60) with a nested orange chip at x 30..70, then chip B (green, x 50..90). */
class SliceNestedBlock extends CanvasBlock {
  public chipA?: SliceChip;

  protected override updateChildren(): ChildDescriptor[] {
    const id = String(this.props.id);
    const inner = [SliceChip.create({ id: `${id}/a1`, x: 30, color: "#ff8800" }, { key: "a1" })];
    const chipA = SliceChip.create(
      { id: `${id}/a`, x: 20, color: "#0000ff", inner },
      {
        key: "a",
        ref: (component: SliceChip): void => {
          this.chipA = component;
        },
      }
    );
    return [chipA, SliceChip.create({ id: `${id}/b`, x: 50, color: "#00aa00" }, { key: "b" })];
  }
}

/** C32: a 50 x 30 button at the block's bottom right, drawn on the schematic level, filled #00aaff. */
class SliceButton extends SceneComponent<TGraphComponentProps & { id: string; width: number }> {
  public static override entityType = "sliceButton";

  protected override willMount(): void {
    super.willMount();
    // It tags itself while it is the target (D5: no library default does it).
    const follow = (event: Event): void => this.setHoveredTag(pointerTargetAfter(event) === this);
    this.addEventListener("mouseenter", follow);
    this.addEventListener("mouseleave", follow);
  }

  public override getEntityId(): string {
    return this.props.id;
  }

  protected override minimalistic(): readonly TScenePrimitive[] {
    return [];
  }

  protected override schematic(): readonly TScenePrimitive[] {
    return [{ kind: "rect", part: "button", x: this.props.width - 50, y: 70, width: 50, height: 30, fill: "#00aaff" }];
  }

  protected override detailed(): readonly TScenePrimitive[] {
    return [];
  }
}

/** C32: the button before the anchors, so the OUT anchor draws over it. */
class SliceChildBlock extends CanvasBlock {
  public button?: SliceButton;

  protected override stateChanged(next: TBlockComponentState): void {
    if (this.state.width !== next.width) this.shouldUpdateChildren = true;
    super.stateChanged(next);
  }

  protected override updateChildren(): ChildDescriptor[] {
    const button = SliceButton.create(
      { id: String(this.props.id), width: this.state.width },
      {
        key: "button",
        ref: (component: SliceButton): void => {
          this.button = component;
        },
      }
    );
    return [button, ...super.updateChildren()];
  }
}

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
  /** console.error and console.warn lines of the run: C21 looks for a backend failure or a scene limit error. */
  const consoleErrors: string[] = [];
  for (const level of ["error", "warn"] as const) {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]): void => {
      consoleErrors.push(args.map(String).join(" "));
      original(...args);
    };
  }

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

  /** Reads of the current check: where each came from. A check other than C9 and C35 must read only from webgl. */
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
    // C9 reads through a context loss on purpose, C35 the Canvas 2D renderer.
    if (id !== "C9" && id !== "C35") {
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
    drawElements(ctx, store.query(viewport), scale, {
      styles: store.getStyles(),
      dimColor: store.getDimColor(),
      level: graph.scene.$level.value,
      textPolicy: { cameraAware: graph.scene.$cameraAwareText.value },
    });
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
          `${show(hex(BASE))}, Canvas2D=${show(Array.from(wantRef))}; encodes ` +
          `${encodesBeforeBase}->${encodesAfterBase} ` +
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
      // Store changes reach the backend in the next frame: the earlier checks' deletes are applied by this render.
      readRegion(0, 0, 1, 1);
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
      // Store changes reach the backend in the next frame: render one before reading its instance counts.
      readRegion(0, 0, 1, 1);
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
          `before=${titleBefore.webgl}, dimmed webgl=${title.webgl} canvas2d=${title.canvas2d} ` +
          `analytic=${wantTitle}; ` +
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
          `canvas2d=${show(glass.canvas2d)} analytic premultiplied=${show([...glassRgb, 128])} (worst ` +
          `${glass.worst}); ` +
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
          `webgl=${show(body.webgl)} canvas2d=${show(body.canvas2d)} analytic=${show(wantBody)}; ` +
          `band=${show(band.webgl)} ` +
          `analytic=${show(wantBand)} (border over body: each primitive fades on its own); ` +
          `circle=${show(circle.webgl)} ` +
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
      translucentParts: readonly TTranslucentPart[];
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
      const offsetRectRuns = () =>
        internals.translucentParts
          .flatMap(({ runs, first, end }) => runs.slice(first, end))
          .filter((run) => internals.translucentBatches[run.source] === rects && run.first > 0);
      const runsBefore = offsetRectRuns().length;
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
      const runsAfter = offsetRectRuns();
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
          `(bodies ${grownBodies.worst}, first small ${firstSmall.worst}, last small ` +
          `${lastSmall.worst})=${grownWorst} ` +
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
      const raiseLevelsMs = stats.lastLevelsMs;
      // Review C1: raising all faded elements at once is one renumber of their band.
      const everyFaded = Array.from({ length: FADED }, (_, i) => `F${i}`);
      stats.lastLevelsMs = -1;
      const raiseAllStart = performance.now();
      store.raiseMany(everyFaded);
      const raiseAllCall = performance.now() - raiseAllStart;
      const raiseAllTick = tick();
      const ms = (value: number): string => value.toFixed(2);
      record(
        "C16",
        opaque.every((result) => !result.levels && !result.order) && fadedRaise.levels && fadedLevels === 1,
        `raises among ${FADED} faded elements (one band, ${fadedLevels} level): opaque raise x3 call ` +
          `${opaque.map((result) => ms(result.call)).join("/")} ms + tick ` +
          `${opaque.map((result) => ms(result.tick)).join("/")} ` +
          `ms, level update ran=${opaque.map((result) => result.levels).join("/")} (want false), draw runs rebuilt=` +
          `${opaque.map((result) => result.order).join("/")} (want false); faded raise call ${ms(fadedRaise.call)} ` +
          `ms + ` +
          `tick ${ms(fadedRaise.tick)} ms, level update ran=${fadedRaise.levels} (want true; ${ms(raiseLevelsMs)} ` +
          `ms), draw runs rebuilt=${fadedRaise.order} (no level changed); adding them took ${ms(addMs)} ms, the ` +
          `first tick ${ms(firstTick)} ms (full level build ${ms(fullLevelsMs)} ms, compact sort ${ms(fullOrderMs)} ` +
          `ms); raiseMany of ${FADED}: call ${ms(raiseAllCall)} ms + tick ${ms(raiseAllTick)} ms (apply ` +
          `${ms(stats.lastApplyMs)} ms, levels ${ms(stats.lastLevelsMs)} ms)`
      );
    } finally {
      remove();
    }
  });

  // C17: level masks. One element holds a red rect for minimalistic, a green one for schematic and a blue one for
  // detailed at the same place; each level shows its own rect, as the Canvas2D picture does, and changing the level by
  // zooming re-encodes nothing.
  await check("C17", async () => {
    const stats = layer.getBackend()?.stats;
    if (!stats) throw new Error("no backend in C17");
    const fills: Array<[string, number]> = [
      ["#ff0000", 1],
      ["#00ff00", 2],
      ["#0000ff", 4],
    ];
    store.add({
      id: "LV",
      zIndex: 200,
      x: 0,
      y: 900,
      bounds: { minX: 0, minY: 0, maxX: 60, maxY: 60 },
      primitives: fills.map(([fill, levelMask]) => ({
        kind: "rect" as const,
        x: 0,
        y: 0,
        width: 60,
        height: 60,
        fill,
        levelMask,
      })),
    });
    try {
      readRegion(0, 0, 1, 1);
      const encodesBefore = stats.encodes;
      const lines: string[] = [];
      let pass = true;
      const steps = [
        [0.1, "minimalistic", "#ff0000"],
        [0.3, "schematic", "#00ff00"],
        [0.9, "detailed", "#0000ff"],
      ] as const;
      for (const [scale, level, fill] of steps) {
        camera.set({ scale, x: ORIGIN.x, y: ORIGIN.y - 900 * scale });
        const pixel = pixelAt(30, 930);
        const against = againstCanvas2D(25, 925, 10, 10);
        const ok = graph.scene.$level.value === level && near(pixel, hex(fill)) && against.worst <= TOLERANCE;
        pass = pass && ok;
        lines.push(`${level}@${scale}: ${show(pixel)} want ${fill}, canvas2d worst ${against.worst}`);
      }
      const encodes = stats.encodes - encodesBefore;
      record("C17", pass && encodes === 0, `${lines.join("; ")}; encodes during level changes=${encodes} (want 0)`);
    } finally {
      store.delete("LV");
      setCamera(1);
    }
  });

  // C18: child elements. P (blue) owns child C (a red circle on its right edge); Q (green) is a later owner of the same
  // bucket that covers C's right half; X, an owner of the same bucket off screen, lies between P and Q. Five lines:
  // 1. order: C draws above P and under Q; raising P brings C above Q and re-encodes nothing (with X between them, the
  //    ranks move by two, so a child texel that kept P's old key falls under Q, also at (101, 1130) where P does not
  //    cover C); hiding P hides C; P's dim and C's own opacity show on C as on Canvas2D.
  // 2. re-basing: a later sibling C2 (an orange square) draws over C; C grows to three primitives, its circle moving to
  //    sub 3, and C2 still draws over it: C2 is re-based from sub 2 to 4 (4 primitives re-encoded: C's 3, C2's 1).
  // 3. childOrder: moving C after C2 draws C over C2 in the next frame.
  // 4. translucent: P, Q and C faded (C joins the translucent set before P, so an order that dropped C's sub base would
  //    tie them and leave C under P); C over P over Q, as on Canvas2D, on at least 3 overlap levels.
  // 5. one frame: C moves, P is deleted (with C) and both are added again, P hidden, without a read in between: C stays
  //    hidden until P is shown, and the renderer stays webgl.
  await check("C18", async () => {
    const stats = layer.getBackend()?.stats;
    if (!stats) throw new Error("no backend in C18");
    const BLUE = "#2040c0";
    const RED = "#e02020";
    const GREEN = "#20c040";
    const ORANGE = "#f09000";
    const box = (fill: string, width: number, height: number): TScenePrimitive => ({
      kind: "rect",
      x: 0,
      y: 0,
      width,
      height,
      fill,
    });
    const circle = (r: number): TScenePrimitive => ({ kind: "circle", cx: 0, cy: 0, r, fill: RED });
    /** Style rows of the check, freed at its end. */
    const rows: number[] = [];
    const defineRow = (style: TSceneStyle): number => {
      const id = store.defineStyle(style);
      rows.push(id);
      return id;
    };
    const addP = (hidden: boolean): void => {
      store.add({
        id: "P",
        hidden,
        zIndex: 200,
        x: 0,
        y: 1100,
        bounds: { minX: 0, minY: 0, maxX: 100, maxY: 60 },
        primitives: [box(BLUE, 100, 60)],
      });
    };
    const addC = (x: number): void => {
      store.add({
        id: "C",
        parent: "P",
        childOrder: 0,
        zIndex: 0,
        x,
        y: 1130,
        bounds: { minX: -12, minY: -12, maxX: 12, maxY: 12 },
        primitives: [circle(12)],
      });
    };
    addP(false);
    // P has its depth key before C is added, so C's texel carries P's key from its add on and only the raise moves it
    // (line 5 covers a child added in its parent's frame).
    readRegion(0, 0, 1, 1);
    addC(90);
    store.add({
      id: "X",
      zIndex: 200,
      x: 1000,
      y: 1100,
      bounds: { minX: 0, minY: 0, maxX: 20, maxY: 20 },
      primitives: [box(GREEN, 20, 20)],
    });
    store.add({
      id: "Q",
      zIndex: 200,
      x: 95,
      y: 1100,
      bounds: { minX: 0, minY: 0, maxX: 60, maxY: 60 },
      primitives: [box(GREEN, 60, 60)],
    });
    camera.set({ scale: 1, x: ORIGIN.x, y: ORIGIN.y - 1100 });
    type TPart = {
      pixel: (label: string, wx: number, wy: number, color: string, want?: boolean) => void;
      expect: (ok: boolean, line: string) => void;
      done: () => void;
    };
    /** One line of the check: its pixel expectations and conditions, recorded together. */
    const part = (title: string): TPart => {
      const lines: string[] = [];
      let pass = true;
      return {
        pixel: (label, wx, wy, color, want = true): void => {
          const pixel = pixelAt(wx, wy);
          pass = pass && near(pixel, hex(color)) === want;
          lines.push(`${label} (${wx},${wy})=${show(pixel)} ${want ? "want" : "not"} ${color}`);
        },
        expect: (ok, line): void => {
          pass = pass && ok;
          lines.push(line);
        },
        done: (): void => record("C18", pass, `${title}: ${lines.join("; ")}`),
      };
    };
    const within = (worst: number): string => `${worst} (want <=${TOLERANCE})`;
    try {
      // 1. Order, raise, hidden, dim, opacity.
      const order = part("order");
      order.pixel("child over its parent", 85, 1130, RED);
      order.pixel("next owner over the child", 98, 1130, GREEN);
      const encodes = stats.encodes;
      store.raise("P");
      order.pixel("child of the raised parent", 98, 1130, RED);
      // Outside P, so only Q lies under C here: X between P and Q makes a stale child key fall under Q.
      order.pixel("child of the raised parent over Q, X between P and Q", 101, 1130, RED);
      order.pixel("raised parent", 97, 1105, BLUE);
      const raiseEncodes = stats.encodes - encodes;
      order.expect(raiseEncodes === 0, `encodes on raise=${raiseEncodes} (want 0)`);
      store.update("P", { hidden: true });
      order.pixel("child of a hidden parent", 85, 1130, RED, false);
      store.update("P", { hidden: false });
      store.setStyle("P", defineRow({ dim: 0.5 }));
      order.pixel("child dimmed with its parent", 85, 1130, RED, false);
      const dimmed = againstCanvas2D(83, 1128, 4, 4);
      store.setStyle("P", 0);
      store.setStyle("C", defineRow({ opacity: 0.5 }));
      const faded = againstCanvas2D(83, 1128, 4, 4);
      order.expect(
        Math.max(dimmed.worst, faded.worst) <= TOLERANCE,
        `worst vs Canvas2D: dimmed ${dimmed.worst}, faded child ${within(faded.worst)}`
      );
      order.done();
      store.setStyle("C", 0);

      // 2. Re-basing a later sibling when C's primitive count changes.
      const rebase = part("re-basing");
      store.add({
        id: "C2",
        parent: "P",
        childOrder: 1,
        zIndex: 0,
        x: 80,
        y: 1125,
        bounds: { minX: 0, minY: 0, maxX: 10, maxY: 10 },
        primitives: [box(ORANGE, 10, 10)],
      });
      rebase.pixel("sibling C2 over C", 85, 1130, ORANGE);
      const beforeGrow = stats.encodes;
      store.update("C", { primitives: [circle(4), circle(4), circle(12)] });
      rebase.pixel("C2 over C's circle at sub 3", 85, 1130, ORANGE);
      const grown = againstCanvas2D(83, 1128, 4, 4);
      const growEncodes = stats.encodes - beforeGrow;
      rebase.expect(
        grown.worst <= TOLERANCE && growEncodes === 4,
        `worst vs Canvas2D ${within(grown.worst)}; primitives re-encoded=${growEncodes} (want 4: C's 3, C2's 1)`
      );
      rebase.done();

      // 3. A childOrder update.
      const reorder = part("childOrder");
      const beforeOrder = stats.encodes;
      store.update("C", { childOrder: 2 });
      reorder.pixel("C over C2 after childOrder 2", 85, 1130, RED);
      const reordered = againstCanvas2D(83, 1128, 4, 4);
      const orderEncodes = stats.encodes - beforeOrder;
      reorder.expect(
        reordered.worst <= TOLERANCE,
        `worst vs Canvas2D ${within(reordered.worst)}; primitives re-encoded=${orderEncodes} (C2 to sub 1, C to 2)`
      );
      reorder.done();
      store.delete("C2");
      store.update("C", { primitives: [circle(12)], childOrder: 0 });

      // 4. Translucent parent, child and next owner.
      const glass = part("translucent");
      const half = defineRow({ opacity: 0.5 });
      store.setStyle("C", half);
      readRegion(0, 0, 1, 1);
      store.setStyle("P", half);
      store.setStyle("Q", half);
      const overParent = againstCanvas2D(83, 1128, 4, 4);
      const overBoth = againstCanvas2D(96, 1128, 4, 4);
      const levels = stats.translucentLevels;
      glass.expect(
        overParent.worst <= TOLERANCE && overBoth.worst <= TOLERANCE && levels >= 3,
        `C (0.5 x P's 0.5) over P at (83,1128) webgl=${show(overParent.webgl)} canvas2d=` +
          `${show(overParent.canvas2d)} worst ${within(overParent.worst)}; over P and Q at (96,1128) webgl=` +
          `${show(overBoth.webgl)} canvas2d=${show(overBoth.canvas2d)} worst ${within(overBoth.worst)}; translucent ` +
          `levels=${levels} (want >=3)`
      );
      glass.done();

      // 5. One frame, no read in between: the queue gives the backend C's add before P's.
      const frame = part("one frame");
      store.update("C", { x: 91 });
      store.delete("P");
      addP(true);
      addC(91);
      frame.pixel("child added again with its parent hidden", 85, 1130, RED, false);
      store.update("P", { hidden: false });
      frame.pixel("child once its parent is shown", 85, 1130, RED);
      const shown = againstCanvas2D(83, 1128, 4, 4);
      const state = graph.scene.$renderer.value;
      frame.expect(
        shown.worst <= TOLERANCE && state === "webgl",
        `worst vs Canvas2D ${within(shown.worst)}; renderer ${state} (want webgl)`
      );
      frame.done();
    } finally {
      for (const id of ["Q", "X", "P"]) if (store.get(id)) store.delete(id);
      for (const id of rows) store.freeStyle(id);
      setCamera(1);
    }
  });

  // C19: real blocks through the scene. Two default blocks overlap; the later one covers the first one's right border
  // and its OUT anchor (a child element). WebGL matches Canvas2D in the body, the inside border band, the anchor and
  // the title's darkest pixel; selecting the first block recolours its border, raises it with its anchor over the
  // second one, and re-encodes nothing. At scale 0.5 (the schematic level: scale 1 is detailed, which draws no title
  // and no anchors), so the 3 px border is 6 world units wide and one world unit is one device pixel at DPR 2.
  await check("C19", async () => {
    const stats = layer.getBackend()?.stats;
    if (!stats) throw new Error("no backend in C19");
    const scale = 0.5;
    const bodyColor = hex(initGraphColors.block.background);
    graph.updateSettings({ useBlocksAnchors: true });
    graph.setColors({ anchor: { background: "#ff00ff" } });
    graph.setEntities({
      blocks: [
        {
          id: "R1",
          is: "Block",
          name: "First",
          x: 0,
          y: 1500,
          width: 200,
          height: 100,
          anchors: [{ id: "o", blockId: "R1", type: "OUT" }],
        },
        { id: "R2", is: "Block", name: "Second", x: 120, y: 1540, width: 200, height: 100, anchors: [] },
      ],
      connections: [],
    });
    camera.set({ scale, x: ORIGIN.x, y: ORIGIN.y - 1500 * scale });
    for (let i = 0; i < 6; i++) graph.scheduler.performUpdate();
    try {
      const level = graph.scene.$level.value;
      const body = againstCanvas2D(40, 1560, 20, 10);
      // R1's left border band, x 0..6.
      const band = againstCanvas2D(1, 1550, 4, 20);
      const title = minRed(20, 1505, 160, 40);
      // R1's right border band (x 194..200) and its OUT anchor (centre (200, 1588), r 9) lie under R2's body. The
      // border is sampled at the band's bottom corner, below R2's title and outside the anchor.
      const borderBefore = pixelAt(197, 1598);
      const anchorBefore = pixelAt(203, 1588);
      const encodes = stats.encodes;
      graph.api.selectBlocks(["R1"], true);
      for (let i = 0; i < 4; i++) graph.scheduler.performUpdate();
      const borderAfter = pixelAt(197, 1598);
      const anchorAfter = pixelAt(203, 1588);
      const anchor = againstCanvas2D(197, 1585, 6, 6);
      const border = againstCanvas2D(195, 1550, 4, 20);
      const worst = Math.max(body.worst, band.worst, anchor.worst, border.worst);
      const selectEncodes = stats.encodes - encodes;
      record(
        "C19",
        level === "schematic" &&
          worst <= TOLERANCE &&
          Math.abs(title.webgl - title.canvas2d) <= TOLERANCE &&
          title.webgl < 128 &&
          near(borderBefore, bodyColor) &&
          near(anchorBefore, bodyColor) &&
          !near(borderBefore, borderAfter) &&
          near(borderAfter, hex(initGraphColors.block.selectedBorder)) &&
          near(anchorAfter, hex("#ff00ff")) &&
          !near(anchorBefore, anchorAfter) &&
          selectEncodes === 0,
        `level ${level} (want schematic); worst channel difference from Canvas2D=${worst} (body ${body.worst}, band ` +
          `${band.worst}, anchor ${anchor.worst}, selected border ${border.worst}); title darkest red ` +
          `webgl=${title.webgl} canvas2d=${title.canvas2d}; overlap border ${show(borderBefore)} (want R2's body ` +
          `${initGraphColors.block.background}) -> ${show(borderAfter)} (want ` +
          `${initGraphColors.block.selectedBorder}), ` +
          `anchor ${show(anchorBefore)} (want R2's body) -> ${show(anchorAfter)} (want #ff00ff); encodes on ` +
          `select=${selectEncodes} (want 0)`
      );
    } finally {
      graph.setEntities({ blocks: [], connections: [] });
      graph.setColors({ anchor: { background: initGraphColors.anchor.background } });
      setCamera(1);
    }
  });

  // C20: export. In the webgl state, graph.scene.toImage() of the current view draws the scene through the interpreter
  // over the layer canvases under it; at A's body, the line L and B's body its pixels match the WebGL picture. The
  // sample points are opaque (alpha 255), where straight and premultiplied values agree.
  await check("C20", async () => {
    setCamera(1);
    readRegion(0, 0, 1, 1);
    const image = graph.scene.toImage({ pixelRatio: dpr });
    const ctx = image.getContext("2d");
    if (!ctx) throw new Error("no 2D context on the exported image");
    const samples = [
      ["A body", 75, 50],
      ["line L", -20, 50],
      ["B body", 200, 50],
    ] as const;
    const lines: string[] = [];
    let worst = 0;
    let opaque = true;
    for (const [label, wx, wy] of samples) {
      const webgl = pixelAt(wx, wy);
      const [sx, sy] = screenOf(wx, wy);
      const data = ctx.getImageData(Math.floor(sx * dpr), Math.floor(sy * dpr), 1, 1).data;
      const exported: TPixel = [data[0], data[1], data[2], data[3]];
      opaque = opaque && webgl[3] === 255 && exported[3] === 255;
      worst = Math.max(worst, ...[0, 1, 2].map((channel) => Math.abs(webgl[channel] - exported[channel])));
      lines.push(`${label} (${wx},${wy}): webgl ${show(webgl)} image ${show(exported)}`);
    }
    record(
      "C20",
      worst <= TOLERANCE && opaque && graph.scene.$renderer.value === "webgl",
      `${lines.join("; ")}; worst channel difference=${worst} (want <=${TOLERANCE}, opaque samples); ` +
        `image ${image.width}x${image.height}; renderer ${graph.scene.$renderer.value}`
    );
  });

  // C21: adaptive depth budget. W1, a default Block with 40 anchors (20 IN on its left edge, then 20 OUT on its right
  // edge: 5 + 80 primitives, its OUT dots at subs 45..83), needs 7 bits of sub-order, past the old fixed 5. W2, a later
  // block, covers W1's OUT anchors 10..19 (subs 65..83). Three lines, at scale 0.5 (schematic: anchors are drawn):
  // 1. budget: W1 stays on WebGL (state webgl, sub width 7, no fallback, no limit error);
  // 2. order: W1's OUT anchors 0..9 draw over its body and border and its anchors 10..19 under W2's body (with 5 bits
  //    their subs would spill into W2's key and draw over it), matching Canvas2D;
  // 3. growth: from 10 anchors (25 primitives, 5 bits) to 40 (7 bits) re-encodes only the 30 new anchors' primitives
  //    (and W1's own, should its look change): the width change re-encodes nothing.
  await check("C21", async () => {
    const stats = layer.getBackend()?.stats;
    if (!stats) throw new Error("no backend in C21");
    const scale = 0.5;
    const MAGENTA = "#ff00ff";
    const top = 2000;
    const anchorList = [
      ...Array.from({ length: 20 }, (_, i) => ({ id: `in${i}`, blockId: "W1", type: "IN" })),
      ...Array.from({ length: 20 }, (_, i) => ({ id: `out${i}`, blockId: "W1", type: "OUT" })),
    ];
    const w1 = (count: number) => ({
      id: "W1",
      is: "Block",
      name: "Wide",
      x: 0,
      y: top,
      width: 200,
      height: 720,
      anchors: anchorList.slice(0, count),
    });
    const w2 = { id: "W2", is: "Block", name: "Next", x: 180, y: top + 380, width: 200, height: 400, anchors: [] };
    /** The world y of anchor i of a side: HEAD_HEIGHT + BODY_PADDING, then 2 grid cells apart. */
    const anchorY = (i: number): number => top + 88 + 32 * i;
    const errorsBefore = consoleErrors.length;
    const statesBefore = seenStates.length;
    graph.updateSettings({ useBlocksAnchors: true });
    graph.setColors({ anchor: { background: MAGENTA } });
    graph.setEntities({ blocks: [w1(40), w2], connections: [] });
    camera.set({ scale, x: ORIGIN.x, y: ORIGIN.y - top * scale });
    for (let i = 0; i < 6; i++) graph.scheduler.performUpdate();
    const w1Element = (): string =>
      graph.rootStore.blocksList.getBlockState("W1")?.getViewComponent()?.getSceneElementId() ?? "";
    const w2Body = hex(initGraphColors.block.background);
    try {
      // 1. Budget.
      readRegion(0, 0, 1, 1);
      const anchors = store.childrenOf(w1Element()).length;
      const subs = store.get(w1Element())?.primitives.length ?? 0;
      const total = subs + store.childrenOf(w1Element()).reduce((sum, child) => sum + child.primitives.length, 0);
      const state = graph.scene.$renderer.value;
      const transitions = seenStates.slice(statesBefore);
      const failures = consoleErrors
        .slice(errorsBefore)
        .filter((message) => message.includes("falls back") || message.includes("backend failed"));
      record(
        "C21",
        state === "webgl" &&
          transitions.length === 0 &&
          anchors === 40 &&
          total === 85 &&
          stats.subBits === 7 &&
          failures.length === 0,
        `budget: W1 has ${anchors} anchors (want 40), ${total} primitives with them (want 85); renderer ${state} ` +
          `(want webgl), state changes ${transitions.length} (want 0); sub width ${stats.subBits} (want 7); backend ` +
          `failures or limit errors ${failures.length} (want 0)${failures.length ? `: ${failures[0]}` : ""}`
      );

      // 2. Order: anchors over the body and border, under the next block.
      const order: string[] = [];
      let orderPass = true;
      const expectPixel = (label: string, wx: number, wy: number, color: TPixel): void => {
        const pixel = pixelAt(wx, wy);
        orderPass = orderPass && near(pixel, color);
        order.push(`${label} (${wx},${wy})=${show(pixel)} want ${show(color)}`);
      };
      expectPixel("IN anchor 5 over W1's body", 4, anchorY(5), hex(MAGENTA));
      expectPixel("OUT anchor 3 (sub 51) over W1's border", 197, anchorY(3), hex(MAGENTA));
      expectPixel("OUT anchor 9 (sub 63) over W1's border", 197, anchorY(9), hex(MAGENTA));
      expectPixel("OUT anchor 12 (sub 69) under W2's body", 197, anchorY(12), w2Body);
      expectPixel("OUT anchor 19 (sub 83) under W2's body", 203, anchorY(19), w2Body);
      // Inside the dots (radius 9: the corners lie 7 from the centre), so no antialiased circle edge is compared; the
      // third region lies in W2's body over the whole dot under it.
      const regions = [
        againstCanvas2D(-5, anchorY(5) - 5, 10, 10),
        againstCanvas2D(195, anchorY(3) - 5, 10, 10),
        againstCanvas2D(190, anchorY(15) - 12, 20, 24),
      ];
      const worst = Math.max(...regions.map((region) => region.worst));
      record(
        "C21",
        orderPass && worst <= TOLERANCE,
        `order: ${order.join("; ")}; worst channel difference from Canvas2D=${worst} (want <=${TOLERANCE}; IN anchor ` +
          `${regions[0].worst}, OUT anchor over the body ${regions[1].worst}, OUT anchor under W2 ${regions[2].worst})`
      );

      // 3. Growth from 10 to 40 anchors.
      graph.api.updateBlock({ id: "W1", anchors: anchorList.slice(0, 10) });
      for (let i = 0; i < 4; i++) graph.scheduler.performUpdate();
      readRegion(0, 0, 1, 1);
      const narrow = stats.subBits;
      const kept = new Set(store.childrenOf(w1Element()).map((child) => child.id));
      const blockPrimitives = store.get(w1Element())?.primitives;
      const encodesBefore = stats.encodes;
      graph.api.updateBlock({ id: "W1", anchors: anchorList });
      for (let i = 0; i < 4; i++) graph.scheduler.performUpdate();
      readRegion(0, 0, 1, 1);
      const grown = stats.encodes - encodesBefore;
      const added = store.childrenOf(w1Element()).filter((child) => !kept.has(child.id));
      const addedPrimitives = added.reduce((sum, child) => sum + child.primitives.length, 0);
      const block = store.get(w1Element());
      const blockEncoded = block !== undefined && block.primitives !== blockPrimitives;
      const want = addedPrimitives + (blockEncoded && block ? block.primitives.length : 0);
      const under = pixelAt(203, anchorY(19));
      const over = pixelAt(197, anchorY(9));
      const after = againstCanvas2D(192, anchorY(15) - 6, 14, 12);
      record(
        "C21",
        narrow === 5 &&
          stats.subBits === 7 &&
          kept.size === 10 &&
          added.length === 30 &&
          addedPrimitives === 60 &&
          grown === want &&
          near(under, w2Body) &&
          near(over, hex(MAGENTA)) &&
          after.worst <= TOLERANCE &&
          graph.scene.$renderer.value === "webgl",
        `growth: sub width ${narrow} with 10 anchors (want 5) -> ${stats.subBits} with 40 (want 7); ${added.length} ` +
          `anchors added (want 30) with ${addedPrimitives} primitives (want 60); W1's own primitives ` +
          `${blockEncoded ? "changed" : "unchanged"}; primitives encoded=${grown} (want ${want}: the new anchors` +
          `${blockEncoded ? " and W1" : ""}, not W1's first 10 anchors nor W2); OUT anchor 19 under W2 ` +
          `${show(under)}, OUT anchor 9 over W1 ${show(over)}, worst vs Canvas2D ${after.worst}; renderer ` +
          `${graph.scene.$renderer.value}`
      );
    } finally {
      graph.setEntities({ blocks: [], connections: [] });
      graph.setColors({ anchor: { background: initGraphColors.anchor.background } });
      setCamera(1);
    }
  });

  /**
   * The ink of white glyphs in a CSS px rect of the screen, in WebGL and in the Canvas2D picture: the coverage-weighted
   * centre in CSS px, the coverage in device px and the brightest premultiplied red. White text over black or over
   * nothing reads as premultiplied red = coverage x 255 in both, so the red channel weighs each pixel.
   */
  const inkOf = (
    cssX: number,
    cssY: number,
    cssW: number,
    cssH: number
  ): Record<"webgl" | "canvas2d", { x: number; y: number; mass: number; max: number }> => {
    const x0 = Math.round(cssX * dpr);
    const y0 = Math.round(cssY * dpr);
    const w = Math.round(cssW * dpr);
    const h = Math.round(cssH * dpr);
    const webgl = readRegion(x0, y0, w, h);
    const reference = canvas2DPicture().getImageData(x0, y0, w, h).data;
    const measure = (red: (i: number) => number): { x: number; y: number; mass: number; max: number } => {
      let mass = 0;
      let sumX = 0;
      let sumY = 0;
      let max = 0;
      for (let row = 0; row < h; row++) {
        for (let col = 0; col < w; col++) {
          const value = red((row * w + col) * 4);
          const weight = value / 255;
          mass += weight;
          sumX += weight * (x0 + col + 0.5);
          sumY += weight * (y0 + row + 0.5);
          max = Math.max(max, value);
        }
      }
      return { x: sumX / mass / dpr, y: sumY / mass / dpr, mass, max };
    };
    return {
      webgl: measure((i) => webgl[i]),
      canvas2d: measure((i) => Math.round((reference[i] * reference[i + 3]) / 255)),
    };
  };

  // C22 (revised in Task 17h): a camera-aware name in a box that holds its line or not. A 48-high block (a black body)
  // with a white 13 px "NOON" centred in it (`verticalAlign: "middle"`, `height: 48`, `align: "center"`, `lineHeight`
  // 16, at most 104 world units). The camera puts the block's centre at CSS (400, 300) at scales 1, 0.5 and 0.125 (the
  // block is 48, 24 and 6 CSS px high; the name 13 CSS px). Where the box holds the line (1 and 0.5: a pitch of 16 and
  // 32 world units in the 48-high box), both renderers draw it where v1 Canvas2D did: the line's top half the pitch
  // above the box's centre, the glyphs on the baseline the shared metrics put below it (`textBaseline = "top"`). The
  // ink's coverage-weighted centre is that line's ink centre (from the glyph box `measureText` gives) within 1 CSS px
  // on each renderer, WebGL's coverage within 10 % of Canvas2D's, the brightest red matching, and the coverage about
  // the same at both scales (a 13 px name). At 0.125 the name is 104 world units and its line 128 high: the 6 px box
  // holds no line, and neither renderer draws ink.
  await check("C22", async () => {
    const top = 3000;
    const centre = { x: 400, y: 300 };
    const primitives: TScenePrimitive[] = [
      { kind: "rect", x: 0, y: 0, width: 160, height: 48, fill: "#000000", part: "body" },
      {
        kind: "text",
        text: "NOON",
        family: "sans-serif",
        size: 13,
        cameraAware: { maxWorld: 104 },
        lineHeight: 16,
        color: "#ffffff",
        x: 8,
        y: 0,
        width: 144,
        height: 48,
        align: "center",
        verticalAlign: "middle",
        part: "title",
      },
    ];
    const bounds = elementBounds(primitives);
    store.add({ id: "NM", zIndex: 200, x: 0, y: top, bounds, primitives });
    // v1's ink: the line's top 8 CSS px above the centre, the baseline the metrics' top below it, the capitals' box
    // around the baseline as measureText gives it.
    const probe = document.createElement("canvas").getContext("2d") as CanvasRenderingContext2D;
    probe.font = "normal 13px sans-serif";
    const glyphBox = probe.measureText("NOON");
    const baseline = centre.y - 8 + (sceneTextMetrics.top("sans-serif", "normal") * 13) / 100;
    // `align: "center"` centres the advance on the box's centre; the glyph box is measured from the line's start.
    const expected = {
      x: centre.x - glyphBox.width / 2 + (glyphBox.actualBoundingBoxRight - glyphBox.actualBoundingBoxLeft) / 2,
      y: baseline + (glyphBox.actualBoundingBoxDescent - glyphBox.actualBoundingBoxAscent) / 2,
    };
    try {
      const lines: string[] = [];
      let pass = true;
      const masses: number[] = [];
      for (const scale of [1, 0.5, 0.125]) {
        camera.set({ scale, x: centre.x - 80 * scale, y: centre.y - (top + 24) * scale });
        const ink = inkOf(centre.x - 100, centre.y - 30, 200, 60);
        if (scale === 0.125) {
          const empty = ink.webgl.mass < 1 && ink.canvas2d.mass < 1;
          pass = pass && empty;
          lines.push(
            `scale ${scale}: coverage webgl=${ink.webgl.mass.toFixed(1)} canvas2d=${ink.canvas2d.mass.toFixed(1)} ` +
              `dev ` +
              `px (want < 1: the 6 px box holds no line)`
          );
          continue;
        }
        const offsets = (["webgl", "canvas2d"] as const).map((renderer) => ({
          renderer,
          dx: ink[renderer].x - expected.x,
          dy: ink[renderer].y - expected.y,
        }));
        const placed = offsets.every(({ dx, dy }) => Math.abs(dy) <= 1 && Math.abs(dx) <= 1);
        const coverage = ink.webgl.mass / ink.canvas2d.mass;
        const matches =
          Math.abs(coverage - 1) <= 0.1 &&
          Math.abs(ink.webgl.max - ink.canvas2d.max) <= TOLERANCE &&
          ink.webgl.max >= 255 - TOLERANCE;
        pass = pass && placed && matches;
        masses.push(ink.webgl.mass, ink.canvas2d.mass);
        lines.push(
          `scale ${scale} (level ${graph.scene.$level.value}): ` +
            offsets.map(({ renderer, dx, dy }) => `${renderer} dy=${dy.toFixed(2)} dx=${dx.toFixed(2)}`).join(", ") +
            ` css px from v1's ink centre (${expected.x.toFixed(2)}, ${expected.y.toFixed(2)}; want |d|<=1); ` +
            `brightest ` +
            `red webgl=${ink.webgl.max} canvas2d=${ink.canvas2d.max}; coverage webgl=${ink.webgl.mass.toFixed(0)} ` +
            `canvas2d=${ink.canvas2d.mass.toFixed(0)} dev px, webgl/canvas2d=${coverage.toFixed(3)} (want 0.9..1.1)`
        );
      }
      // A px-sized name keeps its coverage across scales; one that scaled with the block would lose 3/4 of it.
      const steady = Math.min(...masses) >= 0.75 * Math.max(...masses);
      record(
        "C22",
        pass && steady,
        `${lines.join("; ")}; coverage min/max=${(Math.min(...masses) / Math.max(...masses)).toFixed(2)} (want ` +
          `>=0.75); bounds y ${bounds.minY}..${bounds.maxY} x ${bounds.minX}..${bounds.maxX} (the box)`
      );
    } finally {
      store.delete("NM");
      setCamera(1);
    }
  });
  // C23 and C24 (Task 17d, fix round 1): incremental re-encodes against a full encode. Each case holds a few elements
  // (an owner, or an owner and a child) and changes them in a row, step after step, so every step starts from the
  // records the earlier steps adopted. After a step the backend's floats of each element (every batch of every pass,
  // its instances and its companion list, the ranges' steps, the element index normalised against the table's own)
  // are read, then the same primitives are added as fresh elements ("~ref", far away: a full encode with no history)
  // and read the same way, then removed. Task 17e: after each step's draw every list's GPU buffer must also hold its
  // CPU floats (`gpuDiffers`), and the step's writes and uploads of the opaque glyph pass are checked: a keep writes
  // nothing, a re-sub only the glyph subs (their own buffer), an encode both.
  type TRangesView = Pick<InstanceRanges, "data" | "floats" | "revision" | "forEachRange">;
  /** A luma DynamicBuffer: its current WebGL buffer reads back synchronously. */
  type TGpuView = { buffer: { readSyncWebGL(byteOffset: number, byteLength: number): Uint8Array } };
  type TCompanionView = { kind: "elements" | "subs"; ranges: TRangesView; buffer?: TGpuView };
  type TBatchView = {
    model: { id: string };
    ranges: TRangesView;
    buffer: TGpuView;
    companion?: TCompanionView;
    pathRecords?: { texture: { readDataSyncWebGL(): ArrayBuffer } };
  };
  type TBackendView = {
    allBatches(): Iterable<TBatchView>;
    glyphs: { opaque: TBatchView };
    table: { indexOf(id: string): number };
    stats: { translucentLevels: number };
    uploadRanges(ranges: TRangesView, buffer: TGpuView, ...tracking: unknown[]): string;
    uploadPathRecords(batch: TBatchView, ...records: unknown[]): string;
  };
  const backendView = (): TBackendView => {
    const backend = layer.getBackend();
    if (!backend) throw new Error("no backend in C23-C25");
    return backend as unknown as TBackendView;
  };
  /**
   * Every list of every batch, and whether its first float is an element table index.
   */
  type TListView = { label: string; ranges: TRangesView; batch: TBatchView; indexed: boolean };
  const listsOf = (backend: TBackendView): TListView[] => {
    const lists: TListView[] = [];
    let at = 0;
    for (const batch of backend.allBatches()) {
      const key = `${at++}:${batch.model.id}`;
      lists.push({ label: `${key}i`, ranges: batch.ranges, batch, indexed: !batch.pathRecords });
      // A path's element data starts each instance with its element index; a glyph's sub list holds the sub alone.
      const { companion } = batch;
      if (companion) {
        lists.push({
          label: `${key}${companion.kind === "subs" ? "s" : "e"}`,
          ranges: companion.ranges,
          batch,
          indexed: companion.kind === "elements",
        });
      }
    }
    return lists;
  };
  /** The element's instances in every list: per range its step and, per instance, the bits of every float. */
  const signatureOf = (id: string): string => {
    const backend = backendView();
    const index = backend.table.indexOf(id);
    const parts: string[] = [];
    for (const { label, ranges, indexed } of listsOf(backend)) {
      const { floats } = ranges;
      ranges.forEachRange((rangeId, offset, count, step) => {
        if (rangeId !== id) return;
        const { data } = ranges;
        const bits = new Uint32Array(data.buffer, data.byteOffset, data.length);
        const rows: string[] = [];
        for (let i = offset; i < offset + count; i++) {
          const row = Array.from(bits.subarray(i * floats, (i + 1) * floats));
          // The element index: its own table's value is "i" in both runs.
          if (indexed) row[0] = data[i * floats] === index ? -1 : -2;
          rows.push(row.join(","));
        }
        parts.push(`${label}@${step}x${count}[${rows.join("|")}]`);
      });
    }
    return parts.join("\n");
  };
  /** Reads the resident buffers and path textures and compares every used float, bit for bit, after a draw. */
  const gpuDiffers = (): string[] => {
    const differs: string[] = [];
    const pathData = new Map<TBatchView, Uint32Array>();
    for (const { label, ranges, batch } of listsOf(backendView())) {
      const { data } = ranges;
      if (data.byteLength === 0) continue;
      const payload = ranges === batch.ranges;
      if (batch.pathRecords && batch.companion) {
        const records = pathData.get(batch) ?? new Uint32Array(batch.pathRecords.texture.readDataSyncWebGL());
        pathData.set(batch, records);
        const bits = new Uint32Array(data.buffer, data.byteOffset, data.length);
        const stride = batch.ranges.floats + batch.companion.ranges.floats;
        const offset = payload ? 0 : batch.ranges.floats;
        const same = bits.every((word, i) => {
          const record = Math.floor(i / ranges.floats);
          return word === records[record * stride + offset + (i % ranges.floats)];
        });
        if (!same) differs.push(label);
      } else {
        const gpu = payload ? batch.buffer : batch.companion?.buffer;
        if (!gpu) throw new Error(`Missing GPU buffer for ${label}`);
        const cpu = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
        const read = gpu.buffer.readSyncWebGL(0, data.byteLength);
        if (cpu.some((byte, i) => byte !== read[i])) differs.push(label);
      }
    }
    return differs;
  };
  /** Records uploads of both attribute buffers and the interleaved path textures. */
  const uploadsOf = (draw: () => void): Map<string, string> => {
    const backend = backendView();
    const labels = new Map<TRangesView, string>(listsOf(backend).map(({ label, ranges }) => [ranges, label]));
    const kinds = new Map<string, string>();
    const own = backend as unknown as Record<string, unknown>;
    const track = (ranges: TRangesView, kind: string): string => {
      if (kind !== "none") kinds.set(labels.get(ranges) ?? "?", kind);
      return kind;
    };
    const { uploadRanges, uploadPathRecords } = backend;
    backend.uploadRanges = function (ranges, buffer, ...tracking) {
      return track(ranges, uploadRanges.call(this, ranges, buffer, ...tracking));
    };
    backend.uploadPathRecords = function (batch, ...records) {
      return track(batch.ranges, uploadPathRecords.call(this, batch, ...records));
    };
    try {
      draw();
    } finally {
      delete own.uploadRanges;
      delete own.uploadPathRecords;
    }
    return kinds;
  };
  /** The labels of the opaque glyph pass's lists: its instances and its subs. */
  const glyphLabels = (): { instances: string; subs: string } => {
    const lists = listsOf(backendView());
    const ofGlyphs = (suffix: string): string =>
      lists.find(({ label }) => label.endsWith(`:glyph-opaque${suffix}`))?.label ?? `glyph-opaque${suffix}?`;
    return { instances: ofGlyphs("i"), subs: ofGlyphs("s") };
  };
  /**
   * What a step wrote to the opaque glyph pass, from the revisions of its two lists: nothing (`"none"`), the subs only
   * (`"subs"`), both (`"all"`), or the instances without the subs (`"instances"`, never right).
   */
  type TGlyphWrite = "none" | "subs" | "all" | "instances";
  const glyphRevisions = (): [number, number] => {
    const glyphs = backendView().glyphs.opaque;
    return [glyphs.ranges.revision, glyphs.companion?.ranges.revision ?? -1];
  };
  const glyphWriteOf = (before: [number, number]): TGlyphWrite => {
    const [instances, subs] = glyphRevisions();
    const wroteInstances = instances !== before[0];
    const wroteSubs = subs !== before[1];
    if (wroteInstances) return wroteSubs ? "all" : "instances";
    return wroteSubs ? "subs" : "none";
  };
  /**
   * Whether a step's uploads of the opaque glyph pass are those of its writes: each list uploads iff it was written.
   */
  const glyphUploadsMatch = (uploads: Map<string, string>, write: TGlyphWrite): boolean => {
    const labels = glyphLabels();
    const instances = uploads.has(labels.instances);
    const subs = uploads.has(labels.subs);
    return instances === (write === "all" || write === "instances") && subs === (write === "all" || write === "subs");
  };
  /** The glyph uploads of a step, for the log: "instances <kind>, subs <kind>". */
  const glyphUploadsText = (uploads: Map<string, string>): string => {
    const labels = glyphLabels();
    return `instances ${uploads.get(labels.instances) ?? "none"}, subs ${uploads.get(labels.subs) ?? "none"}`;
  };
  /** The first part (a range of a batch) of two signatures that differs, shortened. */
  const firstDifference = (a: string, b: string): string => {
    const partsA = a.split("\n");
    const partsB = b.split("\n");
    for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
      if (partsA[i] !== partsB[i]) return `${partsA[i]?.slice(0, 160)} <> ${partsB[i]?.slice(0, 160)}`;
    }
    return "";
  };
  type TMember = { id: string; parent?: string };
  type TCaseStep = {
    name: string;
    /** The primitives each named element gets in this step; the others keep theirs. */
    primitives: Record<string, TScenePrimitive[]>;
    /**
     * What the step writes to the opaque glyph pass (a revision change of its instances, of its subs) and uploads: a
     * keep nothing, a re-sub the subs only, an encode both.
     */
    glyphs?: "none" | "subs" | "all";
    /** Overlap levels contributed by the case's own zIndex band after the step. */
    levels?: number;
  };
  const runCase = async (
    members: readonly TMember[],
    start: Record<string, TScenePrimitive[]>,
    steps: readonly TCaseStep[],
    y: number
  ): Promise<{ pass: boolean; lines: string[] }> => {
    const current: Record<string, TScenePrimitive[]> = { ...start };
    const addAll = (suffix: string, dy: number): void => {
      for (const member of members) {
        const primitives = current[member.id];
        store.add({
          id: member.id + suffix,
          parent: member.parent === undefined ? undefined : member.parent + suffix,
          zIndex: 910,
          x: 0,
          y: y + dy,
          bounds: elementBounds(primitives),
          primitives,
        });
      }
    };
    const removeAll = (suffix: string): void => {
      for (const member of [...members].reverse()) store.delete(member.id + suffix);
    };
    const lines: string[] = [];
    let pass = true;
    // The backend sums levels across zIndex bands, including C16's resident faded grid.
    readRegion(0, 0, 1, 1);
    const baseline = backendView().stats.translucentLevels;
    addAll("", 0);
    try {
      readRegion(0, 0, 1, 1);
      for (const step of steps) {
        const revisions = glyphRevisions();
        for (const [id, primitives] of Object.entries(step.primitives)) {
          current[id] = primitives;
          store.update(id, { primitives, bounds: elementBounds(primitives) });
        }
        const uploads = uploadsOf(() => readRegion(0, 0, 1, 1));
        const written = glyphWriteOf(revisions);
        const gpuStale = gpuDiffers();
        const levels = backendView().stats.translucentLevels - baseline;
        const incremental = members.map((member) => signatureOf(member.id));
        addAll("~ref", 0);
        readRegion(0, 0, 1, 1);
        const fresh = members.map((member) => signatureOf(member.id + "~ref"));
        removeAll("~ref");
        readRegion(0, 0, 1, 1);
        const same = incremental.every((signature, i) => signature === fresh[i]);
        const differs = incremental.findIndex((signature, i) => signature !== fresh[i]);
        const where =
          differs < 0 ? "" : ` DIFF ${members[differs].id}: ${firstDifference(incremental[differs], fresh[differs])}`;
        const filled = incremental.every((signature) => signature.length > 0);
        const writtenOk = step.glyphs === undefined || written === step.glyphs;
        const uploadsOk = glyphUploadsMatch(uploads, written);
        const gpuOk = gpuStale.length === 0;
        const levelsOk = step.levels === undefined || levels === step.levels;
        pass = pass && same && filled && writtenOk && uploadsOk && gpuOk && levelsOk;
        lines.push(
          `${step.name}: same=${same} (${incremental.map((s) => s.length).join("/")} chars), gpu=cpu ${gpuOk}` +
            (gpuOk ? "" : ` (stale: ${gpuStale.join(" ")})`) +
            (step.glyphs === undefined ? "" : `, glyphs written=${written} (want ${step.glyphs})`) +
            `, glyph uploads ${glyphUploadsText(uploads)}${uploadsOk ? "" : " (not the writes)"}` +
            (step.levels === undefined ? "" : `, case levels=${levels} (want ${step.levels})`) +
            where
        );
      }
    } finally {
      removeAll("");
      readRegion(0, 0, 1, 1);
    }
    return { pass, lines };
  };
  const title = (text: string, y: number): TScenePrimitive => ({
    kind: "text",
    text,
    family: "sans-serif",
    size: 13,
    cameraAware: { maxWorld: 40 },
    lineHeight: 16,
    color: "#ffffff",
    x: 8,
    y,
    width: 144,
    height: 20,
    align: "center",
    part: "title",
  });
  const slab = (fill: string): TScenePrimitive => ({
    kind: "rect",
    x: 0,
    y: 0,
    width: 160,
    height: 60,
    fill,
    part: "body",
  });
  const bar = (fill: string): TScenePrimitive => ({ kind: "rect", x: 0, y: 54, width: 80, height: 6, fill });

  // C23: an owner's texts. A re-encode that keeps the glyphs of unchanged texts (same subs: nothing written; a
  // primitive added or removed before them: only the glyph subs) leaves exactly the floats a full encode writes.
  await check("C23", async () => {
    const look = (fill: string, progress: boolean, second: string): TScenePrimitive[] => [
      slab(fill),
      ...(progress ? [bar("#5b8def")] : []),
      title("Reuse me", 4),
      title(second, 30),
    ];
    const { pass, lines } = await runCase(
      [{ id: "RU" }],
      { RU: look("#204060", false, "second line") },
      [
        { name: "fill only (keep)", primitives: { RU: look("#604020", false, "second line") }, glyphs: "none" },
        {
          name: "rect added before the texts (resub)",
          primitives: { RU: look("#604020", true, "second line") },
          glyphs: "subs",
        },
        { name: "same again (keep)", primitives: { RU: look("#206040", true, "second line") }, glyphs: "none" },
        {
          name: "rect removed (resub)",
          primitives: { RU: look("#206040", false, "second line") },
          glyphs: "subs",
        },
        {
          name: "a text changed (encode)",
          primitives: { RU: look("#206040", false, "changed line") },
          glyphs: "all",
        },
        {
          name: "fill only after the encode (keep)",
          primitives: { RU: look("#402060", false, "changed line") },
          glyphs: "none",
        },
      ],
      4000
    );
    record("C23", pass, lines.join("; "));
  });

  // C24: the fast paths of the encode and the rebase skip, each against a full encode, in a row.
  // (i) a child with a text under an owner that changes only a fill (same primitive count: no rebase, the child's
  // glyphs are untouched) and then gains a primitive (rebase: the child's subs move, its glyphs only re-sub);
  // (ii) a translucent rect added to and removed from an element (translucent batch, `stats.translucentLevels`);
  // (iii) a path added to and removed from an element without one (opaque, then translucent path groups).
  await check("C24", async () => {
    const lines: string[] = [];
    let pass = true;
    const part = (result: { pass: boolean; lines: string[] }, name: string): void => {
      pass = pass && result.pass;
      lines.push(`[${name}] ${result.lines.join("; ")}`);
    };
    const kid = (fill: string): TScenePrimitive[] => [
      { kind: "rect", x: 0, y: 0, width: 160, height: 30, fill: fill },
      title("Child text", 4),
    ];
    part(
      await runCase(
        [{ id: "OW" }, { id: "KD", parent: "OW" }],
        { OW: [slab("#204060")], KD: kid("#406080") },
        [
          { name: "owner fill only (no rebase)", primitives: { OW: [slab("#604020")] }, glyphs: "none" },
          {
            name: "owner gains a rect (rebase, child resub)",
            primitives: { OW: [slab("#604020"), bar("#5b8def")] },
            glyphs: "subs",
          },
          {
            name: "owner fill only again",
            primitives: { OW: [slab("#206040"), bar("#5b8def")] },
            glyphs: "none",
          },
          {
            name: "owner loses the rect (rebase, child resub)",
            primitives: { OW: [slab("#206040")] },
            glyphs: "subs",
          },
          { name: "child fill only", primitives: { KD: kid("#802040") }, glyphs: "none" },
          {
            name: "owner gains and the child's fill changes (rebase, child resub)",
            primitives: { OW: [slab("#206040"), bar("#5b8def")], KD: kid("#204080") },
            glyphs: "subs",
          },
          {
            name: "the child's text changes (encode)",
            primitives: {
              KD: [{ kind: "rect", x: 0, y: 0, width: 160, height: 30, fill: "#204080" }, title("Kid", 4)],
            },
            glyphs: "all",
          },
        ],
        4200
      ),
      "child under owner"
    );
    const flat = [slab("#204060"), title("Plain", 4)];
    // A translucent plate over the whole element: a translucent primitive of the element overlaps it (two levels).
    const plate: TScenePrimitive[] = [
      { kind: "rect", x: -10, y: -10, width: 180, height: 80, fill: "rgba(0, 0, 255, 0.5)" },
    ];
    const faded = (alpha: number): TScenePrimitive => ({
      kind: "rect",
      x: 20,
      y: 20,
      width: 60,
      height: 20,
      fill: `rgba(255, 64, 64, ${alpha})`,
    });
    part(
      await runCase(
        [{ id: "TR" }, { id: "TC" }],
        { TR: flat, TC: plate },
        [
          { name: "translucent rect added", primitives: { TR: [...flat, faded(0.5)] }, levels: 2 },
          { name: "its alpha changed", primitives: { TR: [...flat, faded(0.25)] }, levels: 2 },
          { name: "translucent rect removed", primitives: { TR: flat }, levels: 1 },
          { name: "added again", primitives: { TR: [...flat, faded(0.5)] }, levels: 2 },
          { name: "made opaque", primitives: { TR: [...flat, faded(1)] }, levels: 1 },
        ],
        4400
      ),
      "translucent rect"
    );
    const line = (color: string): TScenePrimitive => ({
      kind: "path",
      segments: lineOf([10, 30], [150, 30]),
      stroke: { color, width: 4 },
    });
    part(
      await runCase(
        [{ id: "PH" }, { id: "TC" }],
        { PH: flat, TC: plate },
        [
          { name: "path added to a path-free element", primitives: { PH: [...flat, line("#ffff00")] } },
          { name: "path colour changed", primitives: { PH: [...flat, line("#00ffff")] } },
          { name: "path removed", primitives: { PH: flat } },
          { name: "translucent path added", primitives: { PH: [...flat, line("rgba(255, 255, 0, 0.5)")] }, levels: 2 },
          { name: "translucent path removed", primitives: { PH: flat }, levels: 1 },
        ],
        4600
      ),
      "path"
    );
    record("C24", pass, lines.join(" "));
  });

  // C25 (Task 17e): a re-subbed title draws over a primitive inserted before it. A 48-high black body with a white
  // "NOON" centred in it at CSS (400, 300), scale 1; then a black plate under the whole title is inserted between them
  // (the title's sub moves up by one: a re-sub, its glyph instances untouched), then removed again (a re-sub back). At
  // each step the name's coverage on WebGL is within 10 % of the first step's and of Canvas2D's, and the step writes
  // the glyph subs only. A title whose sub stayed behind (its sub buffer not uploaded) ties the plate's depth and is
  // hidden by it.
  await check("C25", async () => {
    const top = 4800;
    const centre = { x: 400, y: 300 };
    const body: TScenePrimitive = { kind: "rect", x: 0, y: 0, width: 160, height: 48, fill: "#000000", part: "body" };
    const plate: TScenePrimitive = { kind: "rect", x: 8, y: 4, width: 144, height: 40, fill: "#000000" };
    const name: TScenePrimitive = {
      kind: "text",
      text: "NOON",
      family: "sans-serif",
      size: 13,
      cameraAware: { maxWorld: 104 },
      lineHeight: 16,
      color: "#ffffff",
      x: 8,
      y: 0,
      width: 144,
      height: 48,
      align: "center",
      verticalAlign: "middle",
      part: "title",
    };
    const looks: { step: string; primitives: TScenePrimitive[]; glyphs?: TGlyphWrite }[] = [
      { step: "body, title", primitives: [body, name] },
      { step: "a plate inserted under the title (resub)", primitives: [body, plate, name], glyphs: "subs" },
      { step: "the plate removed (resub)", primitives: [body, name], glyphs: "subs" },
    ];
    store.add({ id: "RS", zIndex: 200, x: 0, y: top, bounds: elementBounds(looks[0].primitives), primitives: [body] });
    camera.set({ scale: 1, x: centre.x - 80, y: centre.y - (top + 24) });
    readRegion(0, 0, 1, 1);
    try {
      const lines: string[] = [];
      let pass = true;
      let first = NaN;
      for (const { step, primitives, glyphs } of looks) {
        const revisions = glyphRevisions();
        store.update("RS", { primitives, bounds: elementBounds(primitives) });
        const uploads = uploadsOf(() => readRegion(0, 0, 1, 1));
        const written = glyphWriteOf(revisions);
        const ink = inkOf(centre.x - 100, centre.y - 30, 200, 60);
        if (Number.isNaN(first)) first = ink.webgl.mass;
        const toFirst = ink.webgl.mass / first;
        const toCanvas = ink.webgl.mass / ink.canvas2d.mass;
        const inked = Math.abs(toFirst - 1) <= 0.1 && Math.abs(toCanvas - 1) <= 0.1;
        const writtenOk = glyphs === undefined || (written === glyphs && glyphUploadsMatch(uploads, written));
        pass = pass && inked && writtenOk;
        lines.push(
          `${step}: coverage webgl=${ink.webgl.mass.toFixed(0)} canvas2d=${ink.canvas2d.mass.toFixed(0)} dev px, ` +
            `webgl/first=${toFirst.toFixed(3)} webgl/canvas2d=${toCanvas.toFixed(3)} (want 0.9..1.1)` +
            (glyphs === undefined ? "" : `, glyphs written=${written} (want ${glyphs})`) +
            `, glyph uploads ${glyphUploadsText(uploads)}`
        );
      }
      record("C25", pass, lines.join("; "));
    } finally {
      store.delete("RS");
      setCamera(1);
    }
  });

  // Task 17h: text that fits its box (C26-C28), on the shared layout of both renderers.
  type TPictures = { webgl: Uint8Array; canvas2d: Uint8Array; x0: number; y0: number; w: number; h: number };
  type TBand = { top: number; bottom: number; left: number; right: number };
  /** Both pictures of a CSS px rect of the screen, premultiplied, in device px rows. */
  const picturesOf = (cssX: number, cssY: number, cssW: number, cssH: number): TPictures => {
    const x0 = Math.max(0, Math.round(cssX * dpr));
    const y0 = Math.max(0, Math.round(cssY * dpr));
    const w = Math.min(Math.round(cssW * dpr), VIEW.width * dpr - x0);
    const h = Math.min(Math.round(cssH * dpr), VIEW.height * dpr - y0);
    const webgl = readRegion(x0, y0, w, h);
    const raw = canvas2DPicture().getImageData(x0, y0, w, h).data;
    const canvas2d = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i += 4) {
      const alpha = raw[i + 3];
      for (let channel = 0; channel < 3; channel++)
        canvas2d[i + channel] = Math.round((raw[i + channel] * alpha) / 255);
      canvas2d[i + 3] = alpha;
    }
    return { webgl, canvas2d, x0, y0, w, h };
  };
  /** White text over a black body: the premultiplied red is the ink. Ink pixels outside a CSS px box and inside it. */
  const inkAround = (
    data: Uint8Array,
    pictures: TPictures,
    box: { x: number; y: number; width: number; height: number },
    margin: number
  ): { outside: number; inside: number } => {
    let outside = 0;
    let inside = 0;
    for (let row = 0; row < pictures.h; row++) {
      for (let col = 0; col < pictures.w; col++) {
        if (data[(row * pictures.w + col) * 4] < 48) continue;
        const x = (pictures.x0 + col + 0.5) / dpr;
        const y = (pictures.y0 + row + 0.5) / dpr;
        const within =
          x >= box.x - margin &&
          x <= box.x + box.width + margin &&
          y >= box.y - margin &&
          y <= box.y + box.height + margin;
        if (within) inside++;
        else outside++;
      }
    }
    return { outside, inside };
  };
  /** The ink's lines: runs of rows with ink, each with its ink's extent, in CSS px. */
  const bandsOf = (data: Uint8Array, pictures: TPictures): TBand[] => {
    const bands: TBand[] = [];
    let current: TBand | undefined;
    for (let row = 0; row < pictures.h; row++) {
      let left = Infinity;
      let right = -Infinity;
      for (let col = 0; col < pictures.w; col++) {
        if (data[(row * pictures.w + col) * 4] < 64) continue;
        left = Math.min(left, col);
        right = Math.max(right, col + 1);
      }
      const y = (pictures.y0 + row) / dpr;
      if (left === Infinity) {
        current = undefined;
        continue;
      }
      const l = (pictures.x0 + left) / dpr;
      const r = (pictures.x0 + right) / dpr;
      if (!current) {
        current = { top: y, bottom: y + 1 / dpr, left: l, right: r };
        bands.push(current);
      } else {
        current.bottom = y + 1 / dpr;
        current.left = Math.min(current.left, l);
        current.right = Math.max(current.right, r);
      }
    }
    return bands;
  };
  const bandsText = (bands: readonly TBand[]): string =>
    bands
      .map(
        (band) =>
          `[${band.top.toFixed(1)}..${band.bottom.toFixed(1)} x ${band.left.toFixed(1)}..${band.right.toFixed(1)}]`
      )
      .join("");
  /**
   * Whether two renderers' lines agree: as many, each within `vertical` CSS px at its top and bottom and `horizontal`
   * at its ends.
   */
  const sameBands = (a: readonly TBand[], b: readonly TBand[], vertical = 1, horizontal = 1.5): boolean =>
    a.length === b.length &&
    a.every(
      (band, index) =>
        Math.abs(band.top - b[index].top) <= vertical &&
        Math.abs(band.bottom - b[index].bottom) <= vertical &&
        Math.abs(band.left - b[index].left) <= horizontal &&
        Math.abs(band.right - b[index].right) <= horizontal
    );
  /** The layout both renderers draw a store text with at the current camera and policy. */
  const layoutOf = (primitive: TScenePrimitive): { lines: readonly string[]; overflows: boolean } => {
    if (primitive.kind !== "text") return { lines: [], overflows: false };
    const policy = { cameraAware: graph.scene.$cameraAwareText.value };
    return sceneTextLayout(primitive, primitive, resolveTextSize(primitive, camera.getCameraScale(), policy));
  };
  /** The lines both renderers lay a store text out in at the current camera and policy. */
  const linesOf = (primitive: TScenePrimitive): readonly string[] => layoutOf(primitive).lines;
  /** A world point's CSS position at the current camera. */
  const cssOf = (wx: number, wy: number): { x: number; y: number } => {
    const [x, y] = screenOf(wx, wy);
    return { x, y };
  };
  type TTextStats = {
    textRelayouts: number;
    lastTextRelayouts: number;
    lastTextRelayoutGlyphs: number;
    lastTextRelayoutMs: number;
    staleTexts: number;
    encodes: number;
    lastUploadKind: string;
  };
  const textStats = (): TTextStats => {
    const stats = layer.getBackend()?.stats as unknown as TTextStats | undefined;
    if (!stats) throw new Error("no backend");
    return { ...stats };
  };
  const whiteText = (patch: Partial<Extract<TScenePrimitive, { kind: "text" }>>): TScenePrimitive => ({
    kind: "text",
    text: "",
    family: "sans-serif",
    size: 14,
    lineHeight: 20,
    color: "#ffffff",
    x: 0,
    y: 0,
    width: 100,
    part: "title",
    ...patch,
  });
  const blackBody = (width: number, height: number): TScenePrimitive => ({
    kind: "rect",
    x: 0,
    y: 0,
    width,
    height,
    fill: "#000000",
    part: "body",
  });
  /** Puts world (wx, wy) at CSS (cx, cy) at a scale. */
  const look = (scale: number, wx: number, wy: number, cx = 400, cy = 300): void => {
    camera.set({ scale, x: cx - wx * scale, y: cy - wy * scale });
  };

  // C26 (fix round 1): one clip rule in both renderers, through a zoom sweep. Three white texts on black bodies whose
  // layouts overflow their boxes (`TTextLayout.overflows`): a world text kept on one line (`wrap: false`) wider than
  // its box, a world text whose line pitch (12) is under its size (20), so its third kept line's em box passes the
  // box's bottom, and a camera-aware 14 px text on one line with a pitch of 10, which grows past its box's width and
  // height as the camera zooms out (it fits at scales 2 and 1, where it is drawn without a clip and its ink stays in
  // the box). At each scale the ink (premultiplied red >= 48) outside each box grown by 1 CSS px is 0 on WebGL and on
  // the Canvas2D picture, with ink inside where a line fits, and each of the three overflows at one scale at least
  // (clipped there). A fourth text fits
  // its box exactly (one 24-unit line in a 24-high box, its em box the box) and is drawn without a clip, as v1 drew
  // every text: the ring of its "Å" and the descender and side bearing of its "j" overhang the box in both renderers
  // at the scales where the overhang is wider than the 1 CSS px margin (2, 1, 0.5).
  await check("C26", async () => {
    const top = 6000;
    const elements = [
      {
        id: "CW",
        box: { x: 60, y: 40, width: 120, height: 48 },
        text: { text: "Wide wide wide wide wide", size: 20, lineHeight: 24, wrap: false },
      },
      {
        id: "CT",
        box: { x: 60, y: 40, width: 180, height: 40 },
        text: { text: "Tight pitch MMMM gggg MMMM gggg MMMM gggg", size: 20, lineHeight: 12 },
      },
      {
        id: "CA",
        box: { x: 60, y: 40, width: 120, height: 60 },
        text: { text: "MMMM WWWW", size: 14, cameraAware: true, lineHeight: 10, wrap: false },
      },
      {
        id: "CF",
        box: { x: 60, y: 40, width: 200, height: 24 },
        text: { text: "jÅÉ ÅÉj", size: 24, lineHeight: 24 },
      },
    ] as const;
    elements.forEach(({ id, box, text }, index) => {
      const primitives = [blackBody(300, 160), whiteText({ ...text, ...box })];
      store.add({ id, zIndex: 200, x: index * 1000, y: top, bounds: elementBounds(primitives), primitives });
    });
    try {
      const lines: string[] = [];
      let pass = true;
      for (const { id, box } of elements) {
        const x = elements.findIndex((element) => element.id === id) * 1000;
        const parts: string[] = [];
        let inked = 0;
        let overflowed = false;
        for (const scale of [2, 1, 0.5, 0.3, 0.2, 0.15]) {
          look(scale, x + 150, top + 80);
          const corner = cssOf(x, top);
          const pictures = picturesOf(corner.x, corner.y, 300 * scale, 160 * scale);
          const cssBox = {
            x: corner.x + box.x * scale,
            y: corner.y + box.y * scale,
            width: box.width * scale,
            height: box.height * scale,
          };
          const webgl = inkAround(pictures.webgl, pictures, cssBox, 1);
          const canvas = inkAround(pictures.canvas2d, pictures, cssBox, 1);
          const primitive = (store.get(id)?.primitives ?? [])[1];
          const expected = linesOf(primitive).length;
          const overflows = primitive ? layoutOf(primitive).overflows : false;
          if (webgl.inside > 0 && canvas.inside > 0) inked++;
          overflowed = overflowed || overflows;
          const drawn = expected === 0 || (webgl.inside > 0 && canvas.inside > 0);
          // CW, CT, CA: clipped where they overflow, inside the box where they fit. CF: not clipped, its overhang
          // shows in both where it is wider than the margin.
          const overhang = scale < 0.5 || (webgl.outside > 0 && canvas.outside > 0);
          const ok =
            id === "CF" ? !overflows && drawn && overhang : drawn && webgl.outside === 0 && canvas.outside === 0;
          pass = pass && ok;
          parts.push(
            `${scale}: ${expected} line(s), overflows ${overflows}, outside webgl=${webgl.outside} ` +
              `canvas2d=${canvas.outside}, inside webgl=${webgl.inside} canvas2d=${canvas.inside}${ok ? "" : " BAD"}`
          );
        }
        pass = pass && inked >= 2 && (id === "CF" || overflowed);
        lines.push(`${id}${id === "CF" || overflowed ? "" : " (never overflows: BAD)"} ${parts.join(", ")}`);
      }
      record(
        "C26",
        pass,
        `${lines.join("; ")} (want: CW, CT, CA overflow at one scale at least, outside 0 everywhere, ink inside ` +
          "where a line fits; CF never overflows, ink outside in both at scales >= 0.5)"
      );
    } finally {
      for (const { id } of elements) store.delete(id);
      setCamera(1);
    }
  });

  // C27: the same line breaks in both renderers. Corpus texts (long words split by characters, several spaces,
  // newlines, an ellipsis, world and camera-aware sizes at several scales), white on black, 14 px with a pitch of 20 so
  // that lines do not touch. Each text's ink lines (runs of rows with ink) on WebGL and on the Canvas2D picture: as
  // many as the shared layout's lines, each within 1 CSS px at its top and bottom and 1.5 CSS px at its ends. The tops
  // show that WebGL puts each line's glyphs where Canvas2D's `textBaseline = "top"` puts them.
  await check("C27", async () => {
    const top = 8000;
    const cases = [
      { text: "Load the daily partitions of the warehouse", width: 160, height: 100, scale: 1, align: "center" },
      { text: "Supercalifragilisticexpialidocious words", width: 120, height: 100, scale: 1, align: "left" },
      { text: "several   spaces   between    words", width: 110, height: 100, scale: 1.5, align: "right" },
      { text: "lines\nwith\nnewlines and\ttabs", width: 150, height: 100, scale: 1, align: "left" },
      { text: "Load the daily partitions", width: 200, height: 120, scale: 0.5, cameraAware: true, align: "center" },
      { text: "Load the daily partitions", width: 200, height: 120, scale: 0.8, cameraAware: true, align: "center" },
      {
        text: "An ellipsis ends the last kept line of this text",
        width: 150,
        height: 40,
        scale: 1,
        overflow: "ellipsis",
        align: "left",
      },
    ] as const;
    try {
      const lines: string[] = [];
      let pass = true;
      for (let index = 0; index < cases.length; index++) {
        const { scale, ...text } = cases[index];
        const id = `LB${index}`;
        const primitives = [
          blackBody(text.width + 40, text.height + 40),
          whiteText({ ...text, x: 20, y: 20, verticalAlign: "top" }),
        ];
        const y = top + index * 400;
        store.add({ id, zIndex: 200, x: 0, y, bounds: elementBounds(primitives), primitives });
        try {
          look(scale, (text.width + 40) / 2, y + (text.height + 40) / 2);
          const corner = cssOf(20, y + 20);
          const pictures = picturesOf(corner.x - 4, corner.y - 4, text.width * scale + 8, text.height * scale + 8);
          const webgl = bandsOf(pictures.webgl, pictures);
          const canvas = bandsOf(pictures.canvas2d, pictures);
          const layout = linesOf(primitives[1]);
          const ok = webgl.length === layout.length && sameBands(webgl, canvas);
          pass = pass && ok;
          lines.push(
            `${id} ${JSON.stringify(layout)}: webgl ${bandsText(webgl)} canvas2d ` +
              `${bandsText(canvas)}${ok ? "" : " BAD"}`
          );
        } finally {
          store.delete(id);
        }
      }
      record("C27", pass, lines.join("; "));
    } finally {
      setCamera(1);
    }
  });

  // C28: re-layout while drawing. A camera-aware 12 px text in a 200 x 120 box (pitch 16, black body):
  // - a break change: a zoom to a scale with other line breaks draws the new lines on WebGL in the same frame (ink
  //   lines as the layout's, as on Canvas2D), with a text re-layout in that frame; a zoom that keeps the breaks re-lays
  //   out nothing and encodes nothing;
  // - entering the view: a second such text off the view is left stale by a zoom that changes its breaks (no encode),
  //   and a pan that brings it into view draws its new lines in the first frame, after which nothing is stale;
  // - the setting: `cameraAwareText: false` redraws the text at its world size (12 world units) in the next frame on
  //   both renderers, and `true` brings the camera-aware lines back;
  // - a font reload: the text's family becomes a web font (a local Courier face loaded under a new name), the backend
  //   is recreated on `loadingdone` and its lines come from the new metrics, as on Canvas2D.
  await check("C28", async () => {
    const top = 12000;
    const box = { x: 20, y: 20, width: 200, height: 120 };
    const make = (family = "sans-serif"): TScenePrimitive[] => [
      blackBody(240, 160),
      whiteText({
        text: "Load the daily partitions of the warehouse",
        family,
        size: 12,
        cameraAware: true,
        lineHeight: 16,
        ...box,
      }),
    ];
    store.add({ id: "BR", zIndex: 200, x: 0, y: top, bounds: elementBounds(make()), primitives: make() });
    store.add({ id: "OV", zIndex: 200, x: 3000, y: top, bounds: elementBounds(make()), primitives: make() });
    const linesAt = (scale: number): number => {
      const primitive = (store.get("BR")?.primitives ?? [])[1];
      return primitive?.kind === "text"
        ? sceneTextLayout(primitive, primitive, resolveTextSize(primitive, scale, { cameraAware: true })).lines.length
        : 0;
    };
    const bandsAt = (x: number): { webgl: TBand[]; canvas: TBand[]; lines: number } => {
      const scale = camera.getCameraScale();
      const corner = cssOf(x + box.x, top + box.y);
      const pictures = picturesOf(corner.x - 2, corner.y - 2, box.width * scale + 4, box.height * scale + 4);
      const primitive = (store.get(x === 0 ? "BR" : "OV")?.primitives ?? [])[1];
      return {
        webgl: bandsOf(pictures.webgl, pictures),
        canvas: bandsOf(pictures.canvas2d, pictures),
        lines: primitive ? linesOf(primitive).length : 0,
      };
    };
    try {
      const lines: string[] = [];
      let pass = true;
      // Two scales with different line counts.
      const scales = [1.2, 1, 0.8, 0.7, 0.6, 0.5];
      const first = scales[0];
      const second = scales.find((scale) => linesAt(scale) !== linesAt(first)) ?? 0.5;
      look(first, 120, top + 80);
      bandsAt(0);
      const encodes = textStats().encodes;
      // Within the breaks of `first`: 1% more scale changes no line.
      look(first * 1.01, 120, top + 80);
      readRegion(0, 0, 1, 1);
      const quiet = textStats();
      const keep =
        quiet.lastTextRelayouts === 0 && quiet.encodes === encodes && linesAt(first * 1.01) === linesAt(first);
      look(second, 120, top + 80);
      const changed = bandsAt(0);
      const after = textStats();
      const breaks =
        changed.webgl.length === changed.lines &&
        sameBands(changed.webgl, changed.canvas) &&
        after.lastTextRelayouts >= 1;
      pass = pass && keep && breaks;
      lines.push(
        `break change ${first}->${second}: ${linesAt(first)}->${changed.lines} line(s); webgl ` +
          `${bandsText(changed.webgl)} canvas2d ${bandsText(changed.canvas)}; relayouts in the frame ` +
          `${after.lastTextRelayouts} (${after.lastTextRelayoutGlyphs} glyphs, ` +
          `${after.lastTextRelayoutMs.toFixed(2)} ` +
          `ms, upload ${after.lastUploadKind}); a 1% zoom inside the breaks: relayouts ${quiet.lastTextRelayouts}, ` +
          `encodes +${quiet.encodes - encodes}${keep && breaks ? "" : " BAD"}`
      );

      // OV lies off the view: the zoom to `second` left it stale (laid out for `first`), and a pan shows it.
      const stale = after.staleTexts;
      look(second, 3120, top + 80);
      const entered = bandsAt(3000);
      const shown = textStats();
      const fresh =
        stale >= 1 &&
        shown.staleTexts === 0 &&
        entered.webgl.length === entered.lines &&
        sameBands(entered.webgl, entered.canvas);
      pass = pass && fresh;
      lines.push(
        `entering the view: stale before the pan ${stale} (want >=1), after ${shown.staleTexts} (want 0); ` +
          `${entered.lines} line(s), webgl ${bandsText(entered.webgl)} canvas2d ${bandsText(entered.canvas)}` +
          `${fresh ? "" : " BAD"}`
      );

      // The setting, at a scale where the camera-aware lines differ from the world ones (12 world units).
      const worldLines = linesAt(1);
      const toggleScale = [0.6, 0.5, 0.7, 0.4].find((scale) => linesAt(scale) !== worldLines) ?? 0.5;
      look(toggleScale, 120, top + 80);
      bandsAt(0);
      graph.updateSettings({ cameraAwareText: false });
      const off = bandsAt(0);
      graph.updateSettings({ cameraAwareText: true });
      const on = bandsAt(0);
      // `lines` follows the setting (`linesOf`): the world lines while it is off, the camera-aware ones while it is on.
      const toggled =
        off.webgl.length === off.lines &&
        sameBands(off.webgl, off.canvas) &&
        on.webgl.length === on.lines &&
        sameBands(on.webgl, on.canvas) &&
        off.lines !== on.lines;
      pass = pass && toggled;
      lines.push(
        `setting at ${toggleScale}: off ${off.lines} line(s) webgl ${bandsText(off.webgl)} canvas2d ` +
          `${bandsText(off.canvas)}; on ` +
          `${on.lines} line(s) webgl ${bandsText(on.webgl)} canvas2d ${bandsText(on.canvas)}${toggled ? "" : " BAD"}`
      );

      // A font reload with other metrics.
      const family = "C28Courier";
      store.update("BR", { primitives: make(`${family}, serif`) });
      look(1, 120, top + 80);
      const before = bandsAt(0);
      const linesBefore = linesOf((store.get("BR")?.primitives ?? [])[1]);
      const generation = (sceneTextMetrics as unknown as { generation: number }).generation;
      const face = new FontFace(family, "local('Courier New'), local('Courier')");
      document.fonts.add(face);
      const loaded = new Promise<string>((resolve) => {
        document.fonts.addEventListener("loadingdone", () => resolve("loadingdone"), { once: true });
        setTimeout(() => resolve("timeout"), 3000);
      });
      const loadResult = await face.load().then(
        () => "loaded",
        (error: unknown) => `failed: ${String(error)}`
      );
      let event = await loaded;
      if (event === "timeout") {
        document.fonts.dispatchEvent(new Event("loadingdone"));
        event = "dispatched";
      }
      for (let i = 0; i < 400 && graph.scene.$renderer.value !== "webgl"; i++) await wait(10);
      await frame();
      const reloaded = bandsAt(0);
      const linesAfter = linesOf((store.get("BR")?.primitives ?? [])[1]);
      const relaid =
        (sceneTextMetrics as unknown as { generation: number }).generation > generation &&
        graph.scene.$renderer.value === "webgl" &&
        reloaded.webgl.length === reloaded.lines &&
        sameBands(reloaded.webgl, reloaded.canvas);
      pass = pass && relaid;
      lines.push(
        `font reload (${loadResult}, ${event}): ${JSON.stringify(linesBefore)} -> ${JSON.stringify(linesAfter)}, ` +
          `${before.lines} -> ${reloaded.lines} line(s), webgl ` +
          `${bandsText(reloaded.webgl)} canvas2d ${bandsText(reloaded.canvas)}; renderer ` +
          `${graph.scene.$renderer.value}${relaid ? "" : " BAD"}`
      );
      document.fonts.delete(face);
      record("C28", pass, lines.join("; "));
    } finally {
      graph.updateSettings({ cameraAwareText: true });
      store.delete("BR");
      store.delete("OV");
      setCamera(1);
    }
  });

  // C28b, translucent: a camera-aware text in a translucent white (its glyphs in the translucent pass) on a black body
  // with a faded red stripe of the same element, across a break change (1.2 -> 0.6). The glyphs alone are re-encoded
  // (no primitive encode is counted), and the element's translucent steps are cut again from its kept writes: WebGL's
  // ink lines are the layout's and Canvas2D's at both scales, and the stripe still matches Canvas2D.
  await check("C28b", async () => {
    const top = 14000;
    const box = { x: 20, y: 20, width: 200, height: 120 };
    const primitives: TScenePrimitive[] = [
      blackBody(240, 170),
      { kind: "rect", x: 0, y: 150, width: 240, height: 12, fill: "rgba(255, 0, 0, 0.5)" },
      whiteText({
        text: "Load the daily partitions of the warehouse",
        size: 12,
        cameraAware: true,
        lineHeight: 16,
        color: "rgba(255, 255, 255, 0.7)",
        ...box,
      }),
    ];
    store.add({ id: "TR", zIndex: 200, x: 0, y: top, bounds: elementBounds(primitives), primitives });
    try {
      const at = (scale: number): { webgl: TBand[]; canvas: TBand[]; lines: number; stripe: string; ok: boolean } => {
        look(scale, 120, top + 80);
        const corner = cssOf(box.x, top + box.y);
        const pictures = picturesOf(corner.x - 2, corner.y - 2, box.width * scale + 4, box.height * scale + 4);
        const stripeAt = cssOf(120, top + 156);
        const stripe = picturesOf(stripeAt.x - 1, stripeAt.y - 1, 2, 2);
        const webglStripe = Array.from(stripe.webgl.subarray(0, 4));
        const canvasStripe = Array.from(stripe.canvas2d.subarray(0, 4));
        const webgl = bandsOf(pictures.webgl, pictures);
        const canvas = bandsOf(pictures.canvas2d, pictures);
        const lines = linesOf(primitives[2]).length;
        const ok = webgl.length === lines && sameBands(webgl, canvas) && near(webglStripe, canvasStripe);
        return { webgl, canvas, lines, stripe: `${show(webglStripe)} vs ${show(canvasStripe)}`, ok };
      };
      const first = at(1.2);
      const before = textStats();
      const second = at(0.6);
      const stats = textStats();
      // Two reads per scale: the re-layout runs in the first frame at 0.6, so the counter since creation is compared.
      const relayouts = stats.textRelayouts - before.textRelayouts;
      const pass =
        first.ok && second.ok && first.lines !== second.lines && relayouts >= 1 && stats.encodes === before.encodes;
      record(
        "C28b",
        pass,
        `translucent text: 1.2 ${first.lines} line(s) webgl ${bandsText(first.webgl)} canvas2d ` +
          `${bandsText(first.canvas)} stripe ${first.stripe}; 0.6 ${second.lines} line(s) webgl ` +
          `${bandsText(second.webgl)} canvas2d ${bandsText(second.canvas)} stripe ${second.stripe}; text re-layouts ` +
          `${relayouts} (want >=1), primitive encodes +${stats.encodes - before.encodes} (want 0)`
      );
    } finally {
      store.delete("TR");
      setCamera(1);
    }
  });

  // C29 (Task 17i): a break change uploads the glyphs of the texts it changes. 30 elements in view, each a black body,
  // a camera-aware name and a world caption; among them three names in `system-ui` (its widths do not scale
  // linearly: laid out again at every size), three in a translucent white (the translucent glyph pass) and three under
  // a translucent stripe that a re-layout leaves alone. A zoom sweep 0.6 -> 0.2 in 24 steps, then the setting off and
  // on: in every frame that re-lays texts out, the bytes uploaded are at most twice the glyph bytes of the texts it
  // changed (`lastTextRelayoutBytes`), no list uploads whole and only the glyph instance lists upload (neither glyph
  // subs, rects nor paths); a frame that re-lays out nothing uploads nothing. In the middle of the sweep, at its end
  // and after the setting, every element's floats equal a fresh encode's (as C23), every GPU buffer holds its CPU
  // floats, and the picture is the one a full replay of the store draws.
  await check("C29", async () => {
    const top = 26000;
    const names = ["Load the daily partitions", "Join the user events by key", "Write the report", "Fetch the weights"];
    const make = (i: number): TScenePrimitive[] => {
      const primitives: TScenePrimitive[] = [blackBody(150, 70)];
      if (i % 10 === 7) {
        primitives.push({ kind: "rect", x: 0, y: 56, width: 150, height: 14, fill: "rgba(255,0,0,0.5)" });
      }
      primitives.push(
        whiteText({
          text: `${names[i % names.length]} ${i}`,
          family: i % 10 === 3 ? "system-ui" : "sans-serif",
          size: 11,
          cameraAware: { maxWorld: 40 },
          lineHeight: 12,
          x: 5,
          y: 5,
          width: 140,
          height: 48,
          align: "center",
          verticalAlign: "middle",
          ...(i % 10 === 5 ? { color: "rgba(255, 255, 255, 0.7)" } : {}),
        }),
        whiteText({ text: `stage ${i}`, size: 9, lineHeight: 10, x: 5, y: 57, width: 140, height: 11, part: undefined })
      );
      return primitives;
    };
    const ids = Array.from({ length: 30 }, (_, i) => `BC${i}`);
    const placeOf = (i: number): { x: number; y: number } => ({ x: (i % 6) * 170, y: top + Math.floor(i / 6) * 90 });
    ids.forEach((id, i) => {
      const primitives = make(i);
      store.add({ id, zIndex: 200, ...placeOf(i), bounds: elementBounds(primitives), primitives });
    });
    const center = { x: (5 * 170 + 150) / 2, y: top + (4 * 90 + 70) / 2 };
    type TStepStats = TTextStats & {
      lastTextRelayoutBytes: number;
      lastTextRelayoutWrittenBytes: number;
      lastTextRelayoutDrawnBytes: number;
      lastUploadBytes: number;
      lastUploadWrites: number;
    };
    /** The worst ratios of the frames that lay texts out: uploaded over the bytes the texts wrote and drew. */
    const against = { written: 0, drawn: 0 };
    const labels = glyphLabels();
    const translucentGlyphs = listsOf(backendView()).find(({ label }) => label.endsWith(":glyph-translucenti"))?.label;
    /** Draws a frame and checks its uploads against its re-layouts; returns its line for the log. */
    const frameUploads = (): { ok: boolean; relayouts: number; ratio: number; line: string } => {
      const uploads = uploadsOf(() => readRegion(0, 0, 1, 1));
      const stats = textStats() as TStepStats;
      const glyphBytes = stats.lastTextRelayoutBytes;
      const relayouts = stats.lastTextRelayouts;
      const kinds = [...uploads.values()];
      const others = [...uploads.keys()].filter((label) => label !== labels.instances && label !== translucentGlyphs);
      const bounded = relayouts > 0 ? stats.lastUploadBytes <= 2 * glyphBytes : stats.lastUploadBytes === 0;
      const ok = bounded && !kinds.includes("full") && others.length === 0;
      const ratio = glyphBytes > 0 ? stats.lastUploadBytes / glyphBytes : 0;
      if (stats.lastTextRelayoutWrittenBytes > 0) {
        against.written = Math.max(against.written, stats.lastUploadBytes / stats.lastTextRelayoutWrittenBytes);
      }
      if (stats.lastTextRelayoutDrawnBytes > 0) {
        against.drawn = Math.max(against.drawn, stats.lastUploadBytes / stats.lastTextRelayoutDrawnBytes);
      }
      return {
        ok,
        relayouts,
        ratio,
        line:
          `${relayouts} texts ${glyphBytes} B -> ${stats.lastUploadBytes} B in ${stats.lastUploadWrites} writes ` +
          `(${kinds.join("/") || "none"}${others.length ? `; also ${others.join(" ")}` : ""})${ok ? "" : " BAD"}`,
      };
    };
    /** Every element's floats against a fresh encode's, the GPU buffers, and the picture against a full replay. */
    const replayed = (when: string): { ok: boolean; line: string } => {
      readRegion(0, 0, 1, 1);
      const incremental = ids.map((id) => signatureOf(id));
      ids.forEach((id, i) => {
        const element = store.get(id);
        if (!element) return;
        store.add({
          ...placeOf(i),
          x: placeOf(i).x + 100000,
          id: `${id}~ref`,
          zIndex: 200,
          bounds: element.bounds,
          primitives: element.primitives,
        });
      });
      readRegion(0, 0, 1, 1);
      const fresh = ids.map((id) => signatureOf(`${id}~ref`));
      for (const id of ids) store.delete(`${id}~ref`);
      const differs = incremental.findIndex((signature, i) => signature !== fresh[i] || signature.length === 0);
      const gpuStale = gpuDiffers();
      const corner = cssOf(-10, top - 10);
      const scale = camera.getCameraScale();
      const area = { x: corner.x, y: corner.y, w: (5 * 170 + 170) * scale, h: (4 * 90 + 90) * scale };
      const device = (css: number): number => Math.round(css * dpr);
      const read = (): Uint8Array => readRegion(device(area.x), device(area.y), device(area.w), device(area.h));
      const before = read();
      const backend = layer.getBackend() as unknown as {
        replay(target: typeof store, frame: { scale: number; textPolicy: { cameraAware: boolean } }): void;
      };
      backend.replay(store, { scale, textPolicy: { cameraAware: graph.scene.$cameraAwareText.value } });
      const after = read();
      let pixels = 0;
      for (let i = 0; i < before.length; i += 4) {
        if (before[i] !== after[i] || before[i + 1] !== after[i + 1] || before[i + 2] !== after[i + 2]) pixels++;
      }
      const ink = before.reduce((sum, value, i) => sum + (i % 4 === 0 && value > 64 ? 1 : 0), 0);
      const ok = differs < 0 && gpuStale.length === 0 && pixels === 0 && ink > 0;
      return {
        ok,
        line:
          `${when}: floats = fresh encode ${differs < 0}` +
          (differs < 0 ? "" : ` (${ids[differs]}: ${firstDifference(incremental[differs], fresh[differs])})`) +
          `, gpu=cpu ${gpuStale.length === 0}${gpuStale.length ? ` (${gpuStale.join(" ")})` : ""}, picture vs a full ` +
          `replay ${pixels} px differ (${ink} ink px)${ok ? "" : " BAD"}`,
      };
    };
    try {
      const lines: string[] = [];
      let pass = true;
      look(0.6, center.x, center.y);
      readRegion(0, 0, 1, 1);
      let changing = 0;
      let texts = 0;
      let worst = 0;
      const steps: string[] = [];
      for (let step = 1; step <= 24; step++) {
        const scale = 0.6 * Math.pow(0.2 / 0.6, step / 24);
        look(scale, center.x, center.y);
        const result = frameUploads();
        pass = pass && result.ok;
        if (result.relayouts > 0) changing++;
        texts += result.relayouts;
        worst = Math.max(worst, result.ratio);
        if (step % 6 === 0 || !result.ok) steps.push(`${scale.toFixed(3)}: ${result.line}`);
        if (step === 12) {
          const middle = replayed(`at ${scale.toFixed(3)}`);
          pass = pass && middle.ok;
          lines.push(middle.line);
        }
      }
      const end = replayed("at 0.2");
      pass = pass && end.ok && changing >= 8;
      lines.push(end.line);
      look(0.35, center.x, center.y);
      readRegion(0, 0, 1, 1);
      graph.updateSettings({ cameraAwareText: false });
      const off = frameUploads();
      graph.updateSettings({ cameraAwareText: true });
      const on = frameUploads();
      const toggled = off.ok && on.ok && off.relayouts === ids.length && on.relayouts === ids.length;
      const afterToggle = replayed("after the setting off and on at 0.35");
      pass = pass && toggled && afterToggle.ok;
      lines.push(
        `setting off: ${off.line}; on: ${on.line}${toggled ? "" : " BAD (want every name re-laid out)"}`,
        afterToggle.line
      );
      record(
        "C29",
        pass,
        `zoom 0.6 -> 0.2 in 24 steps: ${changing} frames re-lay texts out (want >= 8), ${texts} texts, ` +
          `uploaded bytes at most ${worst.toFixed(2)} x their glyph bytes (want <= 2; ` +
          `${against.written.toFixed(2)} x the bytes they wrote, ${against.drawn.toFixed(2)} x those of the glyphs ` +
          `they draw); steps ${steps.join("; ")}; ${lines.join("; ")}`
      );
    } finally {
      graph.updateSettings({ cameraAwareText: true });
      for (const id of ids) {
        store.delete(id);
        if (store.get(`${id}~ref`)) store.delete(`${id}~ref`);
      }
      setCamera(1);
    }
  });

  // C30: anchor classes from getAnchorClass. Block S (x 0..200, y 3000..3100) has a square OUT anchor at (200, 3088)
  // and an IN anchor at (0, 3088) whose class draws an 80 x 80 square on the minimalistic level only.
  // 1. schematic (0.5): the square's corner (207, 3081), outside a radius-9 dot, has the anchor colour, as on Canvas2D;
  // 2. minimalistic (0.1), S added while the camera is there: the IN anchor exists (its class declares the level) and
  //    its square left of the block, at (-25, 3088), has the anchor colour, as on Canvas2D.
  const anchorColor = hex("#ff00ff");
  const shapes = {
    id: "S",
    is: "Shapes",
    name: "Shapes",
    x: 0,
    y: 3000,
    width: 200,
    height: 100,
    anchors: [
      { id: "i", blockId: "S", type: "IN" },
      { id: "o", blockId: "S", type: "OUT" },
    ],
  };
  const lookAtShapes = (scale: number): void => camera.set({ scale, x: ORIGIN.x, y: ORIGIN.y - 3000 * scale });
  await check("C30", async () => {
    graph.updateSettings({ useBlocksAnchors: true, blockComponents: { Shapes: SliceShapesBlock } });
    graph.setColors({ anchor: { background: "#ff00ff" } });
    try {
      lookAtShapes(0.5);
      graph.setEntities({ blocks: [shapes], connections: [] });
      for (let i = 0; i < 6; i++) graph.scheduler.performUpdate();
      const corner = pixelAt(207, 3081);
      const square = againstCanvas2D(194, 3082, 12, 12);
      graph.setEntities({ blocks: [], connections: [] });
      // S unmounts before it comes back, so its anchors are created fresh at the minimalistic level. C30b covers the
      // re-add in the same frame.
      for (let i = 0; i < 2; i++) graph.scheduler.performUpdate();
      lookAtShapes(0.1);
      graph.setEntities({ blocks: [shapes], connections: [] });
      for (let i = 0; i < 6; i++) graph.scheduler.performUpdate();
      const far = pixelAt(-25, 3088);
      const farRegion = againstCanvas2D(-35, 3080, 20, 16);
      const created = graph.rootStore.blocksList.getBlockState("S")?.getAnchorById("i")?.getViewComponent();
      const worst = Math.max(square.worst, farRegion.worst);
      record(
        "C30",
        near(corner, anchorColor) && near(far, anchorColor) && created instanceof SliceFarAnchor && worst <= TOLERANCE,
        `schematic square corner ${show(corner)} (want #ff00ff); minimalistic IN square ${show(far)} (want #ff00ff), ` +
          `IN anchor created at minimalistic=${created instanceof SliceFarAnchor}; worst channel difference from ` +
          `Canvas2D=${worst} (square ${square.worst}, far ${farRegion.worst})`
      );
    } finally {
      graph.setEntities({ blocks: [], connections: [] });
      graph.updateSettings({ blockComponents: {} });
      graph.setColors({ anchor: { background: initGraphColors.anchor.background } });
      setCamera(1);
    }
  });

  // C30b (Task 3x): block S removed and added back in one frame. S and its anchors exist at schematic (0.5); then S is
  // removed, the camera goes to minimalistic (0.1) and S is added again, all before a frame. The kept block and its
  // kept anchor components bind to the new block and anchor states: the new state of the IN anchor names the component
  // created at schematic, and its square at (-25, 3088) has the anchor colour, as on Canvas2D.
  await check("C30b", async () => {
    // C30's removal settles first, so this check's re-add is the only one in its frame.
    for (let i = 0; i < 2; i++) graph.scheduler.performUpdate();
    graph.updateSettings({ useBlocksAnchors: true, blockComponents: { Shapes: SliceShapesBlock } });
    graph.setColors({ anchor: { background: "#ff00ff" } });
    try {
      lookAtShapes(0.5);
      graph.setEntities({ blocks: [shapes], connections: [] });
      for (let i = 0; i < 6; i++) graph.scheduler.performUpdate();
      const before = graph.rootStore.blocksList.getBlockState("S")?.getAnchorById("i");
      const component = before?.getViewComponent();
      graph.setEntities({ blocks: [], connections: [] });
      lookAtShapes(0.1);
      graph.setEntities({ blocks: [shapes], connections: [] });
      for (let i = 0; i < 6; i++) graph.scheduler.performUpdate();
      const far = pixelAt(-25, 3088);
      const farRegion = againstCanvas2D(-35, 3080, 20, 16);
      const after = graph.rootStore.blocksList.getBlockState("S")?.getAnchorById("i");
      const created = component instanceof SliceFarAnchor;
      const rebound = created && after !== undefined && after !== before && after.getViewComponent() === component;
      record(
        "C30b",
        near(far, anchorColor) && rebound && farRegion.worst <= TOLERANCE,
        `minimalistic IN square ${show(far)} (want #ff00ff); IN anchor created at schematic=${created}, kept and ` +
          `bound to the new anchor state=${rebound}; worst channel difference from Canvas2D=${farRegion.worst}`
      );
    } finally {
      graph.setEntities({ blocks: [], connections: [] });
      graph.updateSettings({ blockComponents: {} });
      graph.setColors({ anchor: { background: initGraphColors.anchor.background } });
      setCamera(1);
    }
  });

  // C31: nested children. Block NE (x 0..200, y 3500..3600) has chip A (x 20..60, y 3560..3590) with a nested chip
  // A1 (x 30..70), then chip B (x 50..90). At scale 0.5: A1 draws over A and under B (the pre-order A, A1, B), as
  // Canvas2D draws it; hiding A hides A1 on WebGL too (the backend reads the nesting), and showing A draws it again.
  await check("C31", async () => {
    graph.updateSettings({ blockComponents: { SliceNested: SliceNestedBlock } });
    graph.setEntities({
      blocks: [{ id: "NE", is: "SliceNested", name: "Nested", x: 0, y: 3500, width: 200, height: 100, anchors: [] }],
      connections: [],
    });
    camera.set({ scale: 0.5, x: ORIGIN.x, y: ORIGIN.y - 3500 * 0.5 });
    for (let i = 0; i < 6; i++) graph.scheduler.performUpdate();
    try {
      const view = graph.rootStore.blocksList.getBlockState("NE")?.getViewComponent();
      const chipA = view instanceof SliceNestedBlock ? view.chipA : undefined;
      if (!chipA) throw new Error("C31: no chip A");
      const region = againstCanvas2D(24, 3562, 70, 26);
      const a = pixelAt(25, 3575);
      const a1 = pixelAt(40, 3575);
      const b = pixelAt(65, 3575);
      chipA.setHiddenLook(true);
      for (let i = 0; i < 3; i++) graph.scheduler.performUpdate();
      const hiddenA1 = pixelAt(40, 3575);
      chipA.setHiddenLook(false);
      for (let i = 0; i < 3; i++) graph.scheduler.performUpdate();
      const shownA1 = pixelAt(40, 3575);
      record(
        "C31",
        region.worst <= TOLERANCE &&
          near(a, hex("#0000ff")) &&
          near(a1, hex("#ff8800")) &&
          near(b, hex("#00aa00")) &&
          !near(hiddenA1, hex("#ff8800")) &&
          !near(hiddenA1, hex("#0000ff")) &&
          near(shownA1, hex("#ff8800")),
        `worst channel difference from Canvas2D=${region.worst}; A ${show(a)} (want #0000ff), A1 ${show(a1)} (want ` +
          `#ff8800), B ${show(b)} (want #00aa00); A hidden: A1 ${show(hiddenA1)} (want neither); shown again: ` +
          `${show(shownA1)} (want #ff8800)`
      );
    } finally {
      graph.setEntities({ blocks: [], connections: [] });
      graph.updateSettings({ blockComponents: {} });
      setCamera(1);
    }
  });

  // C32: child scene components. Block CH (x 0..200, y 2000..2100) has a button child at world (150..200,
  // 2070..2100) and its OUT anchor at (200, 2088), a later child. At scale 0.5 (schematic): the button draws over CH's
  // body and under the anchor, as Canvas2D draws them; the button's own hover event (as GraphLayer dispatches it to a
  // target) makes it tag itself, and a `hoveredTag` rule recolours its part, with no re-encode.
  await check("C32", async () => {
    const stats = layer.getBackend()?.stats;
    if (!stats) throw new Error("no backend in C32");
    const scale = 0.5;
    graph.updateSettings({ useBlocksAnchors: true, blockComponents: { SliceChild: SliceChildBlock } });
    graph.setColors({ anchor: { background: "#ff00ff" } });
    const removeRules = graph.scene.styles.add([
      { target: SliceButton, tags: [hoveredTag], style: { parts: { button: { color: "#ff8800" } } } },
    ]);
    graph.setEntities({
      blocks: [
        {
          id: "CH",
          is: "SliceChild",
          name: "Children",
          x: 0,
          y: 2000,
          width: 200,
          height: 100,
          anchors: [{ id: "o", blockId: "CH", type: "OUT" }],
        },
      ],
      connections: [],
    });
    camera.set({ scale, x: ORIGIN.x, y: ORIGIN.y - 2000 * scale });
    for (let i = 0; i < 6; i++) graph.scheduler.performUpdate();
    try {
      const view = graph.rootStore.blocksList.getBlockState("CH")?.getViewComponent();
      const child = view instanceof SliceChildBlock ? view.button : undefined;
      if (!child) throw new Error("C32: no button child");
      // Below the title, whose 24-unit glyphs (y 2010..2034) the two renderers antialias differently.
      const body = againstCanvas2D(20, 2050, 40, 10);
      const buttonRegion = againstCanvas2D(160, 2072, 20, 6);
      const overlap = againstCanvas2D(195, 2086, 3, 3);
      const buttonBefore = pixelAt(165, 2075);
      const anchorOverButton = pixelAt(196, 2088);
      const encodes = stats.encodes;
      child.dispatchEvent(new CustomEvent("mouseenter", { detail: { target: child, relatedTarget: view } }));
      for (let i = 0; i < 3; i++) graph.scheduler.performUpdate();
      const buttonHovered = pixelAt(165, 2075);
      const hoverEncodes = stats.encodes - encodes;
      const worst = Math.max(body.worst, buttonRegion.worst, overlap.worst);
      record(
        "C32",
        worst <= TOLERANCE &&
          near(buttonBefore, hex("#00aaff")) &&
          near(anchorOverButton, hex("#ff00ff")) &&
          near(buttonHovered, hex("#ff8800")) &&
          hoverEncodes === 0,
        `worst channel difference from Canvas2D=${worst} (body ${body.worst}, button ${buttonRegion.worst}, anchor ` +
          `over button ${overlap.worst}); button ${show(buttonBefore)} (want #00aaff), anchor over it ` +
          `${show(anchorOverButton)} (want #ff00ff), hovered ${show(buttonHovered)} (want #ff8800); encodes on ` +
          `hover=${hoverEncodes} (want 0)`
      );
    } finally {
      removeRules();
      graph.setEntities({ blocks: [], connections: [] });
      graph.updateSettings({ blockComponents: {} });
      graph.setColors({ anchor: { background: initGraphColors.anchor.background } });
      setCamera(1);
    }
  });

  // C33: the handover. Block H (x 0..200, y 2500..2600) is held by an HTML view (`delegateRender`) at scale 1
  // (detailed): its body is not drawn, with no re-encode. Zooming out to 0.5 draws it in the first graph frame after
  // the camera change (pixelAt runs exactly one), zooming back in hides it again, and the release draws it.
  await check("C33", async () => {
    const stats = layer.getBackend()?.stats;
    if (!stats) throw new Error("no backend in C33");
    const bodyColor = hex(initGraphColors.block.background);
    const lookAt = (scale: number): void => camera.set({ scale, x: ORIGIN.x, y: ORIGIN.y - 2500 * scale });
    graph.setEntities({
      blocks: [{ id: "H", is: "Block", name: "Held", x: 0, y: 2500, width: 200, height: 100, anchors: [] }],
      connections: [],
    });
    lookAt(1);
    for (let i = 0; i < 6; i++) graph.scheduler.performUpdate();
    try {
      const view = graph.rootStore.blocksList.getBlockState("H")?.getViewComponent();
      if (!view) throw new Error("C33: no block view");
      const drawn = pixelAt(50, 2550);
      const encodes = stats.encodes;
      // Run red first (re-review 11): before Step 3 the tree's handover is the ungated `setRenderDelegated`.
      const holder = view as unknown as { delegateRender?: (request: { canvasVisible: boolean }) => () => void };
      let release: () => void;
      if (holder.delegateRender) release = holder.delegateRender({ canvasVisible: false });
      else {
        view.setRenderDelegated(true);
        release = (): void => view.setRenderDelegated(false);
      }
      const held = pixelAt(50, 2550);
      const holdEncodes = stats.encodes - encodes;
      lookAt(0.5);
      const zoomedOut = pixelAt(50, 2550);
      lookAt(1);
      const back = pixelAt(50, 2550);
      release();
      const released = pixelAt(50, 2550);
      record(
        "C33",
        near(drawn, bodyColor) &&
          !near(held, bodyColor) &&
          holdEncodes === 0 &&
          near(zoomedOut, bodyColor) &&
          !near(back, bodyColor) &&
          near(released, bodyColor),
        `body drawn ${show(drawn)}, held ${show(held)} (want no body), re-encodes on hold=${holdEncodes} (want 0), ` +
          `first frame at 0.5 ${show(zoomedOut)} (want the body), back at 1 ${show(back)} (want no body), released ` +
          `${show(released)} (want the body ${initGraphColors.block.background})`
      );
    } finally {
      graph.setEntities({ blocks: [], connections: [] });
      setCamera(1);
    }
  });

  // C34 (Task 3y): the same-frame re-add family, in pixels of the scene's WebGL canvas (cyan, 2 px lines).
  // 1. Blocks P (x 0..100) and Q (x 400..500), y 4000..4050, and connection K from P's output (100, 4025) to Q's input
  //    (400, 4025). K is removed and added back before a frame: the line is drawn at (250, 4025).
  // 2. Blocks M1 (x 0..100) and M2 (x 150..250), y 4200..4250, in collapsible group G, and block O (x 600..700), with
  //    connection N from M1's output (100, 4225) to O. G collapses, so M1's ports are delegated to G's edge ports (the
  //    right one at (200, 4204)). M1 is removed and added back without its group before a frame: it owns its ports
  //    again, and N is drawn from (100, 4225), at (130, 4225), left of where the group's edge port would start it.
  await check("C34", async () => {
    const cyan = hex("#00ffff");
    const c34Block = (id: string, x: number, y: number, group?: string): TBlock => ({
      id,
      is: "Block",
      name: id,
      x,
      y,
      width: 100,
      height: 50,
      anchors: [],
      ...(group === undefined ? {} : { group }),
    });
    const styles = { background: "#00ffff" };
    const bezier = graph.rootStore.settings.getConfigFlag("useBezierConnections");
    graph.updateSettings({ useBezierConnections: false });
    const groups = graph.addLayer(BlockGroups, {});
    const settle = (): void => {
      for (let i = 0; i < 6; i++) graph.scheduler.performUpdate();
    };
    /** Whether a vertical strip of 13 device px around a world point in the scene has a cyan pixel. */
    const lineAt = (wx: number, wy: number): { found: boolean; sample: string } => {
      settle();
      const [sx, sy] = screenOf(wx, wy);
      const data = readRegion(Math.floor(sx * dpr), Math.floor(sy * dpr) - 6, 1, 13);
      let best: TPixel = [0, 0, 0, 0];
      for (let i = 0; i < data.length; i += 4) {
        const pixel: TPixel = [data[i], data[i + 1], data[i + 2], data[i + 3]];
        if (pixel[3] >= 200 && near(pixel, cyan)) return { found: true, sample: show(pixel) };
        if (pixel[3] > best[3]) best = pixel;
      }
      return { found: false, sample: show(best) };
    };
    try {
      camera.set({ scale: 1, x: ORIGIN.x, y: ORIGIN.y - 4000 });
      graph.setEntities({
        blocks: [c34Block("P", 0, 4000), c34Block("Q", 400, 4000)],
        connections: [{ id: "K", sourceBlockId: "P", targetBlockId: "Q", styles }],
      });
      settle();
      const connections = graph.rootStore.connectionsList;
      const oldK = connections.getConnectionState("K");
      if (!oldK) throw new Error("C34: no connection K");
      connections.deleteConnections([oldK]);
      connections.addConnection({ id: "K", sourceBlockId: "P", targetBlockId: "Q", styles });
      const readded = lineAt(250, 4025);
      const newK = connections.getConnectionState("K");
      const bound = newK !== undefined && newK !== oldK && newK.getViewComponent() !== undefined;

      camera.set({ scale: 1, x: ORIGIN.x, y: ORIGIN.y - 4200 });
      graph.setEntities({
        blocks: [c34Block("M1", 0, 4200, "G"), c34Block("M2", 150, 4200, "G"), c34Block("O", 600, 4200)],
        connections: [{ id: "N", sourceBlockId: "M1", targetBlockId: "O", styles }],
      });
      graph.rootStore.groupsList.setGroups<TCollapsibleGroup>([
        { id: "G", rect: { x: -20, y: 4180, width: 290, height: 90 }, component: CollapsibleGroup },
      ]);
      settle();
      const group = graph.rootStore.groupsList.getGroupState("G")?.getViewComponent();
      if (!(group instanceof CollapsibleGroup)) throw new Error("C34: no collapsible group G");
      group.collapse();
      settle();
      const output = connections.getPort(createBlockPointPortId("M1", false));
      const delegatedWhileCollapsed = output?.isDelegated === true;
      graph.rootStore.blocksList.deleteBlocks(["M1"]);
      graph.rootStore.blocksList.addBlock(c34Block("M1", 0, 4200));
      const left = lineAt(130, 4225);
      const own = output?.isDelegated === false;
      record(
        "C34",
        readded.found && bound && delegatedWhileCollapsed && left.found && own,
        `K re-added in one frame: line at (250, 4025) ${readded.found ? "drawn" : "missing"} (${readded.sample}, ` +
          `want cyan), new state has a component=${bound}; M1 left collapsed G by a re-add: port delegated while ` +
          `collapsed=${delegatedWhileCollapsed}, own port after=${own}, line at (130, 4225) ` +
          `${left.found ? "drawn" : "missing"} (${left.sample}, want cyan)`
      );
    } finally {
      graph.removeLayer(groups);
      graph.setEntities({ blocks: [], connections: [] });
      graph.updateSettings({ useBezierConnections: bezier });
      setCamera(1);
    }
  });

  // M8 (Task 17i fix round 1): the worst case of upload calls. 10,000 elements with a camera-aware text each, in view
  // together; every hundredth one (100 texts, spread over the glyph buffer) changes its line breaks between two scales,
  // the others keep a fixed size. Per frame: the texts laid out again, the bytes and writes uploaded, and the time of
  // the upload calls (summed over 20 frames: the clock is coarse).
  await check("M8", async () => {
    const top = 40000;
    const changing = (i: number): boolean => i % 100 === 0;
    const make = (i: number): TScenePrimitive[] => [
      whiteText({
        text: changing(i) ? "Load the daily partitions of the warehouse" : "Join the user events by their key",
        size: 12,
        cameraAware: changing(i) ? true : { minWorld: 10, maxWorld: 10 },
        lineHeight: 14,
        x: 0,
        y: 0,
        width: 200,
        height: 120,
      }),
    ];
    for (let i = 0; i < 10000; i++) {
      const primitives = make(i);
      const x = (i % 100) * 6;
      const y = top + Math.floor(i / 100) * 4;
      store.add({ id: `WC${i}`, zIndex: 200, x, y, bounds: elementBounds(primitives), primitives });
    }
    try {
      const sample = make(0)[0];
      const linesAt = (scale: number): string =>
        sample.kind === "text"
          ? sceneTextLayout(sample, sample, resolveTextSize(sample, scale, { cameraAware: true })).lines.join("|")
          : "";
      const first = 1;
      const second = [1.05, 1.1, 0.95, 0.9, 1.15, 0.85].find((scale) => linesAt(scale) !== linesAt(first)) ?? 1.2;
      look(first, 400, top + 250);
      readRegion(0, 0, 1, 1);
      type TUploadView = { uploadRanges(ranges: unknown, buffer: unknown): string };
      const backend = layer.getBackend() as unknown as TUploadView;
      const own = backend as unknown as Record<string, unknown>;
      const original = backend.uploadRanges;
      let uploadMs = 0;
      own.uploadRanges = function (this: TUploadView, ranges: unknown, buffer: unknown): string {
        const start = performance.now();
        const kind = original.call(this, ranges, buffer);
        uploadMs += performance.now() - start;
        return kind;
      };
      type TFrameStats = TTextStats & {
        lastUploadBytes: number;
        lastUploadWrites: number;
        lastTextRelayoutBytes: number;
      };
      const frames: TFrameStats[] = [];
      try {
        for (let round = 0; round < 20; round++) {
          look(round % 2 === 0 ? second : first, 400, top + 250);
          readRegion(0, 0, 1, 1);
          frames.push(textStats() as TFrameStats);
        }
      } finally {
        delete own.uploadRanges;
      }
      const mean = (pick: (stats: TFrameStats) => number): number =>
        frames.reduce((sum, stats) => sum + pick(stats), 0) / frames.length;
      const ratios = frames.map((stats) => stats.lastUploadBytes / Math.max(1, stats.lastTextRelayoutBytes));
      const ratio = Math.max(...ratios);
      const kb = (bytes: number): string => (bytes / 1024).toFixed(1);
      record(
        "M8",
        "info",
        `10,000 texts in view, every hundredth one re-laid out (${first} <-> ${second}, 20 frames): texts per frame ` +
          `${mean((s) => s.lastTextRelayouts).toFixed(1)}, uploaded ${kb(mean((s) => s.lastUploadBytes))} KB in ` +
          `${mean((s) => s.lastUploadWrites).toFixed(1)} writes for ${kb(mean((s) => s.lastTextRelayoutBytes))} KB ` +
          `of glyphs (at most ${ratio.toFixed(2)} x), ` +
          `upload calls ${(uploadMs / frames.length).toFixed(3)} ms per frame, kinds ` +
          `${[...new Set(frames.map((s) => s.lastUploadKind))].join("/")}`
      );
    } finally {
      for (let i = 0; i < 10000; i++) store.delete(`WC${i}`);
      setCamera(1);
    }
  });

  // M5 (Task 17h): a zoom sweep over 400 camera-aware names (9 px, at most 90 world units, in 168 x 60 boxes, as the
  // Playground's action blocks): per step the texts re-laid out, the glyphs they wrote, the time and the upload kind,
  // and the opaque glyph buffer's size. Task 17i: the uploads are the re-laid-out texts' glyphs only.
  await check("M5", async () => {
    const top = 20000;
    const names = ["Load the daily partitions", "Join the user events", "Write the report tables", "Fetch the model"];
    for (let i = 0; i < 400; i++) {
      const primitives = [
        blackBody(188, 80),
        whiteText({
          text: `${names[i % names.length]} ${i}`,
          size: 9,
          cameraAware: { maxWorld: 90 },
          lineHeight: 9,
          x: 10,
          y: 10,
          width: 168,
          height: 60,
          align: "center",
          verticalAlign: "middle",
        }),
      ];
      store.add({
        id: `SW${i}`,
        zIndex: 200,
        x: (i % 20) * 200,
        y: top + Math.floor(i / 20) * 100,
        bounds: elementBounds(primitives),
        primitives,
      });
    }
    try {
      const view = layer.getBackend() as unknown as { glyphs: { opaque: { ranges: { data: Float32Array } } } };
      const steps: string[] = [];
      let relayouts = 0;
      let glyphs = 0;
      let ms = 0;
      let worst = 0;
      let bytes = 0;
      let glyphBytes = 0;
      const kinds = new Map<string, number>();
      for (let step = 0; step <= 30; step++) {
        const scale = 1 * Math.pow(0.15, step / 30);
        look(scale, 2000, top + 1000);
        readRegion(0, 0, 1, 1);
        const stats = textStats();
        relayouts += stats.lastTextRelayouts;
        glyphs += stats.lastTextRelayoutGlyphs;
        ms += stats.lastTextRelayoutMs;
        worst = Math.max(worst, stats.lastTextRelayoutMs);
        const sizes = stats as unknown as { lastUploadBytes: number; lastTextRelayoutBytes: number };
        bytes += sizes.lastUploadBytes;
        glyphBytes += sizes.lastTextRelayoutBytes;
        kinds.set(stats.lastUploadKind, (kinds.get(stats.lastUploadKind) ?? 0) + 1);
        if (step % 10 === 0) {
          steps.push(
            `${scale.toFixed(3)}: ${stats.lastTextRelayouts} texts, ${stats.lastTextRelayoutGlyphs} glyphs, ` +
              `${stats.lastTextRelayoutMs.toFixed(2)} ms, ${stats.lastUploadKind} ` +
              `${(stats as unknown as { lastUploadBytes: number }).lastUploadBytes} B, stale ${stats.staleTexts}`
          );
        }
      }
      const buffer = view.glyphs.opaque.ranges.data.byteLength;
      record(
        "M5",
        "info",
        `zoom sweep 1 -> 0.15 in 30 steps over 400 names: ${relayouts} re-layouts, ${glyphs} glyphs written, ` +
          `${ms.toFixed(1)} ms in total, worst step ${worst.toFixed(2)} ms; upload kinds ` +
          `${[...kinds].map(([kind, count]) => `${kind} x${count}`).join(", ")}; ${(bytes / 1024).toFixed(0)} KB ` +
          `uploaded for ${(glyphBytes / 1024).toFixed(0)} KB of re-laid-out glyphs; the opaque glyph buffer ` +
          `${(buffer / 1024).toFixed(0)} KB (a full upload writes all of it); steps ${steps.join("; ")}`
      );
    } finally {
      for (let i = 0; i < 400; i++) store.delete(`SW${i}`);
      setCamera(1);
    }
  });

  // C35 (Task 6): a style that grows a look grows its culling bounds, in pixels of the Canvas 2D renderer (the WebGL
  // backend culls nothing, so the check sets the renderer to "canvas"; it runs last, after the measurements of the
  // backend). Block H (x 0..200, y 5000..5100) has an OUT anchor at (200, 5088). Its look reaches 11.5 from there
  // (LOOK_EXTENT); the theme's hover scales the dot by 1.8, to a radius of 16.2. At scale 0.5:
  // 1. the camera's left edge at world x 180: the anchor is created and its dot drawn at (205, 5088);
  // 2. the left edge at world x 213, past the anchor's own bounds (211.5), and the anchor hovered: the grown dot is
  //    drawn at (215, 5088), 15 from its point, and not at (218, 5088), past its radius (the ring is hidden).
  await check("C35", async () => {
    const magenta = hex("#ff00ff");
    const scale = 0.5;
    const lookFrom = (left: number): void => camera.set({ scale, x: -left * scale, y: 300 - 5088 * scale });
    const settle = (): void => {
      for (let i = 0; i < 6; i++) graph.scheduler.performUpdate();
    };
    let view: Anchor | undefined;
    graph.updateSettings({ useBlocksAnchors: true, renderer: "canvas" });
    graph.setColors({ anchor: { background: "#ff00ff" } });
    try {
      const requested = performance.now();
      while (graph.scene.$renderer.value !== "canvas" && performance.now() - requested < 5000) await wait(5);
      const state = graph.scene.$renderer.value;
      lookFrom(180);
      graph.setEntities({
        blocks: [
          {
            id: "H",
            is: "Block",
            name: "H",
            x: 0,
            y: 5000,
            width: 200,
            height: 100,
            anchors: [{ id: "o", blockId: "H", type: "OUT" }],
          },
        ],
        connections: [],
      });
      settle();
      const plain = pixelAt(205, 5088);
      const component = graph.rootStore.blocksList.getBlockState("H")?.getAnchorById("o")?.getViewComponent();
      if (!(component instanceof Anchor)) throw new Error("C35: no anchor");
      view = component;
      lookFrom(213);
      settle();
      const before = pixelAt(215, 5088);
      // The anchor's own hover event, as GraphLayer sends it to a target: the anchor tags itself (D5).
      view.dispatchEvent(new CustomEvent("mouseenter", { detail: { target: view } }));
      settle();
      const grown = pixelAt(215, 5088);
      const past = pixelAt(218, 5088);
      const drawn = near(plain, magenta) && near(grown, magenta);
      record(
        "C35",
        state === "canvas" && drawn && !near(before, magenta) && !near(past, magenta),
        `renderer state=${state} (want canvas); viewport over the anchor: dot at (205, 5088) ${show(plain)} (want ` +
          `#ff00ff); left edge at x 213: before the hover (215, 5088) ${show(before)} (want not #ff00ff), hovered ` +
          `${show(grown)} (want #ff00ff), past the grown radius (218, 5088) ${show(past)} (want not #ff00ff)`
      );
    } finally {
      view?.dispatchEvent(new CustomEvent("mouseleave", { detail: { target: view, relatedTarget: undefined } }));
      graph.setEntities({ blocks: [], connections: [] });
      graph.setColors({ anchor: { background: initGraphColors.anchor.background } });
      graph.updateSettings({ renderer: "webgl" });
      const requested = performance.now();
      while (graph.scene.$renderer.value !== "webgl" && performance.now() - requested < 15000) await wait(5);
      setCamera(1);
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
  // M6 (fix rounds 1 and 2, F6 and G2): whether texts of each character group scale linearly in each font family here
  // (a text with a non-linear group is measured per size), with the width of the text at 12 px scaled to 100 px against
  // its width at 100 px.
  const groups: [string, string][] = [
    ["latin", "Load the daily partitions of the warehouse 0123456789"],
    ["cyrillic", "Загрузка ежедневных разделов хранилища"],
    ["emoji", "😀 🚀 🔥 👍"],
  ];
  const linearity = ["system-ui", "sans-serif", "YS Text, sans-serif", "Arial", "monospace"].map((family) => {
    const verdicts = groups.map(([group, sample]) => {
      const at12 = (sceneTextMetrics.widthAt(sample, family, "normal", 12) * 100) / 12;
      const at100 = sceneTextMetrics.width(sample, family, "normal");
      const linear = sceneTextMetrics.linear(sample, family, "normal");
      return `${group} linear=${linear} (${at12.toFixed(2)} vs ${at100.toFixed(2)})`;
    });
    return `${family}: ${verdicts.join(", ")}`;
  });
  record("M6", "info", linearity.join("; "));
  // M7 (fix round 2, G3): WebGL aligns a line by its words and spaces plus the kerning across each space (pairs "x "
  // and " y", `spaceKerning`); Canvas2D by measureText of the complete line. Both at 100 px, per font: the complete
  // width, the sum of the parts, the pair model and its distance from the complete width.
  const kernLines = [
    Array(20).fill("T o").join(" "),
    "Load the daily partitions of the warehouse",
    "Загрузка ежедневных разделов хранилища",
    "AV To Ty We Yo r. y, f.",
  ];
  const kerning = ["Arial", "YS Text, sans-serif", "Times New Roman"].map((family) => {
    const widthOf = (value: string): number => sceneTextMetrics.width(value, family, "normal");
    const space = widthOf(" ");
    const rows = kernLines.map((line) => {
      const words = line.split(" ");
      const parts = words.reduce((sum, word) => sum + widthOf(word), (words.length - 1) * space);
      const model = parts + spaceKerning(line, widthOf, space);
      const complete = widthOf(line);
      return (
        `"${line.slice(0, 12)}…" complete ${complete.toFixed(2)} parts ${parts.toFixed(2)} model ` +
        `${model.toFixed(2)} (off ${Math.abs(model - complete).toFixed(3)})`
      );
    });
    return `${family}: ${rows.join(", ")}`;
  });
  record("M7", "info", kerning.join("; "));
  return results;
}

Object.assign(window, { slice: { run } });
