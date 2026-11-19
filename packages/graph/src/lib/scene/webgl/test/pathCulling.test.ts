import { INSTANCE_FLOATS } from "../../../../components/canvas/connections/webgl/encode";
import type { TSceneFrame } from "../backendTypes";
import { PATH_ELEMENT_FLOATS } from "../encodePaths";
import { PathCulling } from "../pathCulling";
import { ElementTable } from "../tables";

const frame: TSceneFrame = { width: 100, height: 100, x: 0, y: 0, scale: 1, dpr: 2, time: 0, dimColor: "" };
const CHUNK = 128;

function paths(xs: number[]): { paths: Float32Array; elements: Float32Array; table: ElementTable } {
  const data = new Float32Array(xs.length * INSTANCE_FLOATS);
  const elements = new Float32Array(xs.length * PATH_ELEMENT_FLOATS);
  xs.forEach((x, index) => {
    data.set([x, 20, x + 5, 20, x + 5, 30, x + 10, 30], index * INSTANCE_FLOATS);
    data[index * INSTANCE_FLOATS + 12] = 2;
    elements.set([0, 0, 0, 0, 0, 1e9, 7, 1e9], index * PATH_ELEMENT_FLOATS);
  });
  const table = new ElementTable();
  table.indexOf("e0");
  table.indexOf("e1");
  return { paths: data, elements, table };
}

