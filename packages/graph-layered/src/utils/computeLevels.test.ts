import { computeLevels } from "./computeLevels";

const edge = (sourceBlockId: string | number, targetBlockId: string | number) => ({ sourceBlockId, targetBlockId });

describe("computeLevels", () => {
  it("assigns roots level 0 and every other block the longest path from a root", () => {
    const levels = computeLevels(
      ["a", "b", "c", "d"],
      [edge("a", "b"), edge("a", "c"), edge("b", "d"), edge("c", "d"), edge("a", "d")]
    );

    expect(Object.fromEntries(levels)).toEqual({ a: 0, b: 1, c: 1, d: 2 });
  });

  it("gives isolated blocks and independent roots level 0", () => {
    const levels = computeLevels(
      ["root1", "root2", "child", "alone"],
      [edge("root1", "child"), edge("root2", "child")]
    );

    expect(Object.fromEntries(levels)).toEqual({ root1: 0, root2: 0, child: 1, alone: 0 });
  });

  it("falls back to level 0 for blocks inside a cycle that are never resolved", () => {
    const pureCycle = computeLevels(["x", "y"], [edge("x", "y"), edge("y", "x")]);
    expect(Object.fromEntries(pureCycle)).toEqual({ x: 0, y: 0 });

    // The cycle entry gets a level from the root; the rest of the cycle is never dequeued.
    const rootedCycle = computeLevels(["r", "p", "q"], [edge("r", "p"), edge("p", "q"), edge("q", "p")]);
    expect(Object.fromEntries(rootedCycle)).toEqual({ r: 0, p: 1, q: 0 });
  });

  it("keeps the original id values as map keys", () => {
    const levels = computeLevels([1, 2], [edge(1, 2)]);

    expect([...levels.entries()]).toEqual([
      [1, 0],
      [2, 1],
    ]);
  });
});
