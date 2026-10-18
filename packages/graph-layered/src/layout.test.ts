import { layoutGraph } from "./layout";
import type { Node } from "./layout";

const nodes: Node<string>[] = [
  { id: "a", level: 0, width: 100, height: 50 },
  { id: "b", level: 1, width: 100, height: 50 },
  { id: "c", level: 1, width: 100, height: 50 },
  { id: "d", level: 2, width: 100, height: 50 },
];
const edges = [
  { from: "a", to: "b" },
  { from: "a", to: "c" },
  { from: "b", to: "d" },
  { from: "c", to: "d" },
  { from: "a", to: "d" },
];

function byId<T extends { id: string }>(items: T[]): Record<string, T> {
  return Object.fromEntries(items.map((item) => [item.id, item]));
}

describe("layoutGraph", () => {
  it("places levels in left-to-right columns and separates blocks of the same level", async () => {
    const result = await layoutGraph({ nodes, edges });
    const placed = byId(result.nodes);

    expect(placed.b.x).toBe(placed.c.x);
    expect(placed.b.x).toBeGreaterThan(placed.a.x ?? 0);
    expect(placed.d.x).toBeGreaterThan(placed.b.x ?? 0);
    // Default nodeVerticalGap is 200: same-column blocks are at least height + gap apart.
    expect(Math.abs((placed.b.y ?? 0) - (placed.c.y ?? 0))).toBeGreaterThanOrEqual(250);
    expect(placed.a).toMatchObject({ width: 100, height: 50, level: 0 });
  });

  it("adds a dummy node for an edge that skips a level", async () => {
    const result = await layoutGraph({ nodes, edges });
    const dummies = result.nodes.filter((node) => node.shape === "dot");

    expect(dummies).toHaveLength(1);
    expect(result.edges).toEqual(
      expect.arrayContaining([
        { from: "a", to: dummies[0].id, arrows: { to: false } },
        { from: dummies[0].id, to: "d", arrows: { from: false } },
      ])
    );
  });

  it("applies spacing options", async () => {
    const compact = byId((await layoutGraph({ nodes, edges, options: { nodeVerticalGap: 0 } })).nodes);
    const wide = byId((await layoutGraph({ nodes, edges, options: { nodeVerticalGap: 400 } })).nodes);

    const spread = (placed: typeof compact) => Math.abs((placed.b.y ?? 0) - (placed.c.y ?? 0));
    expect(spread(wide)).toBeGreaterThan(spread(compact));
  });
});
