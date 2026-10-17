import { expect, test } from "@playwright/test";

import type { TBlock } from "@gravity-ui/graph";

import { GraphPageObject } from "../../page-objects/GraphPageObject";

import { ConnectionEditingPageObject } from "./ConnectionEditingPageObject";

/**
 *   [block-a]                 [block-b]
 *   in-a (IN), out-a (OUT)    in-b (IN), out-b (OUT)
 *
 *                [block-c]   (no anchors)
 */
const BLOCKS: TBlock[] = [
  {
    id: "block-a",
    is: "Block",
    x: 0,
    y: 0,
    width: 200,
    height: 100,
    name: "Block A",
    selected: false,
    anchors: [
      { id: "in-a", blockId: "block-a", type: "IN" },
      { id: "out-a", blockId: "block-a", type: "OUT" },
    ],
  },
  {
    id: "block-b",
    is: "Block",
    x: 500,
    y: 0,
    width: 200,
    height: 100,
    name: "Block B",
    selected: false,
    anchors: [
      { id: "in-b", blockId: "block-b", type: "IN" },
      { id: "out-b", blockId: "block-b", type: "OUT" },
    ],
  },
  {
    id: "block-c",
    is: "Block",
    x: 250,
    y: 300,
    width: 200,
    height: 100,
    name: "Block C",
    selected: false,
    anchors: [],
  },
];

let graphPO: GraphPageObject;
let layerPO: ConnectionEditingPageObject;

async function setup(page: import("@playwright/test").Page): Promise<void> {
  graphPO = new GraphPageObject(page);
  layerPO = new ConnectionEditingPageObject(page, graphPO);
  // Blocks are draggable, as in a typical editor: the camera does not pan when a drag starts on a block.
  await graphPO.initialize({ blocks: BLOCKS, connections: [], settings: { useBlocksAnchors: true, canDrag: "all" } });
}

async function isAnchorSelected(blockId: string, anchorId: string): Promise<boolean> {
  return graphPO.evaluate(
    (graph, ids) => Boolean(graph.blocks.getBlockState(ids.blockId)?.getAnchorById(ids.anchorId)?.$selected.value),
    { blockId, anchorId }
  );
}

async function isBlockSelected(blockId: string): Promise<boolean> {
  return (await graphPO.getSelectedBlockIds()).includes(blockId);
}

