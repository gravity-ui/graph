import { Edge, Node, layoutGraph } from "./layout";

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
