import { test, expect } from "@playwright/test";

import { GraphPageObject } from "../../page-objects/GraphPageObject";

/**
 * Layout:
 *
 *   [block-1  200x100]   [block-2  200x100]
 *   x=100,y=100           x=400,y=100
 *
 *            [block-3  200x100]
 *            x=250,y=300
 *
 * Connections:
 *   conn-1: block-1 → block-2
 *   conn-2: block-2 → block-3
 *   conn-3: block-1 → block-3
 */

const BLOCKS = [
  {
    id: "block-1",
    is: "Block",
    x: 100,
    y: 100,
    width: 200,
    height: 100,
    name: "Block 1",
    anchors: [],
    selected: false,
  },
  {
    id: "block-2",
    is: "Block",
    x: 400,
    y: 100,
    width: 200,
    height: 100,
    name: "Block 2",
    anchors: [],
    selected: false,
  },
  {
    id: "block-3",
    is: "Block",
    x: 250,
    y: 300,
    width: 200,
    height: 100,
    name: "Block 3",
    anchors: [],
    selected: false,
  },
];

const CONNECTIONS = [
  { id: "conn-1", sourceBlockId: "block-1", targetBlockId: "block-2" },
  { id: "conn-2", sourceBlockId: "block-2", targetBlockId: "block-3" },
  { id: "conn-3", sourceBlockId: "block-1", targetBlockId: "block-3" },
];

test.describe("Connections", () => {
  let graphPO: GraphPageObject;

  test.beforeEach(async ({ page }) => {
    graphPO = new GraphPageObject(page);
    await graphPO.initialize({ blocks: BLOCKS, connections: CONNECTIONS });
  });

  // ---------------------------------------------------------------------------
  // Store state
  // ---------------------------------------------------------------------------

  test("all connections exist in store after initialization", async () => {
    expect(await graphPO.getConnectionCOM("conn-1").exists()).toBe(true);
    expect(await graphPO.getConnectionCOM("conn-2").exists()).toBe(true);
    expect(await graphPO.getConnectionCOM("conn-3").exists()).toBe(true);
  });

  test("connection has correct source and target block ids", async () => {
    const state = await graphPO.getConnectionCOM("conn-1").getState();

    expect(state).not.toBeNull();
    expect(state.sourceBlockId).toBe("block-1");
    expect(state.targetBlockId).toBe("block-2");
  });

  test("total connection count matches initial data", async () => {
    const all = await graphPO.getAllConnections();
    expect(all).toHaveLength(3);
  });

  test("hasConnectionBetween returns true for existing connections", async () => {
    expect(await graphPO.hasConnectionBetween("block-1", "block-2")).toBe(true);
    expect(await graphPO.hasConnectionBetween("block-2", "block-3")).toBe(true);
    expect(await graphPO.hasConnectionBetween("block-1", "block-3")).toBe(true);
  });

  test("hasConnectionBetween returns false for reverse direction", async () => {
    expect(await graphPO.hasConnectionBetween("block-2", "block-1")).toBe(false);
    expect(await graphPO.hasConnectionBetween("block-3", "block-2")).toBe(false);
  });

  test("hasConnectionBetween returns false for unconnected pair", async () => {
    expect(await graphPO.hasConnectionBetween("block-3", "block-1")).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Selection
  // ---------------------------------------------------------------------------

  test("connection is not selected by default", async () => {
    const isSelected = await graphPO.getConnectionCOM("conn-1").isSelected();
    expect(isSelected).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Persistence through block visibility changes
  // ---------------------------------------------------------------------------

  test("connection survives source block being hidden", async () => {
    await graphPO.evaluateInGraph((graph) => {
      graph.rootStore.blocksList.$blocksMap.value.get("block-1")?.getViewComponent()?.setHiddenBlock(true);
    });
    await graphPO.waitForFrames(3);

    expect(await graphPO.hasConnectionBetween("block-1", "block-2")).toBe(true);
    expect(await graphPO.hasConnectionBetween("block-1", "block-3")).toBe(true);
  });

  test("connection survives target block being hidden", async () => {
    await graphPO.evaluateInGraph((graph) => {
      graph.rootStore.blocksList.$blocksMap.value.get("block-2")?.getViewComponent()?.setHiddenBlock(true);
    });
    await graphPO.waitForFrames(3);

    expect(await graphPO.hasConnectionBetween("block-1", "block-2")).toBe(true);
    expect(await graphPO.hasConnectionBetween("block-2", "block-3")).toBe(true);
  });

  test("connection survives hide-then-show cycle on source block", async () => {
    await graphPO.evaluateInGraph((graph) => {
      const view = graph.rootStore.blocksList.$blocksMap.value.get("block-1")?.getViewComponent();
      view?.setHiddenBlock(true);
      view?.setHiddenBlock(false);
    });
    await graphPO.waitForFrames(3);

    expect(await graphPO.hasConnectionBetween("block-1", "block-2")).toBe(true);
    expect(await graphPO.hasConnectionBetween("block-1", "block-3")).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // setEntities
  // ---------------------------------------------------------------------------

  test("connections are cleared after setEntities with empty data", async () => {
    await graphPO.setEntities({ blocks: [], connections: [] });
    await graphPO.waitForFrames(3);

    const all = await graphPO.getAllConnections();
    expect(all).toHaveLength(0);
  });

  test("connections are replaced after setEntities with new data", async () => {
    const newBlocks = [
      {
        id: "new-1",
        is: "Block",
        x: 100,
        y: 100,
        width: 200,
        height: 100,
        name: "New 1",
        anchors: [],
        selected: false,
      },
      {
        id: "new-2",
        is: "Block",
        x: 400,
        y: 100,
        width: 200,
        height: 100,
        name: "New 2",
        anchors: [],
        selected: false,
      },
    ];
    const newConnections = [{ id: "new-conn", sourceBlockId: "new-1", targetBlockId: "new-2" }];

    await graphPO.setEntities({ blocks: newBlocks, connections: newConnections });
    await graphPO.waitForFrames(5);

    const all = await graphPO.getAllConnections();
    expect(all).toHaveLength(1);

    expect(await graphPO.hasConnectionBetween("new-1", "new-2")).toBe(true);
    expect(await graphPO.hasConnectionBetween("block-1", "block-2")).toBe(false);
  });

  test("old connections absent after setEntities with partial data", async () => {
    await graphPO.setEntities({
      blocks: BLOCKS,
      connections: [{ id: "conn-1", sourceBlockId: "block-1", targetBlockId: "block-2" }],
    });
    await graphPO.waitForFrames(5);

    const all = await graphPO.getAllConnections();
    expect(all).toHaveLength(1);

    expect(await graphPO.getConnectionCOM("conn-2").exists()).toBe(false);
    expect(await graphPO.getConnectionCOM("conn-3").exists()).toBe(false);
  });
});