test.describe("ConnectionEditingLayer – anchors", () => {
  test.beforeEach(async ({ page }) => {
    await setup(page);
    await layerPO.addLayer();
    await layerPO.recordEvents();
  });

  test("dragging from an OUT anchor to an IN anchor of another block creates a connection", async () => {
    const from = await layerPO.getAnchorPoint("block-a", "out-a");
    const to = await layerPO.getAnchorPoint("block-b", "in-b");

    await graphPO.drag(from, to);

    expect(await graphPO.getConnections()).toEqual([
      expect.objectContaining({
        sourceBlockId: "block-a",
        sourceAnchorId: "out-a",
        targetBlockId: "block-b",
        targetAnchorId: "in-b",
      }),
    ]);

    const events = await layerPO.getEvents();
    const types = events.map((event) => event.type);
    expect(types[0]).toBe("connection-create-start");
    expect(types).toContain("connection-create-hover");
    expect(types.slice(-2)).toEqual(["connection-created", "connection-create-drop"]);
    expect(types).not.toContain("connection-create-cancel");
    expect(events[0]).toMatchObject({ blockId: "block-a", anchorId: "out-a", sourcePortId: "block-a/out-a" });
    expect(events.find((event) => event.type === "connection-create-drop")).toMatchObject({
      sourceAnchorId: "out-a",
      targetAnchorId: "in-b",
      hasPoint: true,
    });
    // Source and target highlights are cleared after the drop.
    expect(await isAnchorSelected("block-a", "out-a")).toBe(false);
    expect(await isAnchorSelected("block-b", "in-b")).toBe(false);
  });

  test("dragging from an IN anchor to an OUT anchor creates an OUT -> IN connection", async () => {
    const from = await layerPO.getAnchorPoint("block-a", "in-a");
    const to = await layerPO.getAnchorPoint("block-b", "out-b");

    await graphPO.drag(from, to);

    expect(await graphPO.getConnections()).toEqual([
      expect.objectContaining({
        sourceBlockId: "block-b",
        sourceAnchorId: "out-b",
        targetBlockId: "block-a",
        targetAnchorId: "in-a",
      }),
    ]);
    expect((await layerPO.getEvents()).find((event) => event.type === "connection-created")).toMatchObject({
      sourceAnchorId: "out-b",
      targetAnchorId: "in-a",
    });
  });

  test("anchors of the same block are not connected", async () => {
    const from = await layerPO.getAnchorPoint("block-a", "out-a");
    const to = await layerPO.getAnchorPoint("block-a", "in-a");

    await graphPO.drag(from, to);

    expect(await graphPO.getConnections()).toEqual([]);
    const types = await layerPO.getEventTypes();
    expect(types).not.toContain("connection-created");
    expect(types.at(-1)).toBe("connection-create-drop");
  });

  test("the source and then the hovered target are highlighted during the drag", async () => {
    const from = await layerPO.getAnchorPoint("block-a", "out-a");
    const to = await layerPO.getAnchorPoint("block-b", "in-b");

    await layerPO.pressAndMove(from, { x: 300, y: 200 });
    expect(await isAnchorSelected("block-a", "out-a")).toBe(true);
    // Anchors use single selection: the hovered target replaces the source highlight.
    await layerPO.moveTo(to);
    expect(await isAnchorSelected("block-b", "in-b")).toBe(true);
    await layerPO.release();
  });

  test("leaving a target emits a hover without a target and clears its highlight", async () => {
    const from = await layerPO.getAnchorPoint("block-a", "out-a");
    const to = await layerPO.getAnchorPoint("block-b", "in-b");

    await layerPO.pressAndMove(from, to);
    await layerPO.moveTo({ x: 300, y: 200 });
    expect(await isAnchorSelected("block-b", "in-b")).toBe(false);
    await layerPO.release();

    const hovers = (await layerPO.getEvents()).filter((event) => event.type === "connection-create-hover");
    expect(hovers.at(-2)).toMatchObject({ targetPortId: "block-b/in-b" });
    expect(hovers.at(-1)?.targetPortId).toBeUndefined();
    expect(await graphPO.getConnections()).toEqual([]);
  });

  test("a fast flick to a target still completes the connection", async () => {
    const from = await layerPO.getAnchorPoint("block-a", "out-a");
    const to = await layerPO.getAnchorPoint("block-b", "in-b");

    await layerPO.flick(from, to);

    expect(await graphPO.getConnections()).toHaveLength(1);
    expect((await layerPO.getEventTypes()).at(-1)).toBe("connection-create-drop");
    expect(await isAnchorSelected("block-a", "out-a")).toBe(false);
  });

  test("clicking an anchor without dragging emits nothing, even on Escape or layer removal", async ({ page }) => {
    await layerPO.click(await layerPO.getAnchorPoint("block-a", "out-a"));
    await page.keyboard.press("Escape");
    await layerPO.removeLayer();

    expect(await layerPO.getEventTypes()).toEqual([]);
  });

  test("removing the layer before the drag threshold drops the pending drag", async () => {
    const from = await layerPO.getAnchorPoint("block-a", "out-a");
    const to = await layerPO.getAnchorPoint("block-b", "in-b");

    await layerPO.press(from);
    await layerPO.removeLayer();
    await layerPO.moveTo(to);
    await layerPO.release();

    expect(await layerPO.getEventTypes()).toEqual([]);
    expect(await graphPO.getConnections()).toEqual([]);
    expect(await isAnchorSelected("block-a", "out-a")).toBe(false);
  });

  test("Escape before the drag threshold drops the pending drag", async ({ page }) => {
    const from = await layerPO.getAnchorPoint("block-a", "out-a");
    const to = await layerPO.getAnchorPoint("block-b", "in-b");

    await layerPO.press(from);
    await page.keyboard.press("Escape");
    await layerPO.moveTo(to);
    await layerPO.release();

    expect(await layerPO.getEventTypes()).toEqual([]);
    expect(await graphPO.getConnections()).toEqual([]);
  });

  test("removing the layer mid-drag cancels the connection", async () => {
    const from = await layerPO.getAnchorPoint("block-a", "out-a");
    const to = await layerPO.getAnchorPoint("block-b", "in-b");

    await layerPO.pressAndMove(from, to);
    await layerPO.removeLayer();
    await layerPO.release();

    expect(await graphPO.getConnections()).toEqual([]);
    const types = await layerPO.getEventTypes();
    expect(types.filter((type) => type === "connection-create-cancel")).toHaveLength(1);
    expect(types).not.toContain("connection-create-drop");
    expect(await isAnchorSelected("block-b", "in-b")).toBe(false);
  });

  test("preventDefault on connection-create-start skips the source highlight", async () => {
    await layerPO.preventDefault("connection-create-start");
    const from = await layerPO.getAnchorPoint("block-a", "out-a");
    const to = await layerPO.getAnchorPoint("block-b", "in-b");

    await layerPO.pressAndMove(from, { x: from.x + 100, y: from.y + 150 });
    expect(await isAnchorSelected("block-a", "out-a")).toBe(false);
    await layerPO.moveTo(to);
    await layerPO.release();
    // Start only controls the highlight: the connection is still created.
    expect(await graphPO.getConnections()).toHaveLength(1);
  });

  test("preventDefault on connection-create-hover skips the target highlight", async () => {
    await layerPO.preventDefault("connection-create-hover");
    const from = await layerPO.getAnchorPoint("block-a", "out-a");
    const to = await layerPO.getAnchorPoint("block-b", "in-b");

    await layerPO.pressAndMove(from, to);
    expect(await isAnchorSelected("block-b", "in-b")).toBe(false);
    await layerPO.release();
    // Hover only controls the highlight: the connection is still created.
    expect(await graphPO.getConnections()).toHaveLength(1);
  });

  test("preventDefault on connection-created keeps the store unchanged", async () => {
    await layerPO.preventDefault("connection-created");
    const from = await layerPO.getAnchorPoint("block-a", "out-a");
    const to = await layerPO.getAnchorPoint("block-b", "in-b");

    await graphPO.drag(from, to);

    expect(await graphPO.getConnections()).toEqual([]);
    expect((await layerPO.getEventTypes()).slice(-2)).toEqual(["connection-created", "connection-create-drop"]);
  });

  test("dropping on empty space emits a drop without a target", async () => {
    const from = await layerPO.getAnchorPoint("block-a", "out-a");

    await graphPO.drag(from, { x: 300, y: 200 });

    expect(await graphPO.getConnections()).toEqual([]);
    const drop = (await layerPO.getEvents()).at(-1);
    expect(drop).toMatchObject({ type: "connection-create-drop", sourceAnchorId: "out-a", hasPoint: true });
    expect(drop?.targetBlockId).toBeUndefined();
  });

  test("Escape cancels the drag", async ({ page }) => {
    const from = await layerPO.getAnchorPoint("block-a", "out-a");
    const to = await layerPO.getAnchorPoint("block-b", "in-b");

    await layerPO.pressAndMove(from, to);
    await page.keyboard.press("Escape");
    await layerPO.release();

    expect(await graphPO.getConnections()).toEqual([]);
    const types = await layerPO.getEventTypes();
    expect(types.filter((type) => type === "connection-create-cancel")).toHaveLength(1);
    expect(types).not.toContain("connection-created");
    expect(types).not.toContain("connection-create-drop");
    expect(await isAnchorSelected("block-a", "out-a")).toBe(false);
    expect(await isAnchorSelected("block-b", "in-b")).toBe(false);
  });

  test("repeating the same drag does not duplicate the connection", async () => {
    const from = await layerPO.getAnchorPoint("block-a", "out-a");
    const to = await layerPO.getAnchorPoint("block-b", "in-b");

    await graphPO.drag(from, to);
    await graphPO.drag(from, to);

    expect(await graphPO.getConnections()).toHaveLength(1);
  });
});

