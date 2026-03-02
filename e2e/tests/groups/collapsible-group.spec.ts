import { test, expect } from "@playwright/test";

import { GraphPageObject } from "../../page-objects/GraphPageObject";

/**
 * Layout used across all tests:
 *
 *   [block-1  300x100]  [block-outer 200x100]
 *   x=100,y=100          x=450,y=100
 *
 *   [block-2  300x100]
 *   x=100,y=250
 *
 * Group "group-1" contains block-1 and block-2.
 * Group rect (bounding box): { x:100, y:100, w:300, h:250 }
 *   → right edge: 400, bottom edge: 350
 *
 * Collapsed rect: { x:100, y:100, w:200, h:48 }
 *   → diffX = 400-300 = 100  (block-outer x=450 >= 400, shifts to 350)
 *   → diffY = 350-148 = 202  (block-outer y=100 < 350, no vertical shift)
 *
 * Group hitbox center (expanded):  x=250, y=225  (includes padding=20 on each side)
 * Group hitbox center (collapsed): x=200, y=124
 *
 * Connection: block-1 → block-outer  (tests port delegation)
 */

const BLOCKS = [
  {
    id: "block-1",
    is: "Block",
    x: 100,
    y: 100,
    width: 300,
    height: 100,
    name: "Block 1",
    anchors: [],
    selected: false,
    group: "group-1",
  },
  {
    id: "block-2",
    is: "Block",
    x: 100,
    y: 250,
    width: 300,
    height: 100,
    name: "Block 2",
    anchors: [],
    selected: false,
    group: "group-1",
  },
  {
    id: "block-outer",
    is: "Block",
    x: 450,
    y: 100,
    width: 200,
    height: 100,
    name: "Outer Block",
    anchors: [],
    selected: false,
  },
];

const CONNECTIONS = [
  {
    id: "conn-1",
    sourceBlockId: "block-1",
    targetBlockId: "block-outer",
  },
];

// World coordinates for double-clicking the group
const GROUP_CENTER_EXPANDED = { x: 250, y: 225 };
const GROUP_CENTER_COLLAPSED = { x: 200, y: 124 };

