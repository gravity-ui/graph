import { expect, test } from "@playwright/test";
import type { Page, TestInfo } from "@playwright/test";

import { GraphPageObject } from "../../page-objects/GraphPageObject";

test.use({ viewport: { width: 800, height: 500 }, deviceScaleFactor: 2 });

async function initialize(page: Page): Promise<GraphPageObject> {
  const graph = new GraphPageObject(page);
  await graph.initialize({ blocks: [], connections: [], settings: { renderer: "webgl" } });
  test.skip(
    !(await page.evaluate(() => Boolean(document.createElement("canvas").getContext("webgl2")))),
    "WebGL2 unavailable"
  );
  await expect.poll(() => page.evaluate(() => window.graph.scene.$renderer.value)).toBe("webgl");
  return graph;
}

test("sparse edits upload the two changed lines and restore the WebGL unpack state", async ({ page }) => {
  await initialize(page);
  const result = await page.evaluate(() => {
    const { scene, scheduler, cameraService } = window.graph;
    const backend = scene.layer.getBackend();
    const gl = backend?.canvas.getContext("webgl2");
    if (!backend || !gl) throw new Error("Missing WebGL backend");
    const primitive = (index: number, color: string) => ({
      kind: "path" as const,
      segments: new Float32Array(
        window.GraphModule.lineSegment({ x: 20, y: 10 + index * 8 }, { x: 100, y: 10 + index * 8 })
      ),
      stroke: { color, width: 4 },
    });
    for (let i = 0; i < 32; i++) {
      scene.store.add({
        id: `sparse-${i}`,
        x: 0,
        y: 0,
        zIndex: 0,
        bounds: { minX: 20, minY: 8 + i * 8, maxX: 100, maxY: 12 + i * 8 },
        primitives: [primitive(i, "#0000ff")],
      });
    }
    cameraService.set({ x: 0, y: 0, scale: 1 });
    const render = () => {
      scene.layer.performRender();
      scheduler.performUpdate();
    };
    render();
    type Batch = { pathRecords?: object; ranges: { revision: number; ownerRanges(id: string): unknown[] } };
    const internal = backend as unknown as {
      frameUploadWrites: number;
      allBatches(): Iterable<Batch>;
      uploadPathRecords(batch: Batch, records: object, companion: object): unknown;
    };
    const batch = [...internal.allBatches()].find((b) => b.pathRecords && b.ranges.ownerRanges("sparse-1").length);
    if (!batch) throw new Error("Missing resident lines");
    const upload = internal.uploadPathRecords;
    const initialRevision = batch.ranges.revision;
    const unpackBuffer = gl.createBuffer();
    const before = [gl.UNPACK_ALIGNMENT, gl.UNPACK_ROW_LENGTH, gl.UNPACK_IMAGE_HEIGHT];
    const unusual = [8, 71, 19];
    let restored: number[] = [];
    let bufferCleared = false;
    let regions = 0;
    // Prime immediately before the path write: another batch's texture upload can clear the PBO earlier in the frame.
    internal.uploadPathRecords = function (next, records, companion) {
      if (next !== batch || next.ranges.revision === initialRevision || restored.length)
        return upload.call(this, next, records, companion);
      const previous = before.map((key) => gl.getParameter(key) as number);
      gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER, unpackBuffer);
      before.forEach((key, i) => gl.pixelStorei(key, unusual[i]));
      try {
        const beforeWrites = this.frameUploadWrites;
        const kind = upload.call(this, next, records, companion);
        regions = this.frameUploadWrites - beforeWrites;
        restored = before.map((key) => gl.getParameter(key) as number);
        bufferCleared = gl.getParameter(gl.PIXEL_UNPACK_BUFFER_BINDING) === null;
        return kind;
      } finally {
        before.forEach((key, i) => gl.pixelStorei(key, previous[i]));
        gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER, null);
      }
    };
    try {
      scene.store.update("sparse-1", { primitives: [primitive(1, "#ff0000")] });
      scene.store.update("sparse-30", { primitives: [primitive(30, "#00ff00")] });
      render();
      const frame = cameraService.getCameraState();
      const dpr = gl.drawingBufferWidth / frame.width;
      backend.draw({ ...frame, dpr, time: 0, dimColor: scene.store.getDimColor() });
      const pixels = [1, 15, 30].map((i) => {
        const rgba = new Uint8Array(4);
        gl.readPixels(
          Math.floor((frame.x + 60 * frame.scale) * dpr),
          gl.drawingBufferHeight - 1 - Math.floor((frame.y + (10 + i * 8) * frame.scale) * dpr),
          1,
          1,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          rgba
        );
        return Array.from(rgba);
      });
      return { restored, bufferCleared, regions, error: gl.getError(), pixels };
    } finally {
      internal.uploadPathRecords = upload;
      gl.deleteBuffer(unpackBuffer);
    }
  });
  expect(result).toEqual({
    restored: [8, 71, 19],
    bufferCleared: true,
    regions: 2,
    error: 0,
    pixels: [
      [255, 0, 0, 255],
      [0, 0, 255, 255],
      [0, 255, 0, 255],
    ],
  });
});

