import { pathRecordWrites } from "./pathRecords";

function source(count: number) {
  const paths = Float32Array.from({ length: count * 32 }, (_, i) => i + 1);
  const elements = Float32Array.from({ length: count * 8 }, (_, i) => -i - 1);
  return { paths, elements };
}

describe("path record texture writes", () => {
  it("interleaves exactly32+8 floats and pads only the last texture row", () => {
    const { paths, elements } = source(3);
    const writes = pathRecordWrites(paths, elements, { kind: "full" }, { kind: "none" }, 20);
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({ x: 0, y: 0, width: 20, height: 2 });
    for (let i = 0; i < 3; i++) {
      expect(writes[0].data.slice(i * 40, i * 40 + 32)).toEqual(paths.slice(i * 32, (i + 1) * 32));
      expect(writes[0].data.slice(i * 40 + 32, (i + 1) * 40)).toEqual(elements.slice(i * 8, (i + 1) * 8));
    }
    expect(writes[0].data.slice(120)).toEqual(new Float32Array(40));
  });

  it("unions payload and companion dirtiness, splitting a span across texture rows", () => {
    const { paths, elements } = source(8);
    const payload = {
      kind: "range" as const,
      spans: [{ byteOffset: 32 * 4, data: paths.subarray(32, 32 * 5) }],
      bytes: 512,
    };
    const companion = {
      kind: "range" as const,
      spans: [{ byteOffset: 8 * 4 * 4, data: elements.subarray(8 * 4, 8 * 6) }],
      bytes: 64,
    };
    const writes = pathRecordWrites(paths, elements, payload, companion, 20);
    expect(writes.map(({ x, y, width, height }) => [x, y, width, height])).toEqual([
      [10, 0, 10, 1],
      [0, 1, 20, 2],
    ]);
    expect(writes.reduce((n, w) => n + w.data.byteLength, 0)).toBe(5 * 160);
    expect(writes[0].data.slice(0, 32)).toEqual(paths.slice(32, 64));
    expect(writes[1].data.slice(-8)).toEqual(elements.slice(8 * 5, 8 * 6));
    expect(pathRecordWrites(paths, elements, { kind: "none" }, { kind: "none" }, 20)).toEqual([]);
  });

  it("writes companion-only changes and clips stale dirty tails to the resident record count", () => {
    const { paths, elements } = source(3);
    const writes = pathRecordWrites(
      paths,
      elements,
      { kind: "none" },
      {
        kind: "range",
        spans: [{ byteOffset: 8 * 4 * 2, data: new Float32Array(8 * 3) }],
        bytes: 96,
      },
      20
    );
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({ x: 0, y: 1, width: 10, height: 1 });
    expect(writes[0].data.slice(0, 32)).toEqual(paths.slice(64));
    expect(writes[0].data.slice(32)).toEqual(elements.slice(16));
  });
});
