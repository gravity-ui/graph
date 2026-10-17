import { expect, test } from "@playwright/test";

import type { TBlock, TConnection, TMultipointConnection } from "@gravity-ui/graph";
import type { ElkNode } from "elkjs";

import { ElkPageObject } from "./ElkPageObject";

const SIZE = { width: 160, height: 80 };

function block(id: string): TBlock {
  return { id, is: "Block", x: 0, y: 0, ...SIZE, name: id, anchors: [], selected: false };
}

const blocks = [block("a"), block("b"), block("c")];
const connections: TConnection[] = [
  { id: "a-b", sourceBlockId: "a", targetBlockId: "b" },
  { id: "b-c", sourceBlockId: "b", targetBlockId: "c" },
];

function elkGraph(labelled = false): ElkNode {
  return {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.edgeLabels.placement": "CENTER",
    },
    children: blocks.map(({ id }) => ({ id: String(id), ...SIZE })),
    edges: connections.map(({ id, sourceBlockId, targetBlockId }) => ({
      id: String(id),
      sources: [String(sourceBlockId)],
      targets: [String(targetBlockId)],
      labels: labelled ? [{ text: `${String(id)} label`, width: 40, height: 12 }] : undefined,
    })),
  };
}

test.describe("@gravity-ui/graph-elk with real ELK", () => {
  let graphPO: ElkPageObject;

  test.beforeEach(async ({ page }) => {
    graphPO = new ElkPageObject(page);
    await graphPO.initialize({ blocks: [], connections: [] });
  });

  test("useElk lays out blocks left to right and routes connections between them", async () => {
    await graphPO.applyLayoutWithHook({ blocks, connections, elkGraph: elkGraph() });

    const [a, b, c] = await Promise.all(blocks.map(({ id }) => graphPO.block(id).getGeometry()));
    expect(b.x).toBeGreaterThan(a.x + a.width);
    expect(c.x).toBeGreaterThan(b.x + b.width);
    expect(b.y).toBe(a.y);
    expect(c.y).toBe(a.y);
    expect({ width: a.width, height: a.height }).toEqual(SIZE);

    for (const [id, source, target] of [
      ["a-b", a, b],
      ["b-c", b, c],
    ] as const) {
      const connection = (await graphPO.connection(id).getState()) as TMultipointConnection | null;
      const points = connection?.points ?? [];
      expect(points.length).toBeGreaterThanOrEqual(2);
      // Routes start at the source's right edge and end at the target's left edge.
      expect(points[0].x).toBe(source.x + source.width);
      expect(points[points.length - 1].x).toBe(target.x);
      expect(points[0].y).toBeGreaterThanOrEqual(source.y);
      expect(points[0].y).toBeLessThanOrEqual(source.y + source.height);
    }
  });

  test("elkConverter maps ELK output to block positions, route points and labels", async () => {
    const { raw, converted } = await graphPO.layoutWithConverter(elkGraph(true));

    for (const child of raw.children ?? []) {
      expect(converted.blocks[child.id]).toEqual({ x: child.x, y: child.y });
    }
    for (const edge of raw.edges ?? []) {
      const [section] = edge.sections ?? [];
      expect(converted.edges[edge.id].points).toEqual([
        section.startPoint,
        ...(section.bendPoints ?? []),
        section.endPoint,
      ]);
      const [label] = converted.edges[edge.id].labels ?? [];
      expect(label).toMatchObject({ text: `${edge.id} label`, width: 40, height: 12 });
      expect(typeof label.x).toBe("number");
      expect(typeof label.y).toBe("number");
    }
  });
});