test("growing a resident path texture preserves every line and uploads only the local edit", async ({ page }) => {
  await initialize(page);
  const result = await page.evaluate(() => {
    const { scene, cameraService, scheduler } = window.graph;
    const backend = scene.layer.getBackend();
    const gl = backend?.canvas.getContext("webgl2");
    if (!backend || !gl) throw new Error("Missing WebGL backend");
    const canCopy = gl.getSupportedExtensions()?.includes("EXT_color_buffer_float");
    const perRow = Math.floor(Math.min(4096, gl.getParameter(gl.MAX_TEXTURE_SIZE)) / 10);
    cameraService.set({ x: 0, y: 0, scale: 1 });
    const render = () => {
      scene.layer.performRender();
      scheduler.performUpdate();
      backend.draw({ ...cameraService.getCameraState(), dpr: 2, time: 0, dimColor: scene.store.getDimColor() });
    };
    const add = (id: string, pieces: number, top: number) => {
      const segments = Array.from({ length: pieces }, (_, i) => {
        const x = 20 + (i % perRow);
        const y = top + Math.floor(i / perRow) * 8;
        return window.GraphModule.lineSegment({ x, y }, { x: x + 1, y });
      });
      scene.store.add({
        id,
        entityType: "connection",
        x: 0,
        y: 0,
        zIndex: 0,
        bounds: { minX: 19, minY: top - 2, maxX: 21 + perRow, maxY: top + Math.ceil(pieces / perRow) * 8 + 2 },
        primitives: [
          { kind: "path", segments: Float32Array.from(segments.flat()), stroke: { color: "#3456ab", width: 3 } },
        ],
      });
      render();
    };
    const initial = perRow * 4;
    const before = backend.stats.uploadBytes;
    add("resident", initial, 10);
    const initialBytes = backend.stats.uploadBytes - before;
    type Batch = {
      pathRecords?: { texture: { height: number } };
      ranges: { data: Float32Array; floats: number; ownerRanges(id: string): unknown[] };
    };
    const internal = backend as unknown as { allBatches(): Iterable<Batch> };
    const batch = [...internal.allBatches()].find((b) => b.pathRecords && b.ranges.ownerRanges("resident").length);
    if (!batch?.pathRecords) throw new Error("Missing resident path texture");
    const height = batch.pathRecords.texture.height;
    const slots = height * perRow;
    const beforeFill = backend.stats.uploadBytes;
    add("fill-reserve", slots - initial, 100);
    const fillBytes = backend.stats.uploadBytes - beforeFill;
    const beforeImage = backend.canvas.toDataURL();
    // Cross the CPU allocation and the GPU texture boundary in the same edit.
    const cpuSlots = batch.ranges.data.buffer.byteLength / (batch.ranges.floats * Float32Array.BYTES_PER_ELEMENT);
    const beforeEdit = backend.stats.uploadBytes;
    add("new-line", cpuSlots - slots + 1, 200);
    const editBytes = backend.stats.uploadBytes - beforeEdit;
    const grew = batch.pathRecords.texture.height > height;
    const image = backend.canvas.toDataURL();
    backend.replay(scene.store);
    render();
    return {
      initialBytes,
      fillBytes,
      editBytes,
      canCopy,
      grew,
      changed: image !== beforeImage,
      sameAsReplay: image === backend.canvas.toDataURL(),
      error: gl.getError(),
    };
  });
  expect(result).toMatchObject({ grew: true, changed: true, sameAsReplay: true, error: 0 });
  expect(result.fillBytes).toBeLessThan(result.initialBytes / 2);
  expect(result.editBytes).toBeGreaterThan(0);
  if (result.canCopy) expect(result.editBytes).toBeLessThan(result.initialBytes / 2);
});

