import { expect, test } from "@playwright/test";

import type { TBlock, TConnection } from "@gravity-ui/graph";

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
    anchors: [],
  },
];

let graphPO: GraphPageObject;
let layerPO: ConnectionEditingPageObject;

/**
 * At 0.5 by default, the schematic level, where canvas anchors are shown and so hit (D4); `zoomTo("center")` alone
 * clamps to `scaleMax` 1 for this scene, the detailed level, where anchors without an HTML view are not hit.
 */
async function setup(page: import("@playwright/test").Page, scale = 0.5): Promise<void> {
  graphPO = new GraphPageObject(page);
  layerPO = new ConnectionEditingPageObject(page, graphPO);
  // Blocks are draggable, as in a typical editor: the camera does not pan when a drag starts on a block.
  await graphPO.initialize({ blocks: BLOCKS, connections: [], settings: { useBlocksAnchors: true, canDrag: "all" } });
  await graphPO.camera().zoomToScale(scale);
}

async function isAnchorSelected(blockId: string, anchorId: string): Promise<boolean> {
  return graphPO.evaluate(
    (graph, ids) => Boolean(graph.blocks.getBlockState(ids.blockId)?.getAnchorById(ids.anchorId)?.$selected.value),
    { blockId, anchorId }
  );
}

/** The connection's endpoint fields that are set, to assert one addressing mode and the absence of the other. */
function endpointFields(connection: TConnection | undefined): Partial<TConnection> {
  const fields: Partial<TConnection> = {};
  for (const key of [
    "sourceBlockId",
    "sourceAnchorId",
    "targetBlockId",
    "targetAnchorId",
    "sourcePortId",
    "targetPortId",
  ] as const) {
    if (connection?.[key] !== undefined) Object.assign(fields, { [key]: connection[key] });
  }
  return fields;
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

    // Block mode with anchors: no port IDs.
    const connections = await graphPO.getConnections();
    expect(connections).toHaveLength(1);
    expect(endpointFields(connections[0])).toEqual({
      sourceBlockId: "block-a",
      sourceAnchorId: "out-a",
      targetBlockId: "block-b",
      targetAnchorId: "in-b",
    });

    const events = await layerPO.getEvents();
    const types = events.map((event) => event.type);
    expect(types[0]).toBe("connection-create-start");
    expect(types).toContain("connection-create-hover");
    expect(types.slice(-2)).toEqual(["connection-created", "connection-create-drop"]);
    expect(types).not.toContain("connection-create-cancel");
    expect(events[0]).toMatchObject({
      blockId: "block-a",
      anchorId: "out-a",
      sourcePortId: await layerPO.anchorPortId("block-a", "out-a"),
    });
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

    const connections = await graphPO.getConnections();
    expect(connections).toHaveLength(1);
    expect(endpointFields(connections[0])).toEqual({
      sourceBlockId: "block-b",
      sourceAnchorId: "out-b",
      targetBlockId: "block-a",
      targetAnchorId: "in-a",
    });
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
    expect(hovers.at(-2)).toMatchObject({ targetPortId: await layerPO.anchorPortId("block-b", "in-b") });
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

  test("a captured port drops once outside the graph and clears its last snap target", async ({ page }) => {
    await page.locator("#root").evaluate((root) => {
      root.style.height = "70vh";
    });
    await graphPO.waitForFrames(2);
    const from = await layerPO.getAnchorPoint("block-a", "out-a");
    const to = await layerPO.getAnchorPoint("block-b", "in-b");
    await layerPO.pressAndMove(from, to);
    expect(await isAnchorSelected("block-b", "in-b")).toBe(true);
    const outside = await page.locator("#root").evaluate((root) => {
      const { left, bottom } = root.getBoundingClientRect();
      return { x: left + 20, y: bottom + 30 };
    });
    await page.mouse.move(outside.x, outside.y);
    await page.mouse.up();
    await graphPO.waitForFrames(2);
    expect(await graphPO.evaluate((graph) => graph.input.$hoveredComponent.value?.getEntityId())).toBeUndefined();
    const drops = (await layerPO.getEvents()).filter((record) => record.type === "connection-create-drop");
    expect(drops).toHaveLength(1);
    expect(drops[0].targetBlockId).toBeUndefined();
    expect(await graphPO.getConnections()).toEqual([]);
    expect(await isAnchorSelected("block-b", "in-b")).toBe(false);
  });

  for (const reason of ["pointercancel", "lost capture", "graph stop", "window blur"] as const) {
    test(`${reason} cancels the port owner once and a later release saves nothing`, async ({ page }) => {
      const mouse = await page.evaluateHandle(() => {
        const held = { id: 0, element: null as Element | null };
        window.graph.on(
          "press",
          ({ event }) => {
            held.id = event.pointerId;
            if (event.target instanceof Element) held.element = event.target;
          },
          { once: true }
        );
        return held;
      });
      const from = await layerPO.getAnchorPoint("block-a", "out-a");
      const to = await layerPO.getAnchorPoint("block-b", "in-b");
      await layerPO.pressAndMove(from, to);
      expect(await isAnchorSelected("block-b", "in-b")).toBe(true);
      await mouse.evaluate(({ element, id }, action) => {
        if (!element?.hasPointerCapture(id)) throw new Error("The port drag did not capture its mouse");
        if (action === "lost capture") element.releasePointerCapture(id);
        else if (action === "graph stop") window.graph.stop();
        else if (action === "window blur") window.dispatchEvent(new Event("blur"));
        else
          element.dispatchEvent(
            new PointerEvent("pointercancel", { pointerId: id, pointerType: "mouse", bubbles: true })
          );
      }, reason);
      await layerPO.moveTo(to);
      await page.mouse.up();
      await mouse.dispose();
      const events = await layerPO.getEventTypes();
      expect(events.filter((type) => type === "connection-create-cancel")).toHaveLength(1);
      expect(events).not.toContain("connection-create-drop");
      expect(await graphPO.getConnections()).toEqual([]);
      expect(await isAnchorSelected("block-b", "in-b")).toBe(false);
      expect(await graphPO.evaluate((graph) => graph.cameraService.getCameraState().autoPanningEnabled)).toBe(false);
    });
  }

  test("keeps the port owner through a second mouse button and commits on release of the initiating button", async ({
    page,
  }) => {
    const from = await layerPO.getAnchorPoint("block-a", "out-a");
    const to = await layerPO.getAnchorPoint("block-b", "in-b");
    await layerPO.pressAndMove(from, to);
    await page.mouse.down({ button: "right" });
    await page.mouse.up({ button: "right" });
    expect(await graphPO.getConnections()).toEqual([]);
    await page.mouse.down({ button: "right" });
    await page.mouse.up({ button: "left" });
    expect(await graphPO.getConnections()).toHaveLength(1);
    await page.mouse.up({ button: "right" });
    expect((await layerPO.getEventTypes()).filter((type) => type === "connection-create-drop")).toHaveLength(1);
  });

  test("clicking an anchor without dragging emits nothing, even on Escape or layer removal", async ({ page }) => {
    await graphPO.clickAt(await layerPO.getAnchorPoint("block-a", "out-a"));
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

  test("disabling the layer cancels an active drag and clears the highlights", async () => {
    const from = await layerPO.getAnchorPoint("block-a", "out-a");
    const to = await layerPO.getAnchorPoint("block-b", "in-b");

    await layerPO.pressAndMove(from, to);
    await layerPO.setEnabled(false);
    await layerPO.release();

    const types = await layerPO.getEventTypes();
    expect(types.filter((type) => type === "connection-create-cancel")).toHaveLength(1);
    expect(types).not.toContain("connection-create-drop");
    expect(await graphPO.getConnections()).toEqual([]);
    expect(await isAnchorSelected("block-a", "out-a")).toBe(false);
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

  test("an HTML control can consume Escape during a connection drag", async ({ page }) => {
    const from = await layerPO.getAnchorPoint("block-a", "out-a");
    const to = await layerPO.getAnchorPoint("block-b", "in-b");
    await layerPO.pressAndMove(from, to);
    expect(await layerPO.getEventTypes()).toContain("connection-create-start");

    await page.evaluate(() => {
      const input = document.body.appendChild(document.createElement("input"));
      input.setAttribute("aria-label", "Connection options");
      Object.assign(input.style, { position: "fixed", top: "0", left: "0" });
      input.addEventListener("keydown", (event) => {
        if (event.key === "Escape") event.preventDefault();
      });
      input.focus({ preventScroll: true });
    });
    await page.getByRole("textbox", { name: "Connection options" }).press("Escape");
    expect(await layerPO.getEventTypes()).not.toContain("connection-create-cancel");
    await layerPO.release();

    expect(await graphPO.getConnections()).toHaveLength(1);
    expect((await layerPO.getEventTypes()).slice(-2)).toEqual(["connection-created", "connection-create-drop"]);
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

    // Block mode without anchors: only block IDs.
    const connections = await graphPO.getConnections();
    expect(connections).toHaveLength(1);
    expect(endpointFields(connections[0])).toEqual({ sourceBlockId: "block-a", targetBlockId: "block-c" });
    expect(await graphPO.block("block-a").getGeometry()).toMatchObject({ x: 0, y: 0 });
    const created = (await layerPO.getEvents()).find((event) => event.type === "connection-created");
    expect(created).toMatchObject({
      sourceBlockId: "block-a",
      targetBlockId: "block-c",
      sourcePortId: await layerPO.blockPointPortId("block-a", false),
      targetPortId: await layerPO.blockPointPortId("block-c", true),
    });
    expect(created?.sourceAnchorId).toBeUndefined();
    expect(created?.targetAnchorId).toBeUndefined();
  });

  test("a block to anchor drop does not create a connection", async ({ page }) => {
    const from = await graphPO.block("block-c").getCenter();
    const to = await layerPO.getAnchorPoint("block-b", "in-b");

    await page.keyboard.down("Shift");
    await graphPO.drag(from, to);
    await page.keyboard.up("Shift");

    expect(await graphPO.getConnections()).toEqual([]);
  });

  // https://github.com/gravity-ui/graph/issues/405: the layer prevents the press before the camera pans.
  test("Shift + drag from a non-draggable block does not pan the camera", async ({ page }) => {
    await graphPO.evaluate((graph) => graph.updateSettings({ canDrag: window.GraphModule.ECanDrag.NONE }));
    const cameraBefore = await graphPO.camera().getState();
    const from = await graphPO.block("block-a").getCenter();
    const to = await graphPO.block("block-c").getCenter();

    await page.keyboard.down("Shift");
    await graphPO.drag(from, to);
    await page.keyboard.up("Shift");

    expect(await graphPO.camera().getState()).toMatchObject({ x: cameraBefore.x, y: cameraBefore.y });
    const connections = await graphPO.getConnections();
    expect(connections).toHaveLength(1);
    expect(endpointFields(connections[0])).toEqual({ sourceBlockId: "block-a", targetBlockId: "block-c" });
  });

  test("dragging a block without Shift moves it", async () => {
    const from = await graphPO.block("block-c").getCenter();

    await graphPO.drag(from, { x: from.x + 100, y: from.y + 50 });

    expect(await graphPO.getConnections()).toEqual([]);
    expect(await layerPO.getEventTypes()).toEqual([]);
    expect(await graphPO.block("block-c").getGeometry()).toMatchObject({ x: 350, y: 350 });
  });
});

test.describe("ConnectionEditingLayer – the detailed level without HTML (D4)", () => {
  test.beforeEach(async ({ page }) => {
    await setup(page, 1);
    await layerPO.addLayer();
    await layerPO.recordEvents();
  });

  test("a plain anchor starts no connection: the press is the block's, which drags", async () => {
    const from = await layerPO.getAnchorPoint("block-a", "out-a");
    await graphPO.drag(from, { x: from.x, y: from.y + 150 });
    expect(await graphPO.getConnections()).toEqual([]);
    expect(await layerPO.getEventTypes()).toEqual([]);
    expect(await graphPO.block("block-a").getGeometry()).toMatchObject({ x: 0, y: 150 });
  });

  test("a block gesture dropped on a plain anchor's point connects to the block", async ({ page }) => {
    const from = await graphPO.block("block-c").getCenter();
    const to = await layerPO.getAnchorPoint("block-b", "in-b");
    await page.keyboard.down("Shift");
    await graphPO.drag(from, to);
    await page.keyboard.up("Shift");
    // At the schematic level this drop targets the anchor and is rejected ("a block to anchor drop ...").
    const connections = await graphPO.getConnections();
    expect(connections).toHaveLength(1);
    expect(endpointFields(connections[0])).toEqual({ sourceBlockId: "block-c", targetBlockId: "block-b" });
  });

  test("snappable anchor ports still connect through the block's port map", async () => {
    await layerPO.makeAnchorPortsSnappable([
      { blockId: "block-a", anchorId: "out-a" },
      { blockId: "block-b", anchorId: "in-b" },
    ]);
    const from = await layerPO.getAnchorPoint("block-a", "out-a");
    const to = await layerPO.getAnchorPoint("block-b", "in-b");
    await graphPO.drag(from, { x: to.x - 15, y: to.y + 5 });
    expect(await graphPO.getConnections()).toEqual([
      expect.objectContaining({ sourceAnchorId: "out-a", targetAnchorId: "in-b" }),
    ]);
  });
});

for (const duplicateFirst of [false, true]) {
  test(`unassigned Alt+Shift and conflicting drag claims keep the graph still (duplicate first: ${duplicateFirst})`, async ({
    page,
  }) => {
    await setup(page);
    const addCopy = () =>
      graphPO.evaluate((graph) => {
        graph.addLayer(window.GraphModule.DuplicateBlockLayer, {});
      });
    if (duplicateFirst) await addCopy();
    await layerPO.addLayer();
    if (!duplicateFirst) await addCopy();
    await layerPO.recordEvents();
    const warnings: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "warning") warnings.push(message.text());
    });
    const camera = await graphPO.camera().getState();
    const block = await graphPO.block("block-a").getGeometry();
    await page.keyboard.down("Alt");
    await page.keyboard.down("Shift");
    await graphPO.drag({ x: 100, y: 50 }, { x: 600, y: 50 });
    await page.keyboard.up("Shift");
    await page.keyboard.up("Alt");
    expect(warnings.filter((line) => line.includes("Conflicting graph drag claims"))).toEqual([]);
    expect(await layerPO.getEventTypes()).toEqual([]);
    expect(await graphPO.evaluate((graph) => graph.blocks.toJSON().length)).toBe(BLOCKS.length);
    expect(await graphPO.block("block-a").getGeometry()).toEqual(block);
    // An application can independently bind the same Shift drag as the connected editing layer.
    const started = await page.evaluateHandle(() => {
      const calls: string[] = [];
      window.graph.on("dragstart", (event) => {
        if (event.pressEvent.shiftKey) event.claim({ owner: "AppTool", start: () => calls.push("start") });
      });
      return calls;
    });
    await page.keyboard.down("Shift");
    await graphPO.drag({ x: 100, y: 50 }, { x: 600, y: 50 });
    await page.keyboard.up("Shift");
    expect(await started.jsonValue()).toEqual([]);
    await started.dispose();
    expect(await layerPO.getEventTypes()).toEqual([]);
    expect(await graphPO.getConnections()).toEqual([]);
    expect(await graphPO.evaluate((graph) => graph.blocks.toJSON().length)).toBe(BLOCKS.length);
    expect(await graphPO.block("block-a").getGeometry()).toEqual(block);
    expect(await graphPO.camera().getState()).toEqual(camera);
    expect(warnings.filter((line) => line.includes("ConnectionEditingLayer") && line.includes("AppTool"))).toHaveLength(
      1
    );
  });
}

