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
 *                   │ GROUP A  [A1 600,0] [A2 880,0] [A3 1160,0]│
 *                   └──────────────────────────────────────────┘
 *
 *   [L-B 540,300]        ┌──────────────────────────────────────────┐  [R-B 1780,300]
 *                        │ GROUP B  [B1 880,300][B2 1160,300][B3 1440,300]│
 *                        └──────────────────────────────────────────┘
 *
 * Group A fullRect  = {x:540, y:-60, w:880, h:220}
 * Group B fullRect  = {x:820, y:240, w:880, h:220}
 *
 * collapseDirection: {x:"center", y:"center"}  →  ax=0.5, ay=0.5
 *
 * After group-A collapses (deltaX=680, deltaY=172, refX=[540,1420], refY=[-60,160]):
 *
 *   Perpendicular-overlap rule:
 *     X shift applied only if block's Y extent overlaps group A's Y extent [-60,160]
 *     Y shift applied only if block's X extent overlaps group A's X extent [540,1420]
 *
 *   Ungrouped blocks:
 *     L-A  y=[0,100]   overlaps refY → xShift=+340; x=[260,460]  no xOverlap → yShift=0   → (600, 0)
 *     R-A  y=[0,100]   overlaps refY → xShift=-340; x=[1500,1700] no xOverlap → yShift=0  → (1160, 0)
 *     L-B  y=[300,400] no yOverlap   → xShift=0;   x=[540,740]  overlaps refX → yShift=-86 → (540, 214)
 *     R-B  y=[300,400] no yOverlap   → xShift=0;   x=[1780,1980] no xOverlap → yShift=0   → (1780, 300) ✓ no overlap!
 *
 *   Group-B as unit (rect x=[820,1700], y=[240,460]):
 *     yOverlap with refY [-60,160]: NO → shiftX=0
 *     xOverlap with refX [540,1420]: YES → shiftY=-86
 *     B1→(880,214)  B2→(1160,214)  B3→(1440,214)
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
// Used for the EXPAND click: collapsed header is at {x:880, y:26, w:200, h:48}, center=(980,50)
const GA_CENTER_WORLD = {
  x: GROUP_A_RECT.x + GROUP_A_RECT.width / 2,  // 980
  y: GROUP_A_RECT.y + GROUP_A_RECT.height / 2, // 50
};

// Group B center (stays fixed for center collapse)
const GB_CENTER_WORLD = {
  x: GROUP_B_RECT.x + GROUP_B_RECT.width / 2,  // 1260
  y: GROUP_B_RECT.y + GROUP_B_RECT.height / 2, // 350
};

// Collapse click points: top area of each group (above its inner blocks).
// Blocks have z-index > 0 and groups have z-index = 0, so clicking on any
// point that overlaps a block will hit the block instead of the group.
// Group A inner blocks are at y=0..100; the group's padded hitbox starts at y=-80.
// Clicking at y=-50 is inside the group hitbox but above all blocks.
const GA_COLLAPSE_CLICK = {
  x: GROUP_A_RECT.x + GROUP_A_RECT.width / 2, // 980
  y: GROUP_A_RECT.y + 10,                      // -50  (above inner blocks at y=0)
};

// Group B inner blocks are at y=300..400; the group's padded hitbox starts at y=220.
// Clicking at y=250 is inside the group hitbox but above all blocks.
const GB_COLLAPSE_CLICK = {
  x: GROUP_B_RECT.x + GROUP_B_RECT.width / 2, // 1260
  y: GROUP_B_RECT.y + 10,                      // 250  (above inner blocks at y=300)
};

