import { expect, test, type Page } from "@playwright/test";
import type { TBlock, TConnection } from "@gravity-ui/graph";
import type { GraphPO } from "@gravity-ui/graph-playwright";

import { GraphPageObject } from "../page-objects/GraphPageObject";

const block = (id: string, x: number, y: number, anchors: TBlock["anchors"] = []): TBlock => ({
  id,
  is: "Block",
  x,
  y,
  width: 200,
  height: 120,
  name: id,
  anchors,
});

async function openGraph(page: Page, blocks: TBlock[], connections: TConnection[]): Promise<GraphPO> {
  const graph = new GraphPageObject(page);
  await graph.initialize({ blocks, connections });
  return graph;
}

test.describe("Public connection page objects: block to block", () => {
  let graph: GraphPO;

  test.beforeEach(async ({ page }) => {
    graph = await openGraph(
      page,
      [block("block-a", 100, 100), block("block-b", 500, 300)],
      [{ id: "conn-ab", sourceBlockId: "block-a", targetBlockId: "block-b" }]
    );
  });

  test("finds, inspects, hovers and clicks a block connection", async () => {
    const connection = graph.connection("conn-ab");

    expect(await connection.exists()).toBe(true);
    expect(await connection.getState()).toMatchObject({ sourceBlockId: "block-a", targetBlockId: "block-b" });
    expect(await graph.hasConnectionBetween("block-a", "block-b")).toBe(true);
    expect(await graph.hasConnectionBetween("block-b", "block-a")).toBe(false);
    // Block endpoints resolve to the blocks' own connection points.
    expect(await graph.hasConnectionBetweenPorts("block-a_output", "block-b_input")).toBe(true);
    expect(await graph.findConnectionId({ sourceBlockId: "block-a", targetBlockId: "block-b" })).toBe("conn-ab");

    await connection.hover();
    await expect.poll(() => graph.getCursor()).toBe("pointer");

    await connection.click();
    expect(await connection.isSelected()).toBe(true);
    expect(await graph.getSelectedConnectionIds()).toEqual(["conn-ab"]);
  });
});

test.describe("Public connection page objects: port-only connection at block points", () => {
  let graph: GraphPO;

  test.beforeEach(async ({ page }) => {
    // No block ids in the data: the connection is addressed only by the blocks' own port ids.
    graph = await openGraph(
      page,
      [block("block-a", 100, 100), block("block-b", 500, 300)],
      [{ sourcePortId: "block-a_output", targetPortId: "block-b_input" }]
    );
  });

  test("matches block endpoints through resolved ports", async () => {
    const id = await graph.findConnectionId({ sourcePortId: "block-a_output", targetPortId: "block-b_input" });
    if (id === null) throw new Error("The port-only connection was not found.");

    expect(await graph.hasConnectionBetween("block-a", "block-b")).toBe(true);
    expect(await graph.hasConnectionBetween("block-b", "block-a")).toBe(false);
    expect(await graph.findConnectionId({ sourceBlockId: "block-a", targetBlockId: "block-b" })).toBe(id);

    const connection = graph.connection(id);
    expect(await connection.getState()).toMatchObject({
      sourcePortId: "block-a_output",
      targetPortId: "block-b_input",
    });
    await connection.click();
    expect(await graph.getSelectedConnectionIds()).toEqual([id]);
  });
});

