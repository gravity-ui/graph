import { test, expect } from "@playwright/test";

import { GraphPageObject } from "../../page-objects/GraphPageObject";

/**
 * Wide-group layout mirroring the canvas-groups--collapsible-groups Storybook story.
 *
 * Constants (from the story):
 *   BLOCK_W=200  BLOCK_H=100  GROUP_PAD=60  COL_GAP=80  ROW_GAP=200  OUTER_GAP=80
 *
 * Block positions:
 *
 *   [L-A 260,0]     ┌──────────────────────────────────────────┐   [R-A 1500,0]
 *                    │ GROUP A  [A1 600,0] [A2 880,0] [A3 1160,0]│
 *                    └──────────────────────────────────────────┘
 *
 *   [L-B 540,300]        ┌──────────────────────────────────────────┐  [R-B 1780,300]
 *                         │ GROUP B  [B1 880,300][B2 1160,300][B3 1440,300]│
 *                         └──────────────────────────────────────────┘
 *
 * Group A fullRect  = {x:540, y:-60, w:880, h:220}
 * Group B fullRect  = {x:820, y:240, w:880, h:220}
 *
 * collapseDirection: {x:"center", y:"center"}  →  ax=0.5, ay=0.5
 *
 * This test validates the event-driven collapse architecture:
 * - dblclick triggers collapse/expand via user-registered handler
 * - group-collapse-change event fires with correct rects
 * - shiftBlocksOnGroupCollapse utility shifts outer blocks in the event handler
 */

const BLOCK_W = 200;
const BLOCK_H = 100;
const GROUP_PAD = 60;
const COL_GAP = 80;
const ROW_GAP = 200;
const OUTER_GAP = 80;

const GA_X0 = 600;
const GA_Y = 0;
const GA_COUNT = 3;
const GB_X0 = GA_X0 + BLOCK_W + COL_GAP; // 880
const GB_Y = GA_Y + BLOCK_H + ROW_GAP; // 300

const GA_RIGHT = GA_X0 + GA_COUNT * (BLOCK_W + COL_GAP) - COL_GAP; // 1360
const GB_RIGHT = GB_X0 + GA_COUNT * (BLOCK_W + COL_GAP) - COL_GAP; // 1640

const GA_BLOCKS = Array.from({ length: GA_COUNT }, (_, i) => ({
  id: `ga-${i + 1}`,
  is: "Block" as const,
  name: `A${i + 1}`,
  selected: false,
  x: GA_X0 + i * (BLOCK_W + COL_GAP),
  y: GA_Y,
  width: BLOCK_W,
  height: BLOCK_H,
  anchors: [] as never[],
  group: "group-a",
}));

const GB_BLOCKS = Array.from({ length: GA_COUNT }, (_, i) => ({
  id: `gb-${i + 1}`,
  is: "Block" as const,
  name: `B${i + 1}`,
  selected: false,
  x: GB_X0 + i * (BLOCK_W + COL_GAP),
  y: GB_Y,
  width: BLOCK_W,
  height: BLOCK_H,
  anchors: [] as never[],
  group: "group-b",
}));

const OUTER_BLOCKS = [
  {
    id: "outer-l-a",
    is: "Block" as const,
    name: "L-A",
    selected: false,
    x: GA_X0 - GROUP_PAD - OUTER_GAP - BLOCK_W, // 260
    y: GA_Y,
    width: BLOCK_W,
    height: BLOCK_H,
    anchors: [] as never[],
  },
  {
    id: "outer-r-a",
    is: "Block" as const,
    name: "R-A",
    selected: false,
    x: GA_RIGHT + GROUP_PAD + OUTER_GAP, // 1500
    y: GA_Y,
    width: BLOCK_W,
    height: BLOCK_H,
    anchors: [] as never[],
  },
  {
    id: "outer-l-b",
    is: "Block" as const,
    name: "L-B",
    selected: false,
    x: GB_X0 - GROUP_PAD - OUTER_GAP - BLOCK_W, // 540
    y: GB_Y,
    width: BLOCK_W,
    height: BLOCK_H,
    anchors: [] as never[],
  },
  {
    id: "outer-r-b",
    is: "Block" as const,
    name: "R-B",
    selected: false,
    x: GB_RIGHT + GROUP_PAD + OUTER_GAP, // 1780
    y: GB_Y,
    width: BLOCK_W,
    height: BLOCK_H,
    anchors: [] as never[],
  },
];

