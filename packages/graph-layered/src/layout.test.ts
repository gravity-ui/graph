import { layoutGraph } from "./layout";
import type { Edge, Node } from "./layout";

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

describe("layoutGraph node sizes", () => {
  it("keeps differently sized nodes in a chain aligned by their centers", async () => {
    const result = await layoutGraph({
      nodes: [
        { id: "a", level: 0, width: 100, height: 300 },
        { id: "b", level: 1, width: 100, height: 100 },
        { id: "c", level: 2, width: 100, height: 200 },
      ],
      edges: [
        { from: "a", to: "b" },
        { from: "b", to: "c" },
      ],
    });

    const centers = result.nodes.map((node) => (node.y ?? 0) + (node.height ?? 100) / 2);
    expect(new Set(centers).size).toBe(1);
  });

  it.each([0, 40])("keeps a vertical gap of %s between differently sized nodes", async (gap) => {
    const result = await layoutGraph({
      nodes: [
        { id: "root", level: 0, width: 100, height: 100 },
        { id: "tall", level: 1, width: 100, height: 900 },
        { id: "short", level: 1, width: 100, height: 100 },
      ],
      edges: [
        { from: "root", to: "tall" },
        { from: "root", to: "short" },
      ],
      options: { nodeVerticalGap: gap },
    });

    const [first, second] = result.nodes.filter((node) => node.level === 1).sort((a, b) => (a.y ?? 0) - (b.y ?? 0));
    expect(second.y).toBe((first.y ?? 0) + (first.height ?? 100) + gap);
  });

  it("leaves enough horizontal space after a wide layer", async () => {
    const nodes: Node<string>[] = [
      { id: "wide", level: 0, width: 900, height: 100 },
      { id: "next", level: 1, width: 100, height: 100 },
    ];
    const edges: Edge<string>[] = [{ from: "wide", to: "next" }];
    const result = await layoutGraph({
      nodes,
      edges,
      options: { nodeHorizontalGap: 20, layerSpacingFactor: 0.5 },
    });

    const wide = result.nodes.find((node) => node.id === "wide");
    const next = result.nodes.find((node) => node.id === "next");
    expect(wide).toBeDefined();
    expect(next).toBeDefined();
    if (!wide || !next) return;
    expect(next.x).toBe((wide.x ?? 0) + (wide.width ?? 100) + 20);
  });

  it("preserves the previous geometry for standard-sized nodes", async () => {
    const result = await layoutGraph({
      nodes: [
        { id: "a", level: 0, width: 100, height: 100 },
        { id: "b", level: 1, width: 100, height: 100 },
      ],
      edges: [{ from: "a", to: "b" }],
    });

    expect(result.nodes).toEqual([
      { id: "a", level: 0, width: 100, height: 100, x: 0, y: 0 },
      { id: "b", level: 1, width: 100, height: 100, x: 510, y: 0 },
    ]);
  });
});