test.describe("ConnectionEditingLayer – blocks", () => {
  test.beforeEach(async ({ page }) => {
    await setup(page);
    await layerPO.addLayer();
    await layerPO.recordEvents();
  });

  test("Shift + drag from a block to another block creates a block connection", async ({ page }) => {
    const from = await graphPO.block("block-a").getCenter();
    const to = await graphPO.block("block-c").getCenter();

    await page.keyboard.down("Shift");
    await graphPO.drag(from, to);
    await page.keyboard.up("Shift");

    const connections = await graphPO.getConnections();
    expect(connections).toHaveLength(1);
    expect(connections[0]).toMatchObject({ sourceBlockId: "block-a", targetBlockId: "block-c" });
    expect(connections[0].sourceAnchorId).toBeUndefined();
    expect(connections[0].targetAnchorId).toBeUndefined();
    expect(await graphPO.block("block-a").getGeometry()).toMatchObject({ x: 0, y: 0 });
    expect((await layerPO.getEvents()).find((event) => event.type === "connection-created")).toMatchObject({
      sourceBlockId: "block-a",
      targetBlockId: "block-c",
    });
  });

  test("a block to anchor drop does not create a connection", async ({ page }) => {
    const from = await graphPO.block("block-c").getCenter();
    const to = await layerPO.getAnchorPoint("block-b", "in-b");

    await page.keyboard.down("Shift");
    await graphPO.drag(from, to);
    await page.keyboard.up("Shift");

    expect(await graphPO.getConnections()).toEqual([]);
  });

  test("dragging a block without Shift moves it", async () => {
    const from = await graphPO.block("block-c").getCenter();

    await graphPO.drag(from, { x: from.x + 100, y: from.y + 50 });

    expect(await graphPO.getConnections()).toEqual([]);
    expect(await layerPO.getEventTypes()).toEqual([]);
    expect(await graphPO.block("block-c").getGeometry()).toMatchObject({ x: 350, y: 350 });
  });
});