test.describe("CollapsibleGroup — wide two-group layout", () => {
  let graphPO: GraphPageObject;

  test.beforeEach(async ({ page }) => {
    graphPO = new GraphPageObject(page);

    await graphPO.initialize({ blocks: ALL_BLOCKS, connections: CONNECTIONS });

    await graphPO.page.evaluate(
      ({ groupA, groupB }) => {
        const { CollapsibleGroup, BlockGroups } = (window as any).GraphModule;
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
      },
      { groupA: GROUP_A_RECT, groupB: GROUP_B_RECT }
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

  async function getAllPositions() {
    return graphPO.page.evaluate(() => {
      const store = window.graph.rootStore;
      const result: Record<string, { x: number; y: number }> = {};
      store.blocksList.$blocks.value.forEach((b: any) => {
        result[b.id] = { x: b.$geometry.value.x, y: b.$geometry.value.y };
      });
      return result;
    });
  }

  // -------------------------------------------------------------------------
  // Screenshot: initial state
  // -------------------------------------------------------------------------

  test("screenshot: initial state", async ({ page }) => {
    await page.screenshot({ path: "e2e/screenshots/wide-layout-initial.png", fullPage: false });
  });

  // -------------------------------------------------------------------------
  // Collapse group-A
  // -------------------------------------------------------------------------

  test("screenshot: after group-A collapse", async ({ page }) => {
    await graphPO.doubleClick(GA_COLLAPSE_CLICK.x, GA_COLLAPSE_CLICK.y, { waitFrames: 5 });
    await page.screenshot({ path: "e2e/screenshots/wide-layout-after-collapse-A.png", fullPage: false });
  });

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

  test("outer-l-a shifts right (fills freed left space)", async () => {
    const before = await getBlockXY("outer-l-a");
    await graphPO.doubleClick(GA_COLLAPSE_CLICK.x, GA_COLLAPSE_CLICK.y, { waitFrames: 5 });
    const after = await getBlockXY("outer-l-a");

    // deltaX=680, ax=0.5 → shiftX=+340
    expect(after.x).toBe(before.x + 340);
    expect(after.y).toBe(before.y);
  });

  test("outer-r-a shifts left (fills freed right space)", async () => {
    const before = await getBlockXY("outer-r-a");
    await graphPO.doubleClick(GA_COLLAPSE_CLICK.x, GA_COLLAPSE_CLICK.y, { waitFrames: 5 });
    const after = await getBlockXY("outer-r-a");

    // shiftX=-340
    expect(after.x).toBe(before.x - 340);
    expect(after.y).toBe(before.y);
  });

  test("outer-l-b shifts up (fills freed bottom space)", async () => {
    const before = await getBlockXY("outer-l-b");
    await graphPO.doubleClick(GA_COLLAPSE_CLICK.x, GA_COLLAPSE_CLICK.y, { waitFrames: 5 });
    const after = await getBlockXY("outer-l-b");

    // x=[540,740] overlaps group-A x=[540,1420] → Y shift applies; cy=350>160 → shiftY=-86
    // y=[300,400] no overlap with group-A y=[-60,160] → X shift suppressed
    expect(after.x).toBe(before.x);
    expect(after.y).toBe(before.y - 86);
  });

  test("outer-r-b does NOT shift when group-A collapses (different row and column)", async () => {
    const before = await getBlockXY("outer-r-b");
    await graphPO.doubleClick(GA_COLLAPSE_CLICK.x, GA_COLLAPSE_CLICK.y, { waitFrames: 5 });
    const after = await getBlockXY("outer-r-b");

    // outer-r-b y=[300,400] does NOT overlap group-A y=[-60,160] → no X shift
    // outer-r-b x=[1780,1980] does NOT overlap group-A x=[540,1420] → no Y shift
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

    // Group-B center (cx=1260) is inside group-A's X range → shiftX=0
    // Group-B center (cy=350) is below group-A → shiftY=-86
    // All three blocks should move identically
    expect(afterB1.x).toBe(beforeB1.x);
    expect(afterB1.y).toBe(beforeB1.y - 86);
    expect(afterB2.x).toBe(beforeB2.x);
    expect(afterB2.y).toBe(beforeB2.y - 86);
    expect(afterB3.x).toBe(beforeB3.x);
    expect(afterB3.y).toBe(beforeB3.y - 86);
  });

  test("print all positions before and after collapse for visual inspection", async () => {
    const before = await getAllPositions();

    await graphPO.doubleClick(GA_COLLAPSE_CLICK.x, GA_COLLAPSE_CLICK.y, { waitFrames: 5 });

    const after = await getAllPositions();

    // Print a diff table — visible in the test report when test passes
    const ids = Object.keys(before);
    console.log("\n=== Block positions: before → after group-A collapse ===");
    for (const id of ids.sort()) {
      const b = before[id];
      const a = after[id];
      const dxStr = a.x - b.x !== 0 ? ` (Δx=${a.x - b.x})` : "";
      const dyStr = a.y - b.y !== 0 ? ` (Δy=${a.y - b.y})` : "";
      console.log(`  ${id.padEnd(12)}: (${b.x},${b.y}) → (${a.x},${a.y})${dxStr}${dyStr}`);
    }
    console.log("");

    // With the perpendicular-overlap rule, outer-r-b should NOT shift:
    // its y=[300,400] doesn't overlap group A's y=[-60,160], so no X shift;
    // its x=[1780,1980] doesn't overlap group A's x=[540,1420], so no Y shift.
    const rbPos = after["outer-r-b"];
    const gb3Pos = after["gb-3"];
    console.log(`outer-r-b after: (${rbPos.x}, ${rbPos.y})  (expected no shift → 1780,300)`);
    console.log(`gb-3 after:      (${gb3Pos.x}, ${gb3Pos.y})  (expected shift (0,-86) → 1440,214)`);

    // This test always passes — it's for inspection only
    expect(true).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Expand back
  // -------------------------------------------------------------------------

  test("screenshot: after group-A expand", async ({ page }) => {
    await graphPO.doubleClick(GA_COLLAPSE_CLICK.x, GA_COLLAPSE_CLICK.y, { waitFrames: 5 });

    // Collapsed rect center for group-A (collapseDirection center):
    // collapsedX = 540 + 0.5*(880-200) = 880, collapsedY = -60 + 0.5*(220-48) = 26
    // center = (980, 50) — same as GA_CENTER_WORLD; blocks are hidden so no intercept
    await graphPO.doubleClick(GA_CENTER_WORLD.x, GA_CENTER_WORLD.y, { waitFrames: 5 });

    await page.screenshot({ path: "e2e/screenshots/wide-layout-after-expand-A.png", fullPage: false });
  });

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
  // Screenshot: collapse group-B separately
  // -------------------------------------------------------------------------

  test("screenshot: after group-B collapse (group-A expanded)", async ({ page }) => {
    await graphPO.doubleClick(GB_COLLAPSE_CLICK.x, GB_COLLAPSE_CLICK.y, { waitFrames: 5 });
    await page.screenshot({ path: "e2e/screenshots/wide-layout-after-collapse-B.png", fullPage: false });
  });
});
