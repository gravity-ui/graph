import { expect, test } from "@playwright/test";

import type { TBlock, TConnection, TPoint } from "@gravity-ui/graph";
import { createAnchorPortId } from "@gravity-ui/graph";

import { ElkPageObject, toElkGraph } from "./ElkPageObject";

const SIZE = { width: 160, height: 80 };
const LAYERED_RIGHT = { "elk.algorithm": "layered", "elk.direction": "RIGHT" };

function block(id: string, anchors: TBlock["anchors"] = []): TBlock {
  return { id, is: "Block", x: 0, y: 0, ...SIZE, name: id, anchors, selected: false };
}

function pointsOf(connection: TConnection | null): TPoint[] {
  return connection && "points" in connection && Array.isArray(connection.points) ? connection.points : [];
}

test.describe("@gravity-ui/graph-elk with real ELK", () => {
  let graphPO: ElkPageObject;
  let pageErrors: string[];

  test.beforeEach(async ({ page }) => {
    graphPO = new ElkPageObject(page);
    pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
  });

  test.afterEach(async ({ page }) => {
    await graphPO.unmount();
    // Let frames scheduled before unmount run, so late errors are caught too.
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    expect(pageErrors).toEqual([]);
  });

  test("block connections: useElk lays out blocks and routes connections between block borders", async () => {
    const blocks = [block("a"), block("b"), block("c")];
    const connections: TConnection[] = [
      { id: "a-b", sourceBlockId: "a", targetBlockId: "b" },
      { id: "b-c", sourceBlockId: "b", targetBlockId: "c" },
    ];
    await graphPO.renderLayout({ blocks, connections, elkGraph: toElkGraph(blocks, connections, LAYERED_RIGHT) });

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
      const points = pointsOf(await graphPO.connection(id).getState());
      expect(points.length).toBeGreaterThanOrEqual(2);
      expect(points[0].x).toBe(source.x + source.width);
      expect(points[points.length - 1].x).toBe(target.x);
      expect(points[0].y).toBeGreaterThanOrEqual(source.y);
      expect(points[0].y).toBeLessThanOrEqual(source.y + source.height);
    }

    // Inline `{ onError }` options re-render the app without starting another layout.
    await graphPO.waitForFrames(10);
    expect(await graphPO.getLayoutCalls()).toBe(1);
    expect(await graphPO.getLayoutErrors()).toEqual([]);
  });

  test("port connections: a port-only connection is excluded from ELK edges and keeps its state", async () => {
    const anchors = (blockId: string): TBlock["anchors"] => [
      { id: `${blockId}-in`, blockId, type: "IN" },
      { id: `${blockId}-out`, blockId, type: "OUT" },
    ];
    const blocks = [block("a", anchors("a")), block("b", anchors("b"))];
    const portConnection: TConnection = {
      id: "ports",
      sourcePortId: createAnchorPortId("b", "b-out"),
      targetPortId: createAnchorPortId("a", "a-in"),
    };
    const connections: TConnection[] = [{ id: "a-b", sourceBlockId: "a", targetBlockId: "b" }, portConnection];
    const elkGraph = toElkGraph(blocks, connections, LAYERED_RIGHT);
    expect(elkGraph.edges?.map(({ id }) => id)).toEqual(["a-b"]);

    await graphPO.renderLayout({ blocks, connections, elkGraph });

    const [a, b] = await Promise.all(blocks.map(({ id }) => graphPO.block(id).getGeometry()));
    expect(b.x).toBeGreaterThan(a.x + a.width);
    expect(pointsOf(await graphPO.connection("a-b").getState()).length).toBeGreaterThanOrEqual(2);

    expect(await graphPO.connection("ports").exists()).toBe(true);
    // The store adds its own defaults (for example `selected`); the connection gets no route from ELK.
    const portState = await graphPO.connection("ports").getState();
    expect(portState).toMatchObject(portConnection);
    expect(portState && "points" in portState).toBe(false);
    expect(await graphPO.getLayoutErrors()).toEqual([]);
  });

  test("anchor connections: anchors are kept, routes end on the block border", async () => {
    const blocks = [
      block("a", [{ id: "a-out", blockId: "a", type: "OUT" }]),
      block("b", [{ id: "b-in", blockId: "b", type: "IN" }]),
    ];
    const connections: TConnection[] = [
      { id: "a-b", sourceBlockId: "a", sourceAnchorId: "a-out", targetBlockId: "b", targetAnchorId: "b-in" },
    ];
    await graphPO.renderLayout({ blocks, connections, elkGraph: toElkGraph(blocks, connections, LAYERED_RIGHT) });

    const [a, b] = await Promise.all(blocks.map(({ id }) => graphPO.block(id).getGeometry()));
    const state = await graphPO.connection("a-b").getState();
    expect(state).toMatchObject({ sourceAnchorId: "a-out", targetAnchorId: "b-in" });
    // Anchors are not ELK ports: the route connects the block borders.
    const points = pointsOf(state);
    expect(points[0].x).toBe(a.x + a.width);
    expect(points[points.length - 1].x).toBe(b.x);
  });

  test("elkConverter maps ELK output to block positions, route points and labels", async () => {
    await graphPO.openPage();
    const blocks = [block("a"), block("b")];
    const elkGraph = toElkGraph(blocks, [{ id: "a-b", sourceBlockId: "a", targetBlockId: "b" }], {
      ...LAYERED_RIGHT,
      "elk.edgeLabels.placement": "CENTER",
    });
    elkGraph.edges = elkGraph.edges?.map((edge) => ({
      ...edge,
      labels: [{ text: `${edge.id} label`, width: 40, height: 12 }],
    }));

    const { raw, converted } = await graphPO.layoutWithConverter(elkGraph);

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
