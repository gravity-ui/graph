import { INSTANCE_FLOATS } from "../../../components/canvas/connections/webgl/encode";

import type { TSceneFrame } from "./backendTypes";
import { PATH_ELEMENT_FLOATS } from "./encodePaths";
import { PathCulling } from "./pathCulling";

const frame: TSceneFrame = { width: 100, height: 100, x: 0, y: 0, scale: 1, dpr: 2, time: 0, dimColor: "" };
const CHUNK = 128;

function paths(xs: number[]): { paths: Float32Array; elements: Float32Array; table: Float32Array } {
  const data = new Float32Array(xs.length * INSTANCE_FLOATS);
  const elements = new Float32Array(xs.length * PATH_ELEMENT_FLOATS);
  xs.forEach((x, index) => {
    data.set([x, 20, x + 5, 20, x + 5, 30, x + 10, 30], index * INSTANCE_FLOATS);
    data[index * INSTANCE_FLOATS + 12] = 2;
    elements.set([0, 0, 0, 0, 0, 1e9, 7, 1e9], index * PATH_ELEMENT_FLOATS);
  });
  return { paths: data, elements, table: new Float32Array([0, 0, 0, 0, 0, 0, 0, 0]) };
}

describe("PathCulling", () => {
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
    data.table[4] = 200;
    sync();
    expect(write).not.toHaveBeenCalled();
    expect(culling.ranges(0, count, frame, 0)).toEqual([{ first: 0, count }]);
    count = CHUNK;
    sync();
    expect(write).not.toHaveBeenCalled();
    count = 0;
    sync();
    data.table[0] = 200;
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

  it("promotes only edited chunks that need more curve detail and merges them again after recovery", () => {
    const data = paths(Array.from({ length: CHUNK * 3 }, () => 10));
    for (let i = 0; i < CHUNK * 3; i++) data.paths[i * INSTANCE_FLOATS + 20] = 8;
    const at = CHUNK * INSTANCE_FLOATS + 20;
    data.paths[at] = 16;
    const culling = new PathCulling();
    culling.update(data.paths, data.elements, data.table, frame);
    expect(culling.ranges(0, CHUNK * 3, frame, 0, { curveChords: 8 })).toEqual([
      { first: 0, count: CHUNK, curveChords: 8 },
      { first: CHUNK, count: CHUNK, curveChords: 16 },
      { first: CHUNK * 2, count: CHUNK, curveChords: 8 },
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

  it("updates moved origins without an instance upload, including after companion data changes owners", () => {
    const data = paths([500]);
    const culling = new PathCulling();
    culling.update(data.paths, data.elements, data.table, frame);
    expect(culling.ranges(0, 1, frame, 0)).toEqual([]);
    data.table[0] = -500;
    culling.update(data.paths, data.elements, data.table, frame);
    expect(culling.ranges(0, 1, frame, 0)).toHaveLength(1);
    data.elements[0] = 1;
    culling.invalidate(
      { kind: "range", spans: [{ data: data.elements, byteOffset: 0 }], bytes: data.elements.byteLength },
      PATH_ELEMENT_FLOATS
    );
    culling.update(data.paths, data.elements, data.table, frame);
    expect(culling.ranges(0, 1, frame, 0)).toEqual([]);
    data.table[4] = -500;
    culling.update(data.paths, data.elements, data.table, frame);
    expect(culling.ranges(0, 1, frame, 0)).toHaveLength(1);
  });

  it("disables the untranslated curve certificate when an origin moves, without an instance upload", () => {
    const data = paths([10]);
    const culling = new PathCulling();
    culling.update(data.paths, data.elements, data.table, frame);
    expect(culling.untranslated).toBe(true);
    data.table[0] = 1;
    culling.update(data.paths, data.elements, data.table, frame);
    expect(culling.untranslated).toBe(false);
    data.table[0] = 0;
    culling.update(data.paths, data.elements, data.table, frame);
    expect(culling.untranslated).toBe(true);
    data.table[1] = NaN;
    culling.update(data.paths, data.elements, data.table, frame);
    expect(culling.untranslated).toBe(false);
    data.table[1] = 0;
    data.table[0] = Math.fround(1e-40);
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

  it("refreshes inactive owners before their hull becomes visible, preserving detail and origin eligibility", () => {
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
    data.table[4] = -500;
    culling.update(data.paths, data.elements, data.table, low);
    expect(write).toHaveBeenCalledTimes(1);
    expect(culling.untranslated).toBe(true);
    write.mockClear();
    culling.update(data.paths, data.elements, data.table, high);
    expect(write).not.toHaveBeenCalled();
    expect(culling.untranslated).toBe(false);
    expect(culling.ranges(0, 2, high, 0, { curveChords: 8 })).toEqual([{ first: 0, count: 2, curveChords: 16 }]);
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
    data.table[0] = -100000000;
    const culling = new PathCulling();
    culling.update(data.paths, data.elements, data.table, frame);
    expect(culling.ranges(0, 1, frame, 0)).toHaveLength(1);
    data.table[0] = 0;
    culling.update(data.paths, data.elements, data.table, frame);
    expect(culling.ranges(0, 1, { ...frame, x: -100000000 }, 0)).toHaveLength(1);
    data.paths[0] = Infinity;
    culling.invalidate({ kind: "full" }, INSTANCE_FLOATS);
    culling.update(data.paths, data.elements, data.table, frame);
    expect(culling.ranges(0, 1, frame, 0)).toHaveLength(1);
  });
});
