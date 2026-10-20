import { expect, test } from "@playwright/test";

import type { TBlock } from "@gravity-ui/graph";
import type { GraphPoint } from "@gravity-ui/graph-playwright";

import { UikitPageObject } from "./UikitPageObject";

const BLOCKS: TBlock[] = [
  {
    id: "block-a",
    is: "Block",
    name: "A",
    x: 0,
    y: 0,
    width: 200,
    height: 100,
    anchors: [{ id: "out-a", blockId: "block-a", type: "OUT" }],
  },
  {
    id: "block-b",
    is: "Block",
    name: "B",
    x: 500,
    y: 0,
    width: 200,
    height: 100,
    anchors: [{ id: "in-b", blockId: "block-b", type: "IN" }],
  },
];

/** World position of an anchor's port. */
async function anchorPoint(graph: UikitPageObject, blockId: string, anchorId: string): Promise<GraphPoint> {
  return graph.evaluate(
    (g, ids) => {
      const portId = window.UikitModule.createAnchorPortId(ids.blockId, ids.anchorId);
      const port = g.connections.getPort(portId);
      if (!port) throw new Error(`Port ${String(portId)} not found`);
      return port.getPoint();
    },
    { blockId, anchorId }
  );
}

test.describe("graph-uikit edit mode", () => {
  test("block endpoints: Shift+drag between blocks creates a connection", async ({ page }) => {
    const graph = new UikitPageObject(page);
    await graph.open({ blocks: BLOCKS }, { mode: "edit" });
    await graph.camera().zoomToScale(0.5);

    await page.keyboard.down("Shift");
    await graph.drag(await graph.block("block-a").getCenter(), await graph.block("block-b").getCenter());
    await page.keyboard.up("Shift");

    expect(await graph.getConnections()).toEqual([
      expect.objectContaining({ sourceBlockId: "block-a", targetBlockId: "block-b" }),
    ]);
  });

  test("port endpoints: dragging anchor to anchor creates a connection", async ({ page }) => {
    const graph = new UikitPageObject(page);
    await graph.open({ blocks: BLOCKS, settings: { useBlocksAnchors: true } }, { mode: "edit" });
    await graph.camera().zoomToScale(0.5);

    await graph.drag(await anchorPoint(graph, "block-a", "out-a"), await anchorPoint(graph, "block-b", "in-b"));

    expect(await graph.getConnections()).toEqual([
      expect.objectContaining({ sourceBlockId: "block-a", sourceAnchorId: "out-a", targetBlockId: "block-b" }),
    ]);
  });

  test("switching from view to edit at runtime enables connection creation", async ({ page }) => {
    const graph = new UikitPageObject(page);
    await graph.open({ blocks: BLOCKS, settings: { useBlocksAnchors: true } }, { mode: "view" });
    await graph.camera().zoomToScale(0.5);

    await graph.setMode("edit");
    await graph.drag(await anchorPoint(graph, "block-a", "out-a"), await anchorPoint(graph, "block-b", "in-b"));

    expect(await graph.getConnections()).toEqual([
      expect.objectContaining({ sourceBlockId: "block-a", sourceAnchorId: "out-a", targetBlockId: "block-b" }),
    ]);
  });

  test("view mode creates no connections and does not move blocks", async ({ page }) => {
    const graph = new UikitPageObject(page);
    await graph.open({ blocks: BLOCKS, settings: { useBlocksAnchors: true } }, { mode: "view" });
    await graph.camera().zoomToScale(0.5);
    const before = await graph.block("block-a").getGeometry();

    await graph.drag(await anchorPoint(graph, "block-a", "out-a"), await anchorPoint(graph, "block-b", "in-b"));
    await graph.drag(await graph.block("block-a").getCenter(), { x: 100, y: 300 });

    expect(await graph.getConnections()).toEqual([]);
    expect(await graph.block("block-a").getGeometry()).toEqual(before);
  });
});