describe("PathCulling", () => {
  it("keeps equivalent level hulls and reselects when an edited mask or an all-level frame changes visibility", () => {
    const data = paths(Array<number>(CHUNK * 3).fill(10));
    for (let i = 0; i < CHUNK * 3; i++) data.elements[i * PATH_ELEMENT_FLOATS + 6] = [6, 1, 7][Math.floor(i / CHUNK)];
    const culling = new PathCulling();
    const detailed = { ...frame, level: "detailed" as const };
    const schematic = { ...frame, level: "schematic" as const };
    culling.update(data.paths, data.elements, data.table, detailed);
    const select = jest.spyOn(culling as unknown as { selectHulls(scale: number): void }, "selectHulls");
    const visible = (at: TSceneFrame) => culling.ranges(0, CHUNK * 3, at, 0);
    const near = [
      { first: 0, count: CHUNK },
      { first: CHUNK * 2, count: CHUNK },
    ];
    expect(visible(detailed)).toEqual(near);
    culling.update(data.paths, data.elements, data.table, schematic);
    expect(visible(schematic)).toEqual(near);
    expect(select).not.toHaveBeenCalled();

    // HTML handover changes only the table's hidden key, not the conservative path hulls.
    data.table.write("e0", 0, 0, 0, true, 0);
    culling.update(data.paths, data.elements, data.table, detailed);
    expect(visible(detailed)).toEqual(near);
    expect(select).not.toHaveBeenCalled();
    data.table.write("e0", 0, 0, 0, false, 0);

    culling.update(data.paths, data.elements, data.table, frame);
    expect(visible(frame)).toEqual([{ first: 0, count: CHUNK * 3 }]);
    expect(select).toHaveBeenCalledTimes(1);
    culling.update(data.paths, data.elements, data.table, schematic);
    expect(visible(schematic)).toEqual(near);
    expect(select).toHaveBeenCalledTimes(2);

    const tail = data.elements.subarray(CHUNK * 2 * PATH_ELEMENT_FLOATS);
    for (let at = 6; at < tail.length; at += PATH_ELEMENT_FLOATS) tail[at] = 2;
    culling.invalidate(
      { kind: "range", spans: [{ data: tail, byteOffset: tail.byteOffset }], bytes: tail.byteLength },
      PATH_ELEMENT_FLOATS
    );
    culling.update(data.paths, data.elements, data.table, schematic);
    expect(visible(schematic)).toEqual(near);
    expect(select).toHaveBeenCalledTimes(2);
    culling.update(data.paths, data.elements, data.table, detailed);
    expect(visible(detailed)).toEqual([{ first: 0, count: CHUNK }]);
    expect(select).toHaveBeenCalledTimes(3);
  });

  it("retains a closed corner that reaches the viewport past its centre line and fringe", () => {
    const data = paths([108]);
    const visible = () => {
      const culling = new PathCulling();
      culling.update(data.paths, data.elements, data.table, frame);
      return culling.ranges(0, 1, frame, 0);
    };
    expect(visible()).toEqual([]);
    data.paths.set([-1, 5, 0], 13);
    expect(visible()).toEqual([{ first: 0, count: 1 }]);
  });

  it("retains physical chunks across camera changes and replaces only edited chunks", () => {
    const data = paths(Array<number>(CHUNK * 2).fill(10));
    const culling = new PathCulling();
    const visit = jest.fn();
    culling.update(data.paths, data.elements, data.table, frame);
    culling.visitChunks(CHUNK - 2, 5, visit);
    const [left, right] = visit.mock.calls.map(([chunk]) => chunk);
    expect(visit.mock.calls).toEqual([
      [left, CHUNK - 2, CHUNK],
      [right, CHUNK, CHUNK + 3],
    ]);
    const zoom = { ...frame, scale: 2 };
    culling.update(data.paths, data.elements, data.table, zoom);
    culling.visitChunks(CHUNK - 2, 5, visit);
    expect(visit.mock.calls[2][0]).toBe(left);
    expect(visit.mock.calls[3][0]).toBe(right);
    const at = CHUNK * INSTANCE_FLOATS;
    const edited = data.paths.subarray(at, at + 1);
    edited[0] += 1;
    culling.invalidate(
      { kind: "range", spans: [{ data: edited, byteOffset: edited.byteOffset }], bytes: 4 },
      INSTANCE_FLOATS
    );
    culling.update(data.paths, data.elements, data.table, zoom);
    culling.visitChunks(CHUNK - 2, 5, visit);
    expect(visit.mock.calls[4][0]).toBe(left);
    expect(visit.mock.calls[5][0]).not.toBe(right);
  });

  it("reselects only edited hulls until a new visibility boundary is crossed", () => {
    const data = paths(Array<number>(CHUNK * 3).fill(10));
    const culling = new PathCulling();
    culling.update(data.paths, data.elements, data.table, frame);
    const full = jest.spyOn(culling as unknown as { selectHulls(scale: number): void }, "selectHulls");
    const tail = data.elements.subarray(CHUNK * 2 * PATH_ELEMENT_FLOATS);
    for (let at = 0; at < tail.length; at += PATH_ELEMENT_FLOATS) {
      tail[at] = 1;
      tail[at + 4] = 1.5;
    }
    data.table.write("e1", 1, 0, 0, false, 0);
    culling.invalidate(
      { kind: "range", spans: [{ data: tail, byteOffset: tail.byteOffset }], bytes: tail.byteLength },
      PATH_ELEMENT_FLOATS
    );
    culling.update(data.paths, data.elements, data.table, frame);
    expect(full).not.toHaveBeenCalled();
    expect(culling.untranslated).toBe(true);
    expect(culling.preparedRanges(frame, 0)).toEqual([{ first: 0, count: CHUNK * 2 }]);
    const zoom = { ...frame, scale: 1.5 };
    culling.update(data.paths, data.elements, data.table, zoom);
    expect(full).toHaveBeenCalledTimes(1);
    expect(culling.untranslated).toBe(false);
    expect(culling.preparedRanges(zoom, 0)).toEqual([{ first: 0, count: CHUNK * 3 }]);
    culling.update(
      data.paths.subarray(0, CHUNK * 2 * INSTANCE_FLOATS),
      data.elements.subarray(0, CHUNK * 2 * PATH_ELEMENT_FLOATS),
      data.table,
      zoom
    );
    expect(culling.untranslated).toBe(true);
    expect(full).toHaveBeenCalledTimes(1);
    expect(culling.preparedRanges(zoom, 0)).toEqual([{ first: 0, count: CHUNK * 2 }]);
  });

  it("rebuilds only changed suffix chunks on growth and shrink and forgets removed owners", () => {
    const data = paths(Array.from({ length: CHUNK * 4 }, () => 0));
    const culling = new PathCulling();
    let count = CHUNK * 2 + 7;
    const sync = (): void =>
      culling.update(
        data.paths.subarray(0, count * INSTANCE_FLOATS),
        data.elements.subarray(0, count * PATH_ELEMENT_FLOATS),
        data.table,
        frame
      );
    sync();
    const write = jest.spyOn(culling as unknown as { writeChunk: (...args: unknown[]) => void }, "writeChunk");
    count += 5;
    sync();
    expect(write.mock.calls.map((call) => call[0])).toEqual([2]);
    write.mockClear();
    count = CHUNK * 3 + 5;
    for (let i = CHUNK * 3; i < count; i++) data.elements[i * PATH_ELEMENT_FLOATS] = 1;
    sync();
    expect(write.mock.calls.map((call) => call[0])).toEqual([2, 3]);
    write.mockClear();
    count = CHUNK + 4;
    sync();
    expect(write.mock.calls.map((call) => call[0])).toEqual([1]);
    write.mockClear();
    data.table.write("e1", 200, 0, 0, false, 0);
    sync();
    expect(write).not.toHaveBeenCalled();
    expect(culling.ranges(0, count, frame, 0)).toEqual([{ first: 0, count }]);
    count = CHUNK;
    sync();
    expect(write).not.toHaveBeenCalled();
    count = 0;
    sync();
    data.table.write("e0", 200, 0, 0, false, 0);
    sync();
    expect(write).not.toHaveBeenCalled();
    expect(culling.ranges(0, 0, frame, 0)).toEqual([]);
  });

  it("skips offscreen chunks and merges adjacent survivors within the supplied draw range", () => {
    const data = paths(Array.from({ length: CHUNK * 4 }, (_, i) => (i < CHUNK ? 500 : 10)));
    const culling = new PathCulling();
    culling.update(data.paths, data.elements, data.table, frame);
    expect(culling.ranges(0, CHUNK * 4, frame, 0)).toEqual([{ first: CHUNK, count: CHUNK * 3 }]);
    expect(culling.ranges(CHUNK / 2, CHUNK * 2, frame, 0)).toEqual([{ first: CHUNK, count: CHUNK * 1.5 }]);
    expect(culling.ranges(CHUNK * 2, CHUNK / 2, frame, 0)).toEqual([{ first: CHUNK * 2, count: CHUNK / 2 }]);
  });

  it("keeps the source template independent of neighboring records and physical chunk placement", () => {
    const data = paths(Array.from({ length: CHUNK * 3 }, () => 10));
    for (let i = 0; i < CHUNK * 3; i++) data.paths[i * INSTANCE_FLOATS + 20] = 8;
    const at = CHUNK * INSTANCE_FLOATS + 20;
    data.paths[at] = 16;
    const culling = new PathCulling();
    culling.update(data.paths, data.elements, data.table, frame);
    expect(culling.ranges(0, CHUNK * 3, frame, 0, { curveChords: 8 })).toEqual([
      { first: 0, count: CHUNK * 3, curveChords: 8 },
    ]);
    data.paths[at] = 8;
    culling.invalidate(
      { kind: "range", spans: [{ data: data.paths.subarray(at, at + 1), byteOffset: at * 4 }], bytes: 4 },
      INSTANCE_FLOATS
    );
    culling.update(data.paths, data.elements, data.table, frame);
    expect(culling.ranges(0, CHUNK * 3, frame, 0, { curveChords: 8 })).toEqual([
      { first: 0, count: CHUNK * 3, curveChords: 8 },
    ]);
  });

  it("keeps separated visible chunks in their original buffer order", () => {
    const data = paths(Array.from({ length: CHUNK * 3 }, (_, i) => (i >= CHUNK && i < CHUNK * 2 ? 500 : 10)));
    const culling = new PathCulling();
    culling.update(data.paths, data.elements, data.table, frame);
    expect(culling.ranges(0, CHUNK * 3, frame, 0)).toEqual([
      { first: 0, count: CHUNK },
      { first: CHUNK * 2, count: CHUNK },
    ]);
    expect(culling.ranges(0, CHUNK * 3, frame, 0, { bridgeGap: CHUNK - 1 })).toHaveLength(2);
    expect(culling.ranges(0, CHUNK * 3, frame, 0, { bridgeGap: CHUNK })).toEqual([{ first: 0, count: CHUNK * 3 }]);
    expect(culling.ranges(0, CHUNK * 2, frame, 0, { bridgeGap: CHUNK })).toEqual([{ first: 0, count: CHUNK }]);
  });

  it("visits merged ranges in the same order, including an invalid camera fallback", () => {
    const data = paths(Array.from({ length: CHUNK * 4 }, (_, i) => (i >= CHUNK && i < CHUNK * 2 ? 500 : 10)));
    data.paths[CHUNK * 3 * INSTANCE_FLOATS + 20] = 16;
    const culling = new PathCulling();
    culling.update(data.paths, data.elements, data.table, frame);
    const visit = jest.fn();
    const options = { bridgeGap: CHUNK, curveChords: 8 } as const;
    culling.forEachRange(CHUNK / 2, CHUNK * 3, frame, 0, visit, options);
    expect(visit.mock.calls).toEqual([[CHUNK / 2, CHUNK * 3, 8]]);
    visit.mockClear();
    culling.forEachRange(0, 2, { ...frame, scale: 0 }, 0, visit, options);
    expect(visit.mock.calls).toEqual([[0, 2, undefined]]);
    visit.mockClear();
    culling.forEachRange(0, 0, frame, 0, visit, options);
    expect(visit).not.toHaveBeenCalled();
  });

  it("retains the physical visibility schedule through stable views and equal hull edits", () => {
    const data = paths(Array.from({ length: CHUNK * 3 }, (_, i) => (i >= CHUNK && i < CHUNK * 2 ? 500 : 10)));
    data.paths[2 * CHUNK * INSTANCE_FLOATS + 20] = 16;
    const culling = new PathCulling();
    culling.update(data.paths, data.elements, data.table, frame);
    const read = jest.spyOn(culling, "forEachRange");
    const first = culling.preparedRanges(frame, 0, 8);
    expect(first).toEqual([
      { first: 0, count: CHUNK, curveChords: 8 },
      { first: 2 * CHUNK, count: CHUNK, curveChords: 8 },
    ]);
    read.mockClear();
    expect(culling.preparedRanges({ ...frame, time: 1 }, 0, 8)).toBe(first);
    expect(read).not.toHaveBeenCalled();
    expect(culling.preparedRanges({ ...frame, x: 1 }, 0, 8)).toBe(first);
    data.paths[0] += 2;
    culling.invalidate({ kind: "full" }, INSTANCE_FLOATS);
    culling.update(data.paths, data.elements, data.table, frame);
    expect(culling.preparedRanges(frame, 0, 8)).toBe(first);
    data.table.write("e0", -450, 0, 0, false, 0);
    culling.update(data.paths, data.elements, data.table, frame);
    expect(culling.preparedRanges(frame, 0, 8)).toEqual([{ first: CHUNK, count: CHUNK, curveChords: 8 }]);
    expect(culling.preparedRanges({ ...frame, scale: NaN }, 0, 8)).toEqual([{ first: 0, count: 3 * CHUNK }]);
    expect(culling.preparedRanges(frame, 0)).toEqual([{ first: CHUNK, count: CHUNK }]);
    expect(culling.preparedRanges(frame, 500)).toEqual([{ first: 0, count: 3 * CHUNK }]);
    culling.update(data.paths.subarray(0, CHUNK * INSTANCE_FLOATS), data.elements, data.table, frame);
    expect(culling.preparedRanges(frame, 500)).toEqual([{ first: 0, count: CHUNK }]);
  });

  it("uses the control hull, stroke width, effect halo and hairline rim at the current scale and DPR", () => {
    const data = paths([110]);
    const culling = new PathCulling();
    const sync = (): void => {
      culling.invalidate({ kind: "full" }, INSTANCE_FLOATS);
      culling.update(data.paths, data.elements, data.table, frame);
    };
    sync();
    expect(culling.ranges(0, 1, frame, 0)).toEqual([]);
    expect(culling.ranges(0, 1, frame, 10)).toEqual([{ first: 0, count: 1 }]);
    data.paths[2] = 90;
    sync();
    expect(culling.ranges(0, 1, frame, 0)).toEqual([{ first: 0, count: 1 }]);
    data.paths[2] = 115;
    data.paths[12] = 40;
    // Fixed-pixel width stays visible at zoom 0.5 when the camera moves its hull past the right edge.
    data.elements[6] = 7 + 8;
    sync();
    expect(culling.ranges(0, 1, { ...frame, scale: 0.5, x: 55 }, 0)).toEqual([{ first: 0, count: 1 }]);
    data.paths[12] = 0;
    sync();
    expect(culling.ranges(0, 1, { ...frame, x: -9.5 }, 0)).toEqual([{ first: 0, count: 1 }]);
    expect(culling.ranges(0, 1, { ...frame, x: -9.5, dpr: 4 }, 0)).toEqual([]);
  });

  it("honours pixel minimums of world widths and world minimums of pixel widths", () => {
    const data = paths([110]);
    const culling = new PathCulling();
    data.paths[12] = 1;
    data.elements[3] = 30;
    data.elements[6] = 7 + 16;
    culling.update(data.paths, data.elements, data.table, frame);
    expect(culling.ranges(0, 1, frame, 0)).toHaveLength(1);
    data.elements[6] = 7 + 8;
    culling.invalidate({ kind: "full" }, PATH_ELEMENT_FLOATS);
    culling.update(data.paths, data.elements, data.table, frame);
    expect(culling.ranges(0, 1, frame, 0)).toHaveLength(1);
  });

  it("keeps cached origins during pan and paint changes and samples a new table", () => {
    const data = paths([500]);
    const culling = new PathCulling();
    data.table.write("e0", 1, 0, 1, false, 0);
    culling.update(data.paths, data.elements, data.table, frame);
    expect(culling.ranges(0, 1, frame, 0)).toEqual([]);

    data.table.write("e0", 1, 0, 2, false, 3);
    const read = jest.fn((target: typeof data.table.data, key: PropertyKey) => Reflect.get(target, key, target));
    data.table.data = new Proxy(data.table.data, { get: read });
    culling.update(data.paths, data.elements, data.table, { ...frame, x: -1 });
    expect(read).not.toHaveBeenCalled();

    const next = new ElementTable();
    next.write("other", -500, 0, 1, false, 0);
    culling.update(data.paths, data.elements, next, frame);
    expect(culling.ranges(0, 1, frame, 0)).toHaveLength(1);
  });

  it("updates moved origins without an instance upload, including after companion data changes owners", () => {
    const data = paths([500]);
    const culling = new PathCulling();
    culling.update(data.paths, data.elements, data.table, frame);
    expect(culling.ranges(0, 1, frame, 0)).toEqual([]);
    data.table.write("e0", -500, 0, 0, false, 0);
    culling.update(data.paths, data.elements, data.table, frame);
    expect(culling.ranges(0, 1, frame, 0)).toHaveLength(1);
    data.elements[0] = 1;
    culling.invalidate(
      { kind: "range", spans: [{ data: data.elements, byteOffset: 0 }], bytes: data.elements.byteLength },
      PATH_ELEMENT_FLOATS
    );
    culling.update(data.paths, data.elements, data.table, frame);
    expect(culling.ranges(0, 1, frame, 0)).toEqual([]);
    data.table.write("e1", -500, 0, 0, false, 0);
    culling.update(data.paths, data.elements, data.table, frame);
    expect(culling.ranges(0, 1, frame, 0)).toHaveLength(1);
  });

  it("disables the untranslated curve certificate when an origin moves, without an instance upload", () => {
    const data = paths([10]);
    const culling = new PathCulling();
    culling.update(data.paths, data.elements, data.table, frame);
    expect(culling.untranslated).toBe(true);
    data.table.write("e0", 1, 0, 0, false, 0);
    culling.update(data.paths, data.elements, data.table, frame);
    expect(culling.untranslated).toBe(false);
    data.table.write("e0", 0, 0, 0, false, 0);
    culling.update(data.paths, data.elements, data.table, frame);
    expect(culling.untranslated).toBe(true);
    data.table.write("e0", 0, NaN, 0, false, 0);
    culling.update(data.paths, data.elements, data.table, frame);
    expect(culling.untranslated).toBe(false);
    data.table.write("e0", 1e-40, 0, 0, false, 0);
    culling.update(data.paths, data.elements, data.table, frame);
    expect(culling.untranslated).toBe(false);
  });

  it("refreshes dirty instance spans and full replacements without keeping stale chunks", () => {
    const data = paths(Array.from({ length: CHUNK * 2 }, () => 500));
    const culling = new PathCulling();
    culling.update(data.paths, data.elements, data.table, frame);
    data.paths.set([10, 20, 15, 20, 15, 30, 20, 30], CHUNK * INSTANCE_FLOATS);
    const offset = CHUNK * INSTANCE_FLOATS;
    culling.invalidate(
      { kind: "range", spans: [{ data: data.paths.subarray(offset, offset + 8), byteOffset: offset * 4 }], bytes: 32 },
      INSTANCE_FLOATS
    );
    culling.update(data.paths, data.elements, data.table, frame);
    expect(culling.ranges(0, CHUNK * 2, frame, 0)).toEqual([{ first: CHUNK, count: CHUNK }]);
    const replacement = paths([10]);
    culling.invalidate({ kind: "full" }, INSTANCE_FLOATS);
    culling.update(replacement.paths, replacement.elements, replacement.table, frame);
    expect(culling.ranges(0, 1, frame, 0)).toEqual([{ first: 0, count: 1 }]);
  });

  it("keeps nonfinite geometry and invalid camera inputs conservative", () => {
    const data = paths([NaN]);
    const culling = new PathCulling();
    culling.update(data.paths, data.elements, data.table, frame);
    expect(culling.ranges(0, 1, frame, 0)).toHaveLength(1);
    expect(culling.ranges(0, 1, { ...frame, scale: 0 }, 0)).toHaveLength(1);
  });

  it("rebuilds at exact scale and level boundaries without inactive pieces widening a chunk", () => {
    const data = paths([500, 10]);
    const culling = new PathCulling();
    data.elements[PATH_ELEMENT_FLOATS + 4] = 0.5;
    data.elements[PATH_ELEMENT_FLOATS + 5] = 1;
    data.elements[PATH_ELEMENT_FLOATS + 6] = 2;
    const draw = (scale: number, level: TSceneFrame["level"]): { first: number; count: number }[] => {
      const camera = { ...frame, scale, level };
      culling.update(data.paths, data.elements, data.table, camera);
      return culling.ranges(0, 2, camera, 0);
    };
    expect(draw(0.4, "schematic")).toEqual([]);
    expect(draw(0.5, "schematic")).toHaveLength(1);
    expect(draw(0.75, "minimalistic")).toEqual([]);
    expect(draw(0.75, undefined)).toHaveLength(1);
    expect(draw(1, "schematic")).toEqual([]);
    expect(draw(0.5, "schematic")).toHaveLength(1);
    data.elements[PATH_ELEMENT_FLOATS + 4] = 0.6;
    culling.invalidate({ kind: "full" }, PATH_ELEMENT_FLOATS);
    expect(draw(0.5, "schematic")).toEqual([]);
    expect(draw(0.7, "schematic")).toHaveLength(1);
  });

  it("reuses predicate hulls through repeated scale and LOD crossings instead of reading every instance", () => {
    const data = paths(Array.from({ length: CHUNK * 32 }, (_, i) => (i % 2 ? 500 : 10)));
    for (let i = 0; i < CHUNK * 32; i++) {
      data.elements[i * PATH_ELEMENT_FLOATS + 4] = i % 2 ? 0.5 : 0;
      data.elements[i * PATH_ELEMENT_FLOATS + 5] = i % 2 ? 1 : 0.5;
      data.elements[i * PATH_ELEMENT_FLOATS + 6] = i % 2 ? 2 : 1;
    }
    const culling = new PathCulling();
    const write = jest.spyOn(culling as unknown as { writeChunk: () => void }, "writeChunk");
    culling.update(data.paths, data.elements, data.table, { ...frame, scale: 0.4, level: "minimalistic" });
    expect(write).toHaveBeenCalledTimes(32);
    write.mockClear();
    for (let iteration = 0; iteration < 10; iteration++) {
      for (const scale of [0.4, 0.5, 0.75, 1, 0.5, 0.4]) {
        const camera = { ...frame, scale, level: scale < 0.5 ? ("minimalistic" as const) : ("schematic" as const) };
        culling.update(data.paths, data.elements, data.table, camera);
        expect(culling.ranges(0, CHUNK * 32, camera, 0)).toHaveLength(scale < 0.5 ? 1 : 0);
      }
    }
    expect(write).not.toHaveBeenCalled();
    const offset = CHUNK * 3 * INSTANCE_FLOATS;
    data.paths[offset] += 1;
    culling.invalidate(
      { kind: "range", spans: [{ data: data.paths.subarray(offset, offset + 1), byteOffset: offset * 4 }], bytes: 4 },
      INSTANCE_FLOATS
    );
    culling.update(data.paths, data.elements, data.table, { ...frame, scale: 0.4, level: "minimalistic" });
    expect(write).toHaveBeenCalledTimes(1);
    write.mockRestore();
  });

  it("refreshes inactive owners before their hull becomes visible, preserving origin eligibility", () => {
    const data = paths([500, 500]);
    data.paths[20] = 8;
    data.paths[INSTANCE_FLOATS + 20] = 16;
    data.elements[5] = 0.5;
    data.elements[PATH_ELEMENT_FLOATS] = 1;
    data.elements[PATH_ELEMENT_FLOATS + 4] = 0.5;
    data.elements[PATH_ELEMENT_FLOATS + 5] = 1;
    data.elements[PATH_ELEMENT_FLOATS + 6] = 2;
    const culling = new PathCulling();
    const write = jest.spyOn(culling as unknown as { writeChunk: () => void }, "writeChunk");
    const low = { ...frame, scale: 0.4, level: "minimalistic" as const };
    const high = { ...frame, scale: 0.5, level: "schematic" as const };
    culling.update(data.paths, data.elements, data.table, low);
    expect(culling.untranslated).toBe(true);
    write.mockClear();
    data.table.write("e1", -500, 0, 0, false, 0);
    culling.update(data.paths, data.elements, data.table, low);
    expect(write).toHaveBeenCalledTimes(1);
    expect(culling.untranslated).toBe(true);
    write.mockClear();
    culling.update(data.paths, data.elements, data.table, high);
    expect(write).not.toHaveBeenCalled();
    expect(culling.untranslated).toBe(false);
    // The caller observes untranslated=false and requests the exact source template.
    expect(culling.ranges(0, 2, high, 0)).toEqual([{ first: 0, count: 2 }]);
    culling.update(data.paths, data.elements, data.table, low);
    expect(culling.untranslated).toBe(true);
    expect(culling.ranges(0, 2, low, 0, { curveChords: 8 })).toEqual([]);
    write.mockRestore();
  });

  it("keeps all-level chunk bounds across LOD changes until a masked path is written", () => {
    const data = paths([10]);
    const culling = new PathCulling();
    const write = jest.spyOn(culling as unknown as { writeChunk: () => void }, "writeChunk");
    culling.update(data.paths, data.elements, data.table, { ...frame, level: "minimalistic" });
    write.mockClear();
    culling.update(data.paths, data.elements, data.table, { ...frame, level: "schematic" });
    expect(write).not.toHaveBeenCalled();
    expect(culling.ranges(0, 1, frame, 0)).toHaveLength(1);
    data.elements[6] = 2;
    culling.invalidate(
      { kind: "range", spans: [{ data: data.elements, byteOffset: 0 }], bytes: data.elements.byteLength },
      PATH_ELEMENT_FLOATS
    );
    culling.update(data.paths, data.elements, data.table, { ...frame, level: "schematic" });
    expect(culling.ranges(0, 1, frame, 0)).toHaveLength(1);
    culling.update(data.paths, data.elements, data.table, { ...frame, level: "detailed" });
    expect(culling.ranges(0, 1, frame, 0)).toEqual([]);
    write.mockRestore();
  });

  it("keeps float32 origin addition and large camera cancellation conservative", () => {
    const data = paths([100000000]);
    data.table.write("e0", -100000000, 0, 0, false, 0);
    const culling = new PathCulling();
    culling.update(data.paths, data.elements, data.table, frame);
    expect(culling.ranges(0, 1, frame, 0)).toHaveLength(1);
    data.table.write("e0", 0, 0, 0, false, 0);
    culling.update(data.paths, data.elements, data.table, frame);
    expect(culling.ranges(0, 1, { ...frame, x: -100000000 }, 0)).toHaveLength(1);
    data.paths[0] = Infinity;
    culling.invalidate({ kind: "full" }, INSTANCE_FLOATS);
    culling.update(data.paths, data.elements, data.table, frame);
    expect(culling.ranges(0, 1, frame, 0)).toHaveLength(1);
  });
});