test.describe("ConnectionEditingLayer – ports and snapping", () => {
  const SNAPPABLE = [
    { blockId: "block-a", anchorId: "out-a" },
    { blockId: "block-b", anchorId: "in-b" },
  ];

  test.beforeEach(async ({ page }) => {
    await setup(page);
  });

  test("the endpoint snaps to a connection port within the search radius", async () => {
    await layerPO.addLayer();
    await layerPO.makeAnchorPortsSnappable(SNAPPABLE);
    await layerPO.recordEvents();
    const from = await layerPO.getAnchorPoint("block-a", "out-a");
    const to = await layerPO.getAnchorPoint("block-b", "in-b");

    // 15px away from the port: outside the anchor's hit box, inside the default 20px radius.
    await graphPO.drag(from, { x: to.x - 15, y: to.y + 5 });

    expect(await graphPO.getConnections()).toEqual([
      expect.objectContaining({ sourceAnchorId: "out-a", targetAnchorId: "in-b" }),
    ]);
    expect((await layerPO.getEvents()).find((event) => event.type === "connection-created")).toMatchObject({
      sourcePortId: "block-a/out-a",
      targetPortId: "block-b/in-b",
    });
  });

  test("snapCondition in port meta rejects a target", async () => {
    await layerPO.addLayer();
    await layerPO.makeAnchorPortsSnappable(SNAPPABLE, { rejectAll: true });
    const from = await layerPO.getAnchorPoint("block-a", "out-a");
    const to = await layerPO.getAnchorPoint("block-b", "in-b");

    await graphPO.drag(from, { x: to.x - 15, y: to.y + 5 });

    expect(await graphPO.getConnections()).toEqual([]);
  });

  test("isConnectionAllowed rejects a snapping target", async () => {
    await layerPO.addLayer({ rejectTargetPortIds: ["block-b/in-b"] });
    await layerPO.makeAnchorPortsSnappable(SNAPPABLE);
    const from = await layerPO.getAnchorPoint("block-a", "out-a");
    const to = await layerPO.getAnchorPoint("block-b", "in-b");

    await graphPO.drag(from, { x: to.x - 15, y: to.y + 5 });

    expect(await graphPO.getConnections()).toEqual([]);
  });

  test("canStart can restrict sources to connection ports", async () => {
    await layerPO.addLayer({ portSourcesOnly: true });
    await layerPO.makeAnchorPortsSnappable(SNAPPABLE);
    await layerPO.recordEvents();

    // in-a has no connection meta: it starts nothing.
    await graphPO.drag(
      await layerPO.getAnchorPoint("block-a", "in-a"),
      await layerPO.getAnchorPoint("block-b", "out-b")
    );
    expect(await layerPO.getEventTypes()).toEqual([]);

    await graphPO.drag(
      await layerPO.getAnchorPoint("block-a", "out-a"),
      await layerPO.getAnchorPoint("block-b", "in-b")
    );
    expect(await graphPO.getConnections()).toHaveLength(1);
  });

  test("isConnectionAllowed rejects a target", async () => {
    await layerPO.addLayer({ rejectTargetPortIds: ["block-b/in-b"] });
    await layerPO.recordEvents();
    const from = await layerPO.getAnchorPoint("block-a", "out-a");
    const to = await layerPO.getAnchorPoint("block-b", "in-b");

    await graphPO.drag(from, to);

    expect(await graphPO.getConnections()).toEqual([]);
    expect((await layerPO.getEvents()).at(-1)?.targetPortId).toBeUndefined();
  });
});