const ALL_BLOCKS = [...GA_BLOCKS, ...GB_BLOCKS, ...OUTER_BLOCKS];

const CONNECTIONS = [
  { id: "c-la-a1", sourceBlockId: "outer-l-a", targetBlockId: "ga-1" },
  { id: "c-a3-ra", sourceBlockId: "ga-3", targetBlockId: "outer-r-a" },
  { id: "c-lb-b1", sourceBlockId: "outer-l-b", targetBlockId: "gb-1" },
  { id: "c-b3-rb", sourceBlockId: "gb-3", targetBlockId: "outer-r-b" },
  { id: "c-a2-b2", sourceBlockId: "ga-2", targetBlockId: "gb-2" },
];

// Group rects: block bounding box + GROUP_PAD on each side
const GROUP_A_RECT = {
  x: GA_X0 - GROUP_PAD, // 540
  y: GA_Y - GROUP_PAD, // -60
  width: GA_COUNT * (BLOCK_W + COL_GAP) - COL_GAP + GROUP_PAD * 2, // 880
  height: BLOCK_H + GROUP_PAD * 2, // 220
};
const GROUP_B_RECT = {
  x: GB_X0 - GROUP_PAD, // 820
  y: GB_Y - GROUP_PAD, // 240
  width: GA_COUNT * (BLOCK_W + COL_GAP) - COL_GAP + GROUP_PAD * 2, // 880
  height: BLOCK_H + GROUP_PAD * 2, // 220
};

// Group A center (stays fixed for center collapse)
const GA_CENTER_WORLD = {
  x: GROUP_A_RECT.x + GROUP_A_RECT.width / 2, // 980
  y: GROUP_A_RECT.y + GROUP_A_RECT.height / 2, // 50
};

// Collapse click points: above inner blocks but inside group hitbox
const GA_COLLAPSE_CLICK = {
  x: GROUP_A_RECT.x + GROUP_A_RECT.width / 2, // 980
  y: GROUP_A_RECT.y + 10, // -50
};

const GB_COLLAPSE_CLICK = {
  x: GROUP_B_RECT.x + GROUP_B_RECT.width / 2, // 1260
  y: GROUP_B_RECT.y + 10, // 250
};