/** Compare the same backend, camera, clock and AA policy; only the private overview selector is bypassed. */
async function compare(page: Page, scale: number, dpr: number, x = 0.3125, y = 70.1875) {
  return page.evaluate(
    ({ scale, dpr, x, y }) => {
      const { scene, scheduler, cameraService } = window.graph;
      scene.layer.performRender();
      scheduler.performUpdate();
      const backend = scene.layer.getBackend();
      if (!backend) throw new Error("Missing WebGL backend");
      const probe = backend as typeof backend & {
        useOverviewCurves(...args: unknown[]): boolean;
        uploadPathRecords(...args: unknown[]): string;
      };
      if (typeof probe.useOverviewCurves !== "function") throw new Error("The overview selector is missing");
      const gl = backend.canvas.getContext("webgl2");
      if (!gl) throw new Error("Missing WebGL context");
      const frame = {
        ...cameraService.getCameraState(),
        scale,
        dpr,
        x,
        y,
        time: 1.234,
        dimColor: scene.store.getDimColor(),
      };
      const select = probe.useOverviewCurves;
      const upload = probe.uploadPathRecords;
      let sourceWrites = 0;
      probe.uploadPathRecords = function (...args) {
        const result = Reflect.apply(upload, this, args);
        if (result !== "none") sourceWrites++;
        return result;
      };
      const pixels = () => {
        const data = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
        gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, data);
        return data;
      };
      const encodes = backend.stats.encodes;
      try {
        probe.useOverviewCurves = () => false;
        backend.draw(frame);
        const detailed = pixels();
        const detailedImage = backend.canvas.toDataURL();
        const detailedInstances = backend.stats.instances;
        probe.useOverviewCurves = select;
        backend.draw(frame);
        const overview = pixels();
        const overviewImage = backend.canvas.toDataURL();
        let differentPixels = 0;
        let maximumChannelDelta = 0;
        let alphaError = 0;
        let colorError = 0;
        let referenceAlpha = 0;
        let overviewAlpha = 0;
        let escapedPixels = 0;
        const width = gl.drawingBufferWidth;
        const height = gl.drawingBufferHeight;
        const difference = new Uint8ClampedArray(detailed.length);
        const supported = (data: Uint8Array, at: number) => {
          const px = (at / 4) % width;
          const py = Math.floor(at / 4 / width);
          for (let dy = -1; dy <= 1; dy++)
            for (let dx = -1; dx <= 1; dx++) {
              if (
                px + dx >= 0 &&
                px + dx < width &&
                py + dy >= 0 &&
                py + dy < height &&
                data[((py + dy) * width + px + dx) * 4 + 3] > 0
              )
                return true;
            }
          return false;
        };
        for (let i = 0; i < detailed.length; i += 4) {
          let changed = false;
          for (let channel = 0; channel < 4; channel++) {
            const delta = Math.abs(detailed[i + channel] - overview[i + channel]);
            maximumChannelDelta = Math.max(maximumChannelDelta, delta);
            changed ||= delta !== 0;
            if (channel < 3) {
              difference[i + channel] = Math.min(255, delta * 4);
              colorError += delta;
            }
          }
          difference[i + 3] = 255;
          differentPixels += Number(changed);
          referenceAlpha += detailed[i + 3];
          overviewAlpha += overview[i + 3];
          alphaError += Math.abs(detailed[i + 3] - overview[i + 3]);
          if ((detailed[i + 3] > 0 && !supported(overview, i)) || (overview[i + 3] > 0 && !supported(detailed, i)))
            escapedPixels++;
        }
        const image = document.createElement("canvas");
        image.width = width;
        image.height = height;
        const context = image.getContext("2d");
        if (!context) throw new Error("Missing image context");
        // readPixels starts at the bottom; flip only the diagnostic image to match the two canvas captures.
        const flipped = new Uint8ClampedArray(difference.length);
        for (let row = 0; row < height; row++)
          flipped.set(difference.subarray(row * width * 4, (row + 1) * width * 4), (height - row - 1) * width * 4);
        context.putImageData(new ImageData(flipped, width, height), 0, 0);
        return {
          scale,
          dpr,
          differentPixels,
          maximumChannelDelta,
          escapedPixels,
          relativeAlphaError: alphaError / Math.max(1, referenceAlpha),
          relativeColorError: colorError / Math.max(1, referenceAlpha * 3),
          relativeAlphaMassChange: Math.abs(overviewAlpha - referenceAlpha) / Math.max(1, referenceAlpha),
          referenceAlpha,
          detailedInstances,
          overviewInstances: backend.stats.instances,
          encodes: backend.stats.encodes - encodes,
          sourceWrites,
          error: gl.getError(),
          detailedImage,
          overviewImage,
          differenceImage: image.toDataURL(),
        };
      } finally {
        probe.useOverviewCurves = select;
        probe.uploadPathRecords = upload;
      }
    },
    { scale, dpr, x, y }
  );
}