test.describe("ConnectionEditingLayer – anchor drag contract", () => {
  test.beforeEach(async ({ page }) => {
    await setup(page);
  });

  async function dragAnchorBy(dx: number, dy: number): Promise<void> {
    const from = await layerPO.getAnchorPoint("block-b", "out-b");
    await graphPO.drag(from, { x: from.x + dx, y: from.y + dy });
  }

  test("without the layer, dragging an anchor moves its block", async () => {
    await dragAnchorBy(0, 120);

    expect(await graphPO.block("block-b").getGeometry()).toMatchObject({ x: 500, y: 120 });
  });

  test("with the layer enabled, dragging an anchor never moves its block", async () => {
    await layerPO.addLayer();

    await dragAnchorBy(0, 120);

    expect(await graphPO.block("block-b").getGeometry()).toMatchObject({ x: 500, y: 0 });
  });

  test("an anchor rejected as a source still does not move its block", async () => {
    await layerPO.addLayer();
    await layerPO.recordEvents();
    await graphPO.evaluate((graph) => {
      const layer = (window as Window & { connectionEditingLayer?: { setProps(p: object): void } })
        .connectionEditingLayer;
      layer?.setProps({ canStart: () => false });
    });

    await dragAnchorBy(0, 120);

    expect(await layerPO.getEventTypes()).toEqual([]);
    expect(await graphPO.block("block-b").getGeometry()).toMatchObject({ x: 500, y: 0 });
  });

  test("with captureAnchors: false, an anchor that starts no connection moves its block", async () => {
    await layerPO.addLayer({ captureAnchors: false });
    await graphPO.evaluate((graph) => {
      const layer = (window as Window & { connectionEditingLayer?: { setProps(p: object): void } })
        .connectionEditingLayer;
      layer?.setProps({ canStart: () => false });
    });

    await dragAnchorBy(0, 120);

    expect(await graphPO.block("block-b").getGeometry()).toMatchObject({ x: 500, y: 120 });
  });

  test("with the layer disabled, dragging an anchor moves its block and creates nothing", async () => {
    await layerPO.addLayer({ enabled: false });
    await layerPO.recordEvents();

    await dragAnchorBy(0, 120);

    expect(await graphPO.block("block-b").getGeometry()).toMatchObject({ x: 500, y: 120 });
    expect(await layerPO.getEventTypes()).toEqual([]);
  });

  test("disable() / enable() survive unrelated settings updates", async () => {
    await layerPO.addLayer();
    const from = await layerPO.getAnchorPoint("block-a", "out-a");
    const to = await layerPO.getAnchorPoint("block-b", "in-b");

    await layerPO.setEnabled(false);
    // An unrelated settings update; canDrag "none" also keeps block A in place during the drag.
    await graphPO.evaluate((graph) => graph.updateSettings({ canDrag: window.GraphModule.ECanDrag.NONE }));
    await graphPO.drag(from, to);
    expect(await graphPO.getConnections()).toEqual([]);
    expect(await graphPO.block("block-a").getGeometry()).toMatchObject({ x: 0, y: 0 });

    await layerPO.setEnabled(true);
    await graphPO.evaluate((graph) => graph.updateSettings({ canDrag: window.GraphModule.ECanDrag.ALL }));
    await graphPO.drag(from, to);
    expect(await graphPO.getConnections()).toHaveLength(1);
  });
});