test.describe("CollapsibleGroup", () => {
  let graphPO: GraphPageObject;

  test.beforeEach(async ({ page }) => {
    graphPO = new GraphPageObject(page);

    await graphPO.initialize({
      blocks: BLOCKS,
      connections: CONNECTIONS,
    });

    // Add BlockGroups layer and register group-1 with CollapsibleGroup component
    await graphPO.page.evaluate(() => {
      const { CollapsibleGroup, BlockGroups } = (window as any).GraphModule;
      const graph = window.graph;

      graph.addLayer(BlockGroups, { draggable: false });

      graph.rootStore.groupsList.setGroups([
        {
          id: "group-1",
          rect: { x: 100, y: 100, width: 300, height: 250 },
          component: CollapsibleGroup,
          collapsed: false,
        },
      ]);
    });

    await graphPO.waitForFrames(5);
  });

  // ---------------------------------------------------------------------------
  // Collapse
  // ---------------------------------------------------------------------------

  test("collapses group on double-click", async () => {
    await graphPO.doubleClick(GROUP_CENTER_EXPANDED.x, GROUP_CENTER_EXPANDED.y, {
      waitFrames: 5,
    });

    const collapsed = await graphPO.page.evaluate(() => {
      return window.graph.rootStore.groupsList.getGroupState("group-1")?.$state.value.collapsed;
    });

    expect(collapsed).toBe(true);
  });

  test("group rect shrinks to collapsed size after collapse", async () => {
    await graphPO.doubleClick(GROUP_CENTER_EXPANDED.x, GROUP_CENTER_EXPANDED.y, {
      waitFrames: 5,
    });

    const rect = await graphPO.page.evaluate(() => {
      return window.graph.rootStore.groupsList.getGroupState("group-1")?.$state.value.rect;
    });

    expect(rect.x).toBe(100);
    expect(rect.y).toBe(100);
    expect(rect.width).toBe(200); // DEFAULT_COLLAPSED_WIDTH
    expect(rect.height).toBe(48); // DEFAULT_COLLAPSED_HEIGHT
  });

  test("hides group blocks on canvas after collapse", async () => {
    await graphPO.doubleClick(GROUP_CENTER_EXPANDED.x, GROUP_CENTER_EXPANDED.y, {
      waitFrames: 5,
    });

    const { b1Rendered, b2Rendered } = await graphPO.page.evaluate(() => {
      const store = window.graph.rootStore;
      const b1 = store.blocksList.$blocksMap.value.get("block-1");
      const b2 = store.blocksList.$blocksMap.value.get("block-2");
      return {
        b1Rendered: b1?.getViewComponent()?.isRendered() ?? true,
        b2Rendered: b2?.getViewComponent()?.isRendered() ?? true,
      };
    });

    expect(b1Rendered).toBe(false);
    expect(b2Rendered).toBe(false);
  });

  test("outer block (to the right) shifts inward after collapse", async () => {
    const before = await graphPO.page.evaluate(() => {
      const block = window.graph.rootStore.blocksList.$blocksMap.value.get("block-outer");
      return { x: block?.$geometry.value.x, y: block?.$geometry.value.y };
    });

    await graphPO.doubleClick(GROUP_CENTER_EXPANDED.x, GROUP_CENTER_EXPANDED.y, {
      waitFrames: 5,
    });

    const after = await graphPO.page.evaluate(() => {
      const block = window.graph.rootStore.blocksList.$blocksMap.value.get("block-outer");
      return { x: block?.$geometry.value.x, y: block?.$geometry.value.y };
    });

    // diffX = (100+300)-(100+200) = 100; block-outer.x=450 >= 400 → shifts to 350
    expect(after.x).toBe(before.x - 100);
    // block-outer.y=100 < group_bottom(350) → no vertical shift
    expect(after.y).toBe(before.y);
  });

  test("delegates hidden block ports to group center after collapse", async () => {
    await graphPO.doubleClick(GROUP_CENTER_EXPANDED.x, GROUP_CENTER_EXPANDED.y, {
      waitFrames: 5,
    });

    const result = await graphPO.page.evaluate(() => {
      const store = window.graph.rootStore;
      const b1 = store.blocksList.$blocksMap.value.get("block-1");
      const canvasBlock = b1?.getViewComponent();
      const outputPort = canvasBlock?.getOutputPort();
      const groupRect = store.groupsList.getGroupState("group-1")?.$state.value.rect;

      return {
        portX: outputPort?.x,
        portY: outputPort?.y,
        groupCenterX: groupRect ? groupRect.x + groupRect.width / 2 : null,
        groupCenterY: groupRect ? groupRect.y + groupRect.height / 2 : null,
      };
    });

    expect(result.portX).toBe(result.groupCenterX);
    expect(result.portY).toBe(result.groupCenterY);
  });

  // ---------------------------------------------------------------------------
  // Expand
  // ---------------------------------------------------------------------------

  test("expands group on double-click when collapsed", async () => {
    // Collapse first
    await graphPO.doubleClick(GROUP_CENTER_EXPANDED.x, GROUP_CENTER_EXPANDED.y, {
      waitFrames: 5,
    });

    // Expand by double-clicking the collapsed group center
    await graphPO.doubleClick(GROUP_CENTER_COLLAPSED.x, GROUP_CENTER_COLLAPSED.y, {
      waitFrames: 5,
    });

    const collapsed = await graphPO.page.evaluate(() => {
      return window.graph.rootStore.groupsList.getGroupState("group-1")?.$state.value.collapsed;
    });

    expect(collapsed).toBe(false);
  });

  test("group blocks are visible again after expand", async () => {
    await graphPO.doubleClick(GROUP_CENTER_EXPANDED.x, GROUP_CENTER_EXPANDED.y, {
      waitFrames: 5,
    });
    await graphPO.doubleClick(GROUP_CENTER_COLLAPSED.x, GROUP_CENTER_COLLAPSED.y, {
      waitFrames: 5,
    });

    const { b1Rendered, b2Rendered } = await graphPO.page.evaluate(() => {
      const store = window.graph.rootStore;
      const b1 = store.blocksList.$blocksMap.value.get("block-1");
      const b2 = store.blocksList.$blocksMap.value.get("block-2");
      return {
        b1Rendered: b1?.getViewComponent()?.isRendered() ?? false,
        b2Rendered: b2?.getViewComponent()?.isRendered() ?? false,
      };
    });

    expect(b1Rendered).toBe(true);
    expect(b2Rendered).toBe(true);
  });

  test("outer block returns to original position after expand", async () => {
    const initial = await graphPO.page.evaluate(() => {
      const block = window.graph.rootStore.blocksList.$blocksMap.value.get("block-outer");
      return { x: block?.$geometry.value.x, y: block?.$geometry.value.y };
    });

    await graphPO.doubleClick(GROUP_CENTER_EXPANDED.x, GROUP_CENTER_EXPANDED.y, {
      waitFrames: 5,
    });
    await graphPO.doubleClick(GROUP_CENTER_COLLAPSED.x, GROUP_CENTER_COLLAPSED.y, {
      waitFrames: 5,
    });

    const final = await graphPO.page.evaluate(() => {
      const block = window.graph.rootStore.blocksList.$blocksMap.value.get("block-outer");
      return { x: block?.$geometry.value.x, y: block?.$geometry.value.y };
    });

    expect(final.x).toBe(initial.x);
    expect(final.y).toBe(initial.y);
  });

  test("group rect is restored to full size after expand", async () => {
    await graphPO.doubleClick(GROUP_CENTER_EXPANDED.x, GROUP_CENTER_EXPANDED.y, {
      waitFrames: 5,
    });
    await graphPO.doubleClick(GROUP_CENTER_COLLAPSED.x, GROUP_CENTER_COLLAPSED.y, {
      waitFrames: 5,
    });

    const rect = await graphPO.page.evaluate(() => {
      return window.graph.rootStore.groupsList.getGroupState("group-1")?.$state.value.rect;
    });

    // Full bounding box of block-1 + block-2
    expect(rect.x).toBe(100);
    expect(rect.y).toBe(100);
    expect(rect.width).toBe(300);
    expect(rect.height).toBe(250);
  });

  // ---------------------------------------------------------------------------
  // Connection integrity
  // ---------------------------------------------------------------------------

  test("connection still exists between group block and outer block", async () => {
    await graphPO.doubleClick(GROUP_CENTER_EXPANDED.x, GROUP_CENTER_EXPANDED.y, {
      waitFrames: 5,
    });

    const exists = await graphPO.hasConnectionBetween("block-1", "block-outer");
    expect(exists).toBe(true);
  });
});