async function attachComparison(testInfo: TestInfo, name: string, result: Awaited<ReturnType<typeof compare>>) {
  const { detailedImage, overviewImage, differenceImage, ...metrics } = result;
  await testInfo.attach(`${name}-metrics`, { body: JSON.stringify(metrics, null, 2), contentType: "application/json" });
  for (const [kind, image] of Object.entries({
    detailed: detailedImage,
    overview: overviewImage,
    difference: differenceImage,
  })) {
    await testInfo.attach(`${name}-${kind}`, {
      body: Buffer.from(image.split(",")[1], "base64"),
      contentType: "image/png",
    });
  }
}

test("overview preserves solid and translucent strips through fractional pan, DPR and detailed roundtrips", async ({
  page,
}, testInfo) => {
  const graph = await initialize(page);
  await page.evaluate(() => {
    const { scene, cameraService } = window.graph;
    cameraService.set({ x: 0, y: 0, scale: 0.02 });
    for (let i = 0; i < 4; i++) {
      const reverse = i % 2 === 1;
      scene.store.add({
        id: `overview-${i}`,
        entityType: "connection",
        x: 0,
        y: 0,
        zIndex: i,
        bounds: { minX: 900, minY: 900, maxX: 22100, maxY: 5100 },
        primitives: [
          {
            kind: "path",
            part: "line",
            segments: window.GraphModule.bezierGeometry({
              source: { x: 1000, y: reverse ? 5000 : 1000 },
              target: { x: 22000, y: reverse ? 1000 : 5000 },
              useBezier: true,
              bezierDirection: "horizontal",
              points: [],
              connection: { id: `overview-${i}` },
            })!.segments,
            stroke: {
              color:
                i < 2 ? (reverse ? "#2090e0" : "#e05020") : reverse ? "rgba(20,220,80,.55)" : "rgba(160,40,220,.55)",
              width: 20,
            },
          },
        ],
      });
    }
  });
  await graph.waitForFrames(3);
  const cameraOnly = await page.evaluate(async () => {
    const { scene, cameraService, scheduler } = window.graph;
    const backend = scene.layer.getBackend()!;
    const probe = backend as typeof backend & { uploadPathRecords(...args: unknown[]): string };
    const upload = probe.uploadPathRecords;
    const encodes = backend.stats.encodes;
    let writes = 0;
    probe.uploadPathRecords = function (...args) {
      const result = Reflect.apply(upload, this, args);
      if (result !== "none") writes++;
      return result;
    };
    try {
      for (const scale of [0.02, 0.04, 0.08, 0.02]) {
        cameraService.set({ x: 0.3125, y: 70.1875, scale });
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        scene.layer.performRender();
        scheduler.performUpdate();
      }
      return { encodes: backend.stats.encodes - encodes, writes };
    } finally {
      probe.uploadPathRecords = upload;
    }
  });
  expect(cameraOnly).toEqual({ encodes: 0, writes: 0 });
  let reduced = 0;
  for (const dpr of [1, 1.5, 2]) {
    for (const deviceScale of [0.04, 0.063, 0.14, 0.04]) {
      const result = await compare(page, deviceScale / dpr, dpr);
      expect(result.error).toBe(0);
      expect(result.referenceAlpha).toBeGreaterThan(1000);
      expect(result.encodes).toBe(0);
      expect(result.sourceWrites).toBe(0);
      if (deviceScale >= 0.063) {
        expect(result.differentPixels, "detailed geometry must remain byte exact").toBe(0);
        expect(result.overviewInstances).toBe(result.detailedInstances);
      } else {
        reduced += Number(result.overviewInstances < result.detailedInstances);
        // The analytic certificate bounds the strip; these independent raster checks catch holes and lost coverage.
        expect(result.escapedPixels, "no coverage may escape the adjacent physical pixel").toBe(0);
        expect(result.relativeAlphaMassChange, "integrated stroke coverage").toBeLessThan(0.01);
        expect(result.relativeAlphaError, "edge coverage error, normalized by painted pixels").toBeLessThan(0.15);
        expect(result.relativeColorError, "premultiplied color and overlap order").toBeLessThan(0.05);
      }
      if (deviceScale === 0.04) await attachComparison(testInfo, `dpr-${dpr}-overview`, result);
    }
  }
  expect(reduced, "the ordinary opaque and translucent fixture must exercise reduced submissions").toBeGreaterThan(0);
  await graph.evaluate((graph) => {
    graph.scene.store.delete("overview-0");
    graph.scene.store.delete("overview-1");
  });
  await graph.waitForFrames(3);
  const translucent = await compare(page, 0.02, 2);
  await attachComparison(testInfo, "translucent-crossing", translucent);
  expect(translucent.overviewInstances, "translucent ordinary paths must actually use overview").toBeLessThan(
    translucent.detailedInstances
  );
  expect(translucent.relativeColorError).toBeLessThan(0.05);
  expect(translucent.relativeAlphaMassChange).toBeLessThan(0.01);
});