test.describe("ConnectionEditingLayer – entity replacement during the drag", () => {
  test.beforeEach(async ({ page }) => {
    await setup(page);
    await layerPO.addLayer();
    await layerPO.recordEvents();
  });

  test("removing the source block mid-drag cancels once and clears the target highlight", async () => {
    const from = await layerPO.getAnchorPoint("block-a", "out-a");
    const to = await layerPO.getAnchorPoint("block-b", "in-b");

    await layerPO.pressAndMove(from, to);
    expect(await isAnchorSelected("block-b", "in-b")).toBe(true);
    await graphPO.evaluate((graph) => graph.blocks.deleteBlocks(["block-a"]));
    await layerPO.pressAndMove(to, { x: to.x + 5, y: to.y + 5 });
    await layerPO.release();

    expect(await graphPO.getConnections()).toEqual([]);
    const types = await layerPO.getEventTypes();
    expect(types.filter((type) => type === "connection-create-cancel")).toHaveLength(1);
    expect(types).not.toContain("connection-created");
    expect(await isAnchorSelected("block-b", "in-b")).toBe(false);
  });

  test("a connection-created handler that replaces the target block prevents the connection", async () => {
    await graphPO.evaluate((graph) => {
      graph.on("connection-created", () => {
        const block = graph.blocks.getBlock("block-b");
        if (!block) return;
        graph.blocks.deleteBlocks(["block-b"]);
        graph.api.addBlock(block);
      });
    });
    const from = await layerPO.getAnchorPoint("block-a", "out-a");
    const to = await layerPO.getAnchorPoint("block-b", "in-b");

    await graphPO.drag(from, to);

    expect(await graphPO.getConnections()).toEqual([]);
  });

  test("a connection-create-start handler that replaces the source block does not select the replacement", async ({
    page,
  }) => {
    await graphPO.evaluate((graph) => {
      graph.on("connection-create-start", () => {
        const block = graph.blocks.getBlock("block-c");
        if (!block) return;
        graph.blocks.deleteBlocks(["block-c"]);
        graph.api.addBlock(block);
      });
    });
    const from = await graphPO.block("block-c").getCenter();

    await page.keyboard.down("Shift");
    await layerPO.pressAndMove(from, { x: from.x + 100, y: from.y + 100 });
    expect(await isBlockSelected("block-c")).toBe(false);
    await layerPO.release();
    await page.keyboard.up("Shift");
  });
});