test.describe("Public connection page objects: anchor to anchor", () => {
  let graph: GraphPO;

  test.beforeEach(async ({ page }) => {
    graph = await openGraph(
      page,
      [
        block("block-a", 100, 100, [
          { id: "out-1", blockId: "block-a", type: "OUT", index: 0 },
          { id: "out-2", blockId: "block-a", type: "OUT", index: 1 },
        ]),
        block("block-b", 500, 300, [
          { id: "in-1", blockId: "block-b", type: "IN", index: 0 },
          { id: "in-2", blockId: "block-b", type: "IN", index: 1 },
        ]),
      ],
      [
        {
          id: "conn-1",
          sourceBlockId: "block-a",
          sourceAnchorId: "out-1",
          targetBlockId: "block-b",
          targetAnchorId: "in-1",
        },
        {
          id: "conn-2",
          sourceBlockId: "block-a",
          sourceAnchorId: "out-2",
          targetBlockId: "block-b",
          targetAnchorId: "in-2",
        },
      ]
    );
  });

  // The default anchor layout places anchors of the same block 32px apart, so the two curves do not overlap.
  test("tells apart connections between the same blocks on different anchors", async () => {
    const second = graph.connection("conn-2");

    expect(await second.exists()).toBe(true);
    expect(await second.getState()).toMatchObject({ sourceAnchorId: "out-2", targetAnchorId: "in-2" });
    expect(await graph.hasConnectionBetween("block-a", "block-b")).toBe(true);
    expect(
      await graph.hasConnectionBetween("block-a", "block-b", { sourceAnchorId: "out-1", targetAnchorId: "in-1" })
    ).toBe(true);
    expect(
      await graph.hasConnectionBetween("block-a", "block-b", { sourceAnchorId: "out-1", targetAnchorId: "in-2" })
    ).toBe(false);
    expect(await graph.hasConnectionBetweenPorts("block-a/out-2", "block-b/in-2")).toBe(true);
    await expect(graph.findConnectionId({ sourceBlockId: "block-a", targetBlockId: "block-b" })).rejects.toThrow(
      /Several connections match/
    );
    expect(
      await graph.findConnectionId({
        sourceBlockId: "block-a",
        targetBlockId: "block-b",
        sourceAnchorId: "out-2",
        targetAnchorId: "in-2",
      })
    ).toBe("conn-2");
    // An anchor on one side narrows that side only.
    expect(
      await graph.findConnectionId({ sourceBlockId: "block-a", targetBlockId: "block-b", sourceAnchorId: "out-2" })
    ).toBe("conn-2");

    await second.hover();
    await expect.poll(() => graph.getCursor()).toBe("pointer");

    await second.click();
    expect(await graph.getSelectedConnectionIds()).toEqual(["conn-2"]);
    expect(await graph.connection("conn-1").isSelected()).toBe(false);
  });
});

test.describe("Public connection page objects: custom ports", () => {
  let graph: GraphPO;

  test.beforeEach(async ({ page }) => {
    // A port-only connection without an id: the store generates one.
    graph = await openGraph(
      page,
      [block("block-a", 100, 100)],
      [{ sourcePortId: "custom/source", targetPortId: "custom/target" }]
    );
    await graph.evaluate((instance) => {
      const positions = { "custom/source": { x: 150, y: 450 }, "custom/target": { x: 650, y: 550 } };
      for (const [id, point] of Object.entries(positions)) {
        const port = instance.connections.getPort(id);
        if (!port) throw new Error(`Port ${id} was not created by the connection.`);
        port.updatePort({ ...point, lookup: false });
      }
    });
    await graph.waitForFrames(2);
  });

  test("finds a port-only connection by its ports and interacts with it", async () => {
    const id = await graph.findConnectionId({ sourcePortId: "custom/source", targetPortId: "custom/target" });
    if (id === null) throw new Error("The port-only connection was not found.");
    const connection = graph.connection(id);

    expect(await connection.exists()).toBe(true);
    expect(await connection.getState()).toMatchObject({ sourcePortId: "custom/source", targetPortId: "custom/target" });
    expect(await graph.hasConnectionBetweenPorts("custom/source", "custom/target")).toBe(true);
    expect(await graph.hasConnectionBetweenPorts("custom/target", "custom/source")).toBe(false);
    expect(await graph.hasConnectionBetween("block-a", "block-a")).toBe(false);

    const midpoint = await connection.getPointOnCurve(0.5);
    expect(midpoint.x).toBeCloseTo(400, 0);
    expect(midpoint.y).toBeCloseTo(500, 0);

    await connection.hover();
    await expect.poll(() => graph.getCursor()).toBe("pointer");

    await connection.click();
    expect(await connection.isSelected()).toBe(true);
    expect(await graph.getSelectedConnectionIds()).toEqual([id]);
  });
});