test("unsafe widths, dashes, halo effects, cusps and translated origins retain exact detailed pixels", async ({
  page,
}, testInfo) => {
  const graph = await initialize(page);
  const variants = ["dash", "pixel-width", "wide", "halo", "cusp", "zero-tangent", "translated"];
  for (const variant of variants) {
    await page.evaluate((kind) => {
      const { scene, cameraService } = window.graph;
      scene.store.delete("unsafe");
      cameraService.set({ x: 0, y: 0, scale: 0.02 });
      const halo = window.GraphModule.defineSceneEffect({
        kind: "path",
        extraWidth: 6,
        fragment: "vec4 effect(PathFragment f, vec4 color) { return color; }",
      });
      scene.store.add({
        id: "unsafe",
        entityType: "connection",
        x: kind === "translated" ? 100 : 0,
        y: 0,
        zIndex: 0,
        bounds: { minX: -100, minY: -100, maxX: 22100, maxY: 5100 },
        primitives: [
          {
            kind: "path",
            part: "line",
            segments:
              kind === "cusp" || kind === "zero-tangent"
                ? new Float32Array(
                    kind === "cusp"
                      ? [1000, 1000, 22000, 5000, -1000, 5000, 1000, 1000]
                      : [1000, 1000, 1000, 1000, 15000, 3000, 22000, 5000]
                  )
                : window.GraphModule.bezierGeometry({
                    source: { x: 1000, y: 1000 },
                    target: { x: 22000, y: 5000 },
                    useBezier: true,
                    bezierDirection: "horizontal",
                    points: [],
                    connection: { id: "unsafe" },
                  })!.segments,
            stroke: {
              color: "rgba(220,40,60,.7)",
              width: kind === "pixel-width" ? { px: 8 } : kind === "wide" ? 5000 : 20,
              dash: kind === "dash" ? [1000, 800] : undefined,
            },
            effect: kind === "halo" ? halo.use([]) : undefined,
          },
        ],
      });
    }, variant);
    await graph.waitForFrames(3);
    const result = await compare(page, 0.02, 2);
    await attachComparison(testInfo, variant, result);
    expect(result.error).toBe(0);
    expect(result.referenceAlpha).toBeGreaterThan(1000);
    expect(result.differentPixels, variant).toBe(0);
    expect(result.overviewInstances, variant).toBe(result.detailedInstances);
    expect(result.encodes).toBe(0);
    expect(result.sourceWrites).toBe(0);
  }
});