test.describe("CollapsibleGroup — wide two-group layout", () => {
  let graphPO: GraphPageObject;

  test.beforeEach(async ({ page }) => {
    graphPO = new GraphPageObject(page);

    await graphPO.initialize({ blocks: ALL_BLOCKS, connections: CONNECTIONS });

    await graphPO.page.evaluate(
      ({ groupA, groupB }) => {
        const { CollapsibleGroup, BlockGroups, shiftBlocksOnGroupCollapse } = (window as any).GraphModule;
        const graph = window.graph;

        graph.addLayer(BlockGroups, { draggable: false });

        graph.rootStore.groupsList.setGroups([
          {
            id: "group-a",
            rect: groupA,
            component: CollapsibleGroup,
            collapsed: false,
            collapseDirection: { x: "center", y: "center" },
          },
          {
            id: "group-b",
            rect: groupB,
            component: CollapsibleGroup,
            collapsed: false,
            collapseDirection: { x: "center", y: "center" },
          },
        ]);

        // Register dblclick handler for toggle
        graph.on("dblclick", (event: any) => {
          const target = event.detail?.target;
          if (target instanceof CollapsibleGroup) {
            if (target.isCollapsed()) {
              target.expand();
            } else {
              target.collapse();
            }
          }
        });

        // Register collapse event handler to shift outer blocks
        graph.on("group-collapse-change", (event: any) => {
          const { groupId, currentRect, nextRect } = event.detail;
          const groupBlocks = graph.rootStore.groupsList.$blockGroups.value[groupId] ?? [];
          shiftBlocksOnGroupCollapse({
            graph,
            currentRect,
            nextRect,
            groupBlockIds: new Set(groupBlocks.map((b: any) => b.id)),
          });
        });
      },
      { groupA: GROUP_A_RECT, groupB: GROUP_B_RECT },
    );

    await graphPO.waitForFrames(5);
  });

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  async function getBlockXY(id: string): Promise<{ x: number; y: number }> {
    return graphPO.page.evaluate((blockId) => {
      const b = window.graph.rootStore.blocksList.$blocksMap.value.get(blockId);
      if (!b) throw new Error(`Block ${blockId} not found`);
      return { x: b.$geometry.value.x, y: b.$geometry.value.y };
    }, id);
  }

  // -------------------------------------------------------------------------
  // Collapse group-A
  // -------------------------------------------------------------------------

  test("group-A blocks are hidden after collapse", async () => {
    await graphPO.doubleClick(GA_COLLAPSE_CLICK.x, GA_COLLAPSE_CLICK.y, { waitFrames: 5 });

    const rendered = await graphPO.page.evaluate(() => {
      const store = window.graph.rootStore;
      return ["ga-1", "ga-2", "ga-3"].map((id) => ({
        id,
        rendered: store.blocksList.$blocksMap.value.get(id)?.getViewComponent()?.isRendered() ?? true,
      }));
    });

    for (const { id, rendered: r } of rendered) {
      expect(r, `${id} should not be rendered after collapse`).toBe(false);
    }
  });

  test("group-B blocks are still visible after group-A collapse", async () => {
    await graphPO.doubleClick(GA_COLLAPSE_CLICK.x, GA_COLLAPSE_CLICK.y, { waitFrames: 5 });

    const rendered = await graphPO.page.evaluate(() => {
      const store = window.graph.rootStore;
      return ["gb-1", "gb-2", "gb-3"].map((id) => ({
        id,
        rendered: store.blocksList.$blocksMap.value.get(id)?.getViewComponent()?.isRendered() ?? false,
      }));
    });

    for (const { id, rendered: r } of rendered) {
      expect(r, `${id} should still be rendered after group-A collapse`).toBe(true);
    }
  });

  test("outer-l-a shifts right via event handler (fills freed left space)", async () => {
    const before = await getBlockXY("outer-l-a");
    await graphPO.doubleClick(GA_COLLAPSE_CLICK.x, GA_COLLAPSE_CLICK.y, { waitFrames: 5 });
    const after = await getBlockXY("outer-l-a");

    // deltaX=680, ax=0.5 → shiftX=+340
    expect(after.x).toBe(before.x + 340);
    expect(after.y).toBe(before.y);
  });

  test("outer-r-a shifts left via event handler (fills freed right space)", async () => {
    const before = await getBlockXY("outer-r-a");
    await graphPO.doubleClick(GA_COLLAPSE_CLICK.x, GA_COLLAPSE_CLICK.y, { waitFrames: 5 });
    const after = await getBlockXY("outer-r-a");

    // shiftX=-340
    expect(after.x).toBe(before.x - 340);
    expect(after.y).toBe(before.y);
  });

  test("outer-l-b shifts up via event handler (fills freed bottom space)", async () => {
    const before = await getBlockXY("outer-l-b");
    await graphPO.doubleClick(GA_COLLAPSE_CLICK.x, GA_COLLAPSE_CLICK.y, { waitFrames: 5 });
    const after = await getBlockXY("outer-l-b");

    expect(after.x).toBe(before.x);
    expect(after.y).toBe(before.y - 86);
  });

  test("outer-r-b does NOT shift when group-A collapses (different row and column)", async () => {
    const before = await getBlockXY("outer-r-b");
    await graphPO.doubleClick(GA_COLLAPSE_CLICK.x, GA_COLLAPSE_CLICK.y, { waitFrames: 5 });
    const after = await getBlockXY("outer-r-b");

    expect(after.x).toBe(before.x);
    expect(after.y).toBe(before.y);
  });

  test("group-B shifts up as a unit (no X split)", async () => {
    const beforeB1 = await getBlockXY("gb-1");
    const beforeB2 = await getBlockXY("gb-2");
    const beforeB3 = await getBlockXY("gb-3");

    await graphPO.doubleClick(GA_COLLAPSE_CLICK.x, GA_COLLAPSE_CLICK.y, { waitFrames: 5 });

    const afterB1 = await getBlockXY("gb-1");
    const afterB2 = await getBlockXY("gb-2");
    const afterB3 = await getBlockXY("gb-3");

    expect(afterB1.x).toBe(beforeB1.x);
    expect(afterB1.y).toBe(beforeB1.y - 86);
    expect(afterB2.x).toBe(beforeB2.x);
    expect(afterB2.y).toBe(beforeB2.y - 86);
    expect(afterB3.x).toBe(beforeB3.x);
    expect(afterB3.y).toBe(beforeB3.y - 86);
  });

  // -------------------------------------------------------------------------
  // Expand back
  // -------------------------------------------------------------------------

  test("outer-l-a returns to original position after expand", async () => {
    const initial = await getBlockXY("outer-l-a");
    await graphPO.doubleClick(GA_COLLAPSE_CLICK.x, GA_COLLAPSE_CLICK.y, { waitFrames: 5 });
    await graphPO.doubleClick(GA_CENTER_WORLD.x, GA_CENTER_WORLD.y, { waitFrames: 5 });
    const final = await getBlockXY("outer-l-a");

    expect(final.x).toBe(initial.x);
    expect(final.y).toBe(initial.y);
  });

  test("outer-r-a returns to original position after expand", async () => {
    const initial = await getBlockXY("outer-r-a");
    await graphPO.doubleClick(GA_COLLAPSE_CLICK.x, GA_COLLAPSE_CLICK.y, { waitFrames: 5 });
    await graphPO.doubleClick(GA_CENTER_WORLD.x, GA_CENTER_WORLD.y, { waitFrames: 5 });
    const final = await getBlockXY("outer-r-a");

    expect(final.x).toBe(initial.x);
    expect(final.y).toBe(initial.y);
  });

  test("group-B blocks return to original positions after expand", async () => {
    const initialB1 = await getBlockXY("gb-1");
    const initialB3 = await getBlockXY("gb-3");

    await graphPO.doubleClick(GA_COLLAPSE_CLICK.x, GA_COLLAPSE_CLICK.y, { waitFrames: 5 });
    await graphPO.doubleClick(GA_CENTER_WORLD.x, GA_CENTER_WORLD.y, { waitFrames: 5 });

    const finalB1 = await getBlockXY("gb-1");
    const finalB3 = await getBlockXY("gb-3");

    expect(finalB1.x).toBe(initialB1.x);
    expect(finalB1.y).toBe(initialB1.y);
    expect(finalB3.x).toBe(initialB3.x);
    expect(finalB3.y).toBe(initialB3.y);
  });

  // -------------------------------------------------------------------------
  // Connections
  // -------------------------------------------------------------------------

  test("all connections persist after group-A collapse", async () => {
    await graphPO.doubleClick(GA_COLLAPSE_CLICK.x, GA_COLLAPSE_CLICK.y, { waitFrames: 5 });

    const connections = await graphPO.getAllConnections();
    expect(connections).toHaveLength(5);

    expect(await graphPO.hasConnectionBetween("outer-l-a", "ga-1")).toBe(true);
    expect(await graphPO.hasConnectionBetween("ga-3", "outer-r-a")).toBe(true);
    expect(await graphPO.hasConnectionBetween("ga-2", "gb-2")).toBe(true);
  });
});
