import { TTileRect, TileIndex } from "./TileIndex";

const rect = (minX: number, minY: number, maxX: number, maxY: number): TTileRect => ({ minX, minY, maxX, maxY });

function collect<T>(index: TileIndex<T>, query: TTileRect): T[] {
  const found: T[] = [];
  index.query(query, (item) => found.push(item));
  return found;
}

function intersects(a: TTileRect, b: TTileRect): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}

describe("TileIndex", () => {
  it("finds an item by any rect touching its bounds and only by those", () => {
    const index = new TileIndex<string>({ tileSize: 100 });
    index.set("a", 10, 10, 50, 50);

    expect(collect(index, rect(0, 0, 20, 20))).toEqual(["a"]);
    expect(collect(index, rect(50, 50, 60, 60))).toEqual(["a"]);
    // Same tile, outside the exact bounds.
    expect(collect(index, rect(60, 60, 90, 90))).toEqual([]);
    expect(collect(index, rect(500, 500, 600, 600))).toEqual([]);
  });

  it("reports an item stored in several tiles once", () => {
    const index = new TileIndex<string>({ tileSize: 100 });
    index.set("a", 50, 50, 350, 250);

    expect(collect(index, rect(0, 0, 1000, 1000))).toEqual(["a"]);
  });

  it("moves an item between tiles and inside a tile", () => {
    const index = new TileIndex<string>({ tileSize: 100 });
    index.set("a", 10, 10, 20, 20);
    index.set("a", 30, 30, 40, 40);
    expect(collect(index, rect(0, 0, 25, 25))).toEqual([]);
    expect(collect(index, rect(35, 35, 36, 36))).toEqual(["a"]);

    index.set("a", 1010, 1010, 1020, 1020);
    expect(collect(index, rect(0, 0, 100, 100))).toEqual([]);
    expect(collect(index, rect(1000, 1000, 1100, 1100))).toEqual(["a"]);
    expect(index.size).toBe(1);
  });

  it("deletes items", () => {
    const index = new TileIndex<string>({ tileSize: 100 });
    index.set("a", 0, 0, 10, 10);
    index.set("b", 0, 0, 10, 10);

    expect(index.delete("a")).toBe(true);
    expect(index.delete("a")).toBe(false);
    expect(collect(index, rect(0, 0, 10, 10))).toEqual(["b"]);
    expect(index.has("a")).toBe(false);
  });

  it("handles negative coordinates", () => {
    const index = new TileIndex<string>({ tileSize: 100 });
    index.set("a", -250, -250, -210, -210);

    expect(collect(index, rect(-260, -260, -240, -240))).toEqual(["a"]);
    expect(collect(index, rect(-200, -200, -100, -100))).toEqual([]);
  });

  it("indexes long and huge items exactly", () => {
    const index = new TileIndex<string>({ tileSize: 100, maxCellSpan: 2, maxStripSpan: 2 });
    index.set("tall", 0, 0, 150, 100_000);
    index.set("wide", 0, 0, 100_000, 150);
    index.set("huge", 0, 0, 100_000, 100_000);

    expect(collect(index, rect(120, 50_000, 130, 50_010)).sort()).toEqual(["huge", "tall"]);
    expect(collect(index, rect(50_000, 120, 50_010, 130)).sort()).toEqual(["huge", "wide"]);
    expect(collect(index, rect(50_000, 50_000, 50_010, 50_010))).toEqual(["huge"]);
    expect(collect(index, rect(-500, -500, -400, -400))).toEqual([]);

    // Shrinking a huge item moves it back to tiles.
    index.set("huge", 0, 0, 10, 10);
    expect(collect(index, rect(50_000, 50_000, 50_010, 50_010))).toEqual([]);
  });

  it("reports items without bounds to every query", () => {
    const index = new TileIndex<string>({ tileSize: 100 });
    index.set("unknown", NaN, NaN, NaN, NaN);
    index.set("inverted", 10, 10, 0, 0);

    expect(collect(index, rect(5000, 5000, 5001, 5001)).sort()).toEqual(["inverted", "unknown"]);

    index.set("unknown", 0, 0, 10, 10);
    expect(collect(index, rect(5000, 5000, 5001, 5001))).toEqual(["inverted"]);
  });

  it("tells whether a rect covers everything stored", () => {
    const index = new TileIndex<string>({ tileSize: 100 });
    index.set("a", 0, 0, 10, 10);
    index.set("b", 500, 500, 510, 510);

    expect(index.covers(rect(-1, -1, 600, 600))).toBe(true);
    expect(index.covers(rect(-1, -1, 505, 600))).toBe(false);
  });

  it("counts the bucket entries a query would scan, up to a limit", () => {
    const index = new TileIndex<string>({ tileSize: 100, maxCellSpan: 2, maxStripSpan: 2 });
    index.set("a", 10, 10, 20, 20);
    index.set("b", 50, 50, 150, 60); // spans two tiles, stored in the first
    index.set("far", 5000, 5000, 5010, 5010);
    index.set("tall", 0, 0, 150, 100_000); // stored in column 0

    expect(index.countCandidates(rect(0, 0, 99, 99), 100)).toBe(3);
    // Every item is stored once, so a wider rect does not count "b" or "tall" twice.
    expect(index.countCandidates(rect(0, 0, 199, 99), 100)).toBe(3);
    // Items stored to the left can still reach in.
    expect(index.countCandidates(rect(120, 0, 199, 99), 100)).toBe(3);
    expect(index.countCandidates(rect(4000, 4000, 4100, 4100), 100)).toBe(0);
    // Stops early once the limit is exceeded.
    expect(index.countCandidates(rect(0, 0, 10_000, 10_000), 1)).toBeGreaterThan(1);
  });

  it("counts large and unbounded candidates once each", () => {
    const index = new TileIndex<string>({ tileSize: 100 });
    index.set("huge", 0, 0, 1000, 1000);
    index.set("unknown", NaN, NaN, NaN, NaN);
    index.set("near", 0, 0, 10, 10);
    const viewport = rect(100, 100, 110, 110);

    expect(index.countCandidates(viewport, Infinity)).toBe(3);
    expect(index.countCandidates(viewport, 3)).toBe(3);
    expect(index.countCandidates(viewport, 1)).toBeGreaterThan(1);
    expect(collect(index, viewport).sort()).toEqual(["huge", "unknown"]);
    expect(index.countCandidates(rect(5000, 5000, 5010, 5010), Infinity)).toBe(2);
  });

  it.each([
    { tileSize: 512, maxCellSpan: 2, maxStripSpan: 4 },
    { tileSize: 128, maxCellSpan: 1, maxStripSpan: 1 },
    { tileSize: 2048, maxCellSpan: 3, maxStripSpan: 6 },
  ])("matches a brute-force search under random inserts, moves and deletes (%o)", (options) => {
    let seed = 7;
    const random = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    const randomRect = (): TTileRect => {
      const x = (random() - 0.5) * 20_000;
      const y = (random() - 0.5) * 20_000;
      // Mostly block-sized items, some long connections and a few huge groups.
      const kind = random();
      const shapes: Array<[share: number, width: number, height: number]> = [
        [0.7, 200, 150],
        [0.85, 300, 9_000],
        [0.95, 6_000, 300],
        [1, 15_000, 15_000],
      ];
      const [, width, height] = shapes.find(([share]) => kind < share) ?? shapes[shapes.length - 1];
      return rect(x, y, x + width * random(), y + height * random());
    };

    const index = new TileIndex<number>(options);
    const truth = new Map<number, TTileRect>();
    for (let step = 0; step < 4000; step++) {
      const id = Math.floor(random() * 600);
      if (random() < 0.15) {
        index.delete(id);
        truth.delete(id);
      } else {
        const r = randomRect();
        index.set(id, r.minX, r.minY, r.maxX, r.maxY);
        truth.set(id, r);
      }

      if (step % 20 === 0) {
        const size = random() < 0.2 ? 50_000 : 3_000 * random();
        const x = (random() - 0.5) * 20_000;
        const y = (random() - 0.5) * 20_000;
        const query = rect(x, y, x + size, y + size);
        const expected = Array.from(truth.entries())
          .filter(([, r]) => intersects(r, query))
          .map(([key]) => key)
          .sort((a, b) => a - b);
        const found = collect(index, query).sort((a, b) => a - b);
        expect(found).toEqual(expected);
      }
    }
    expect(index.size).toBe(truth.size);
  });
});