test("reconnecting an opaque Bézier preserves neighbors in both curve buffers and restores the same pixels", async ({
  page,
}) => {
  const graph = await initialize(page);
  const result = await page.evaluate(async () => {
    const { graph, GraphModule } = window;
    const { scene, connections, cameraService, scheduler } = graph;
    graph.updateSettings({ useBezierConnections: true, showConnectionArrows: true, showConnectionLabels: false });
    cameraService.set({ x: 0, y: 0, scale: 0.04 });
    connections.observePort("source", scene).updatePort({ x: 100, y: 100, lookup: false });
    connections.observePort("target", scene).updatePort({ x: 600, y: 350, lookup: false });
    connections.observePort("alternate", scene).updatePort({ x: 2000, y: 600, lookup: false });
    connections.observePort("near", scene).updatePort({ x: 200, y: 140, lookup: false });
    const ids = ["first", "second"];
    for (const id of ids) {
      graph.api.addConnection({
        id,
        sourcePortId: "source",
        targetPortId: "target",
        styles: { background: id === "first" ? "#d04020" : "#2050c0" },
      });
    }

    type Ranges = { ownerRanges(id: string): readonly { offset: number; count: number }[] };
    type Source = { chords: number; group: { curves: { ranges: Ranges }; coarseCurves: { ranges: Ranges } } };
    const backend = scene.layer.getBackend()!;
    const probe = backend as typeof backend & {
      hasMixedVertexWork(opaque: readonly unknown[], translucent: readonly unknown[], connectionOnly: boolean): boolean;
      buildMixedPlane(...args: unknown[]): unknown;
      mixedPlan?: { plan: { spans: readonly { first: number; count: number }[] } };
      beginMixedScene(frame: unknown, prepared: { plan: { sources: Source[] } }, native: unknown): unknown;
    };
    const work = { commands: 0, inspected: 0, accepted: 0 };
    const cutoff = probe.hasMixedVertexWork.bind(probe);
    const track = (draws: readonly unknown[]) =>
      new Proxy(draws, {
        get(commands, key, receiver) {
          if (typeof key === "string" && /^\d+$/.test(key)) work.inspected++;
          return Reflect.get(commands, key, receiver);
        },
      });
    probe.hasMixedVertexWork = (opaque, translucent, connectionOnly) => {
      if (connectionOnly) {
        work.commands += opaque.length + translucent.length;
        if (cutoff(track(opaque), track(translucent), true)) work.accepted++;
      }
      // Force the mixed pass for the pixel comparison after exercising its real connection cutoff.
      return true;
    };
    let sources: Source[] = [];
    const begin = probe.beginMixedScene;
    probe.beginMixedScene = function (...args) {
      sources = args[1].plan.sources;
      return begin.apply(this, args);
    };
    const snapshot = async () => {
      await new Promise(requestAnimationFrame);
      scene.layer.performRender();
      scheduler.performUpdate();
      sources = [];
      backend.draw({ ...cameraService.getCameraState(), dpr: 2, time: 0, dimColor: scene.store.getDimColor() });
      const adaptive = sources.find((source) => source.chords === 8);
      const ordinary = sources.find((source) => source.chords === 16);
      if (!adaptive || !ordinary) throw new Error("Both ordinary and eight-chord curves must reach the mixed pass");
      const read = (ranges: Ranges) =>
        ids.map((id) => {
          const [range] = ranges.ownerRanges(GraphModule.entityKey("connection", id));
          return { offset: range?.offset ?? -1, count: range?.count ?? 0 };
        });
      return { ordinary: read(ordinary.group.curves.ranges), adaptive: read(adaptive.group.coarseCurves.ranges) };
    };
    const before = await snapshot();
    if (!sources.some((source) => source.chords === 1)) throw new Error("Missing the straight arrow source");
    const originalImage = backend.canvas.toDataURL();
    const edited = before.ordinary[0].offset < before.ordinary[1].offset ? 0 : 1;
    graph.api.updateConnection(ids[edited], { targetPortId: "alternate" });
    const after = await snapshot();
    const changedImage = backend.canvas.toDataURL() !== originalImage;
    graph.api.updateConnection(ids[edited], { targetPortId: "target" });
    await snapshot();
    const restoredImage = backend.canvas.toDataURL() === originalImage;
    // A replay recreates resident ranges. Exercise removal and insertion in that same renderer.
    backend.replay(scene.store);
    await snapshot();
    const build = probe.buildMixedPlane;
    let builds = 0;
    probe.buildMixedPlane = function (...args) {
      builds++;
      return build.apply(this, args);
    };
    const order = () => JSON.stringify(probe.mixedPlan?.plan.spans);
    const membership = [];
    for (const targetPortId of ["near", "target"]) {
      builds = 0;
      graph.api.updateConnection(ids[edited], { targetPortId });
      const ranges = await snapshot();
      const local = builds === 0;
      const image = backend.canvas.toDataURL();
      const localOrder = order();
      probe.mixedPlan = undefined;
      await snapshot();
      membership.push({
        local,
        hasCoarse: ranges.adaptive[edited].count > 0,
        sameOrder: builds > 0 && localOrder !== undefined && localOrder === order(),
        sameImage: image === backend.canvas.toDataURL(),
      });
    }
    for (const port of ["source", "target", "alternate", "near"]) connections.unobservePort(port, scene);
    return { before, after, edited, neighbor: 1 - edited, changedImage, restoredImage, membership, work };
  });

  const { before, after, edited, neighbor, changedImage, restoredImage, membership, work } = result;
  expect(work.commands).toBeGreaterThan(0);
  expect(work.accepted, "two resident connections stay below the mixed-pass cutoff").toBe(0);
  expect(work.inspected, "two connections need no scan of visible commands").toBe(0);
  for (const batch of ["ordinary", "adaptive"] as const) {
    expect(before[batch][edited].offset).toBeLessThan(before[batch][neighbor].offset);
    expect(after[batch][edited].count).toBeGreaterThan(before[batch][edited].count);
    expect(after[batch][neighbor]).toEqual(before[batch][neighbor]);
  }
  expect(changedImage).toBe(true);
  expect(restoredImage).toBe(true);
  expect(membership).toEqual([
    { local: true, hasCoarse: false, sameOrder: true, sameImage: true },
    { local: true, hasCoarse: true, sameOrder: true, sameImage: true },
  ]);
});