test.describe("ConnectionEditingLayer – port addressing mode", () => {
  test.beforeEach(async ({ page }) => {
    await setup(page);
    await layerPO.addLayer();
  });

  async function expectPortModeCreated(sourcePortId: string, targetPortId: string): Promise<void> {
    // Port mode: only port IDs, no block or anchor IDs, in the store and in the event.
    const connections = await graphPO.getConnections();
    expect(connections).toHaveLength(1);
    expect(endpointFields(connections[0])).toEqual({ sourcePortId, targetPortId });
    const events = await layerPO.getEvents();
    for (const type of ["connection-created", "connection-create-drop"]) {
      const event = events.find((recorded) => recorded.type === type);
      expect(event).toBeDefined();
      for (const key of ["sourceBlockId", "sourceAnchorId", "targetBlockId", "targetAnchorId"] as const) {
        expect(event?.[key], `${type}.${key}`).toBeUndefined();
      }
    }
    expect(events.find((event) => event.type === "connection-created")).toMatchObject({ sourcePortId, targetPortId });
  }

  test("a custom component port connects to another custom component port by port IDs", async () => {
    await layerPO.addGroups([
      { id: "group-src", rect: { x: 0, y: 150, width: 180, height: 120 } },
      { id: "group-dst", rect: { x: 520, y: 150, width: 180, height: 120 } },
    ]);
    await layerPO.addCustomPort({ groupId: "group-src" }, "group-src-out", { x: 160, y: 210 });
    await layerPO.addCustomPort({ groupId: "group-dst" }, "group-dst-in", { x: 540, y: 210 });
    await layerPO.recordEvents();

    await graphPO.drag({ x: 160, y: 210 }, { x: 540, y: 210 });

    await expectPortModeCreated("group-src-out", "group-dst-in");
  });

  test("the connection layer owns the mouse port drag at five CSS pixels and releases it once", async ({ page }) => {
    const from = { x: 150, y: 70 };
    const to = { x: 550, y: 70 };
    await layerPO.addCustomPort({ blockId: "block-a" }, "source", from);
    await layerPO.addCustomPort({ blockId: "block-b" }, "target", to);
    await graphPO.evaluate((graph) => {
      graph.updateSettings({ canDragCamera: true, dragThreshold: 5 });
      // Keep browser-generated Pointer Events; mask compatibility events to prove which transport drives the drag.
      for (const type of ["mousemove", "mouseup"]) {
        document.addEventListener(type, (event) => event.stopImmediatePropagation(), { capture: true });
      }
    });
    await layerPO.recordEvents();
    const block = await graphPO.block("block-a").getGeometry();
    const camera = await graphPO.camera().getState();
    const start = await layerPO.toViewport(from);
    const end = await layerPO.toViewport(to);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + 4, start.y);
    expect(await layerPO.getEventTypes()).toEqual([]);
    await page.mouse.move(start.x + 5, start.y);
    expect(await layerPO.getEventTypes()).toEqual(["connection-create-start"]);
    const hover = await page.evaluateHandle(() => {
      const graph = window.graph;
      const result = { passiveQueries: 0 };
      const hit = graph.getElementOverPoint.bind(graph);
      graph.getElementOverPoint = (point, filter) => {
        if (!filter) result.passiveQueries++;
        return hit(point, filter);
      };
      return result;
    });
    await page.mouse.move(end.x, end.y, { steps: 12 });
    expect((await hover.jsonValue()).passiveQueries).toBe(0);
    expect(await graphPO.evaluate((graph) => graph.input.$hoveredComponent.value?.getEntityId())).toBe("block-a");
    await hover.dispose();
    await page.mouse.up();
    await page.mouse.move(end.x + 20, end.y);
    expect(await layerPO.getEventTypes()).toEqual([
      "connection-create-start",
      "connection-create-hover",
      "connection-created",
      "connection-create-drop",
    ]);
    await expectPortModeCreated("source", "target");
    expect(await graphPO.block("block-a").getGeometry()).toEqual(block);
    expect(await graphPO.camera().getState()).toEqual(camera);
  });

  test("a custom port on a block is saved by its port ID, not as the block's default point", async () => {
    await layerPO.addCustomPort({ blockId: "block-a" }, "block-a-custom", { x: 150, y: 70 });
    await layerPO.addCustomPort({ blockId: "block-b" }, "block-b-custom", { x: 550, y: 70 });
    await layerPO.recordEvents();

    await graphPO.drag({ x: 150, y: 70 }, { x: 550, y: 70 });

    await expectPortModeCreated("block-a-custom", "block-b-custom");
  });

  test("an anchor connected to a custom port is saved with port IDs on both ends", async () => {
    await layerPO.addCustomPort({ blockId: "block-b" }, "block-b-custom", { x: 550, y: 70 });
    await layerPO.recordEvents();
    const from = await layerPO.getAnchorPoint("block-a", "out-a");

    await graphPO.drag(from, { x: 550, y: 70 });

    await expectPortModeCreated(await layerPO.anchorPortId("block-a", "out-a"), "block-b-custom");
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
      sourcePortId: await layerPO.anchorPortId("block-a", "out-a"),
      targetPortId: await layerPO.anchorPortId("block-b", "in-b"),
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
    await layerPO.addLayer({ rejectTargetPortIds: [await layerPO.anchorPortId("block-b", "in-b")] });
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
    await layerPO.addLayer({ rejectTargetPortIds: [await layerPO.anchorPortId("block-b", "in-b")] });
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