test("real connections refresh after move, add and delete and restore the same overview image", async ({
  page,
}, testInfo) => {
  const graph = await initialize(page);
  await graph.setEntities({
    blocks: [
      { id: "source", is: "Block", name: "", x: 1000, y: 1000, width: 80, height: 40, anchors: [] },
      { id: "target", is: "Block", name: "", x: 22000, y: 5000, width: 80, height: 40, anchors: [] },
    ],
    connections: [{ id: "edge", sourceBlockId: "source", targetBlockId: "target", styles: { background: "#e04020" } }],
  });
  await graph.evaluate((graph) => {
    graph.updateSettings({ useBezierConnections: true, showConnectionArrows: false, showConnectionLabels: false });
    graph.cameraService.set({ x: 0, y: 0, scale: 0.02 });
  });
  await graph.waitForFrames(3);
  const initial = await compare(page, 0.02, 2);
  expect(initial.overviewInstances, "the built-in connection must start with active overview geometry").toBeLessThan(
    initial.detailedInstances
  );
  for (let cycle = 0; cycle < 3; cycle++) {
    await graph.evaluate((graph) => {
      graph.blocks.getBlockState("target")!.updateXY(18000, 9000);
      graph.connections.addConnection({
        id: "added",
        sourceBlockId: "source",
        targetBlockId: "target",
        styles: { background: "#2080e0" },
      });
    });
    await graph.waitForFrames(3);
    const moved = await compare(page, 0.02, 2);
    expect(moved.overviewImage, "moving a connected target must repaint the route").not.toBe(initial.overviewImage);
    expect(moved.escapedPixels).toBe(0);
    expect(moved.relativeAlphaMassChange).toBeLessThan(0.01);
    await graph.evaluate((graph) => {
      graph.connections.deleteConnections([graph.connections.getConnectionState("added")!]);
      graph.blocks.getBlockState("target")!.updateXY(22000, 5000);
    });
    await graph.waitForFrames(3);
    const restored = await compare(page, 0.02, 2);
    expect(restored.overviewImage, `restored image after cycle ${cycle}`).toBe(initial.overviewImage);
    expect(restored.overviewInstances).toBe(initial.overviewInstances);
    expect(restored.error).toBe(0);
    expect(restored.encodes).toBe(0);
    expect(restored.sourceWrites).toBe(0);
  }
  for (const kind of ["pixel-width", "wide", "halo"] as const) {
    await page.evaluate((kind) => {
      const { graph, GraphModule } = window;
      const win = window as unknown as { removeOverviewStyle?: () => void };
      win.removeOverviewStyle?.();
      const halo = GraphModule.defineSceneEffect({
        kind: "path",
        extraWidth: 6,
        fragment: "vec4 effect(PathFragment f, vec4 color) { return color; }",
      });
      const tagged = GraphModule.defineTag(`overview-${kind}`);
      graph.scene.tags.add(tagged, { connection: ["edge"] });
      const remove = graph.scene.styles.add([
        {
          target: GraphModule.BlockConnection,
          tags: [tagged],
          style: {
            parts: {
              line:
                kind === "halo"
                  ? { effect: halo.use([]) }
                  : { width: kind === "wide" ? 5000 : { px: 8, maxWorld: 2000 } },
            },
          },
        },
      ]);
      win.removeOverviewStyle = () => {
        remove();
        graph.scene.tags.delete(tagged, { connection: ["edge"] });
      };
    }, kind);
    await graph.waitForFrames(3);
    const styled = await compare(page, 0.02, 2);
    await attachComparison(testInfo, `computed-${kind}`, styled);
    const style = await page.evaluate(() => {
      const view = window.graph.connections.getConnectionState("edge")?.getViewComponent();
      const key = view instanceof window.GraphModule.BlockConnection ? view.getSceneKey() : undefined;
      const element = key && window.graph.scene.store.get(key.elementId);
      return element && { id: element.id, style: window.graph.scene.store.getStyles()[element.styleId] };
    });
    await testInfo.attach("computed-style", { body: JSON.stringify(style), contentType: "application/json" });
    expect(styled.overviewInstances, "computed style source eligibility").toBe(styled.detailedInstances);
    expect(styled.differentPixels, `computed ${kind} style must revoke overview eligibility`).toBe(0);
    expect(styled.error).toBe(0);
  }
  await page.evaluate(() => (window as unknown as { removeOverviewStyle?: () => void }).removeOverviewStyle?.());
  await graph.waitForFrames(3);
  const styleRestored = await compare(page, 0.02, 2);
  expect(styleRestored.overviewImage, "removing style overrides must restore the original representation").toBe(
    initial.overviewImage
  );
  await page.evaluate(() => {
    const { graph, GraphModule } = window;
    graph.scene.styles.add([
      {
        target: GraphModule.BlockConnection,
        style: { parts: { line: { effect: GraphModule.pulse.use({ period: 2 }, { minScale: 0.025 }) } } },
      },
    ]);
  });
  await graph.waitForFrames(3);
  const inactive = await compare(page, 0.02, 2);
  expect(inactive.overviewInstances, "inactive stock effect may use certified ordinary geometry").toBeLessThan(
    inactive.detailedInstances
  );
  const active = await compare(page, 0.027, 2);
  expect(active.overviewInstances, "active effect must keep canonical records inside the overview camera band").toBe(
    active.detailedInstances
  );
  expect(active.differentPixels).toBe(0);
  const inactiveAgain = await compare(page, 0.02, 2);
  expect(inactiveAgain.overviewImage).toBe(inactive.overviewImage);
  expect([active.sourceWrites, inactiveAgain.sourceWrites, active.encodes, inactiveAgain.encodes]).toEqual([
    0, 0, 0, 0,
  ]);
});
