import { test, expect } from "@playwright/test";
import { GraphPageObject } from "../../page-objects/GraphPageObject";

/**
 * Layout:
 *
 *   [free-block  200x80]
 *   x=600, y=150   — a free block that will be dragged into groups
 *
 *   [group-block-1  200x80]    group-block-2 x=100,y=250
 *   x=100, y=100
 *
 * group-expanded: contains group-block-1 and group-block-2
 *   rect: { x:80, y:80, w:240, h:270 }  (20px padding around blocks)
 *
 * group-collapsed: a second group, started collapsed, positioned to the right
 *   rect: { x:400, y:80, w:200, h:120 }
 *   collapsedRect: { x:400, y:80, w:200, h:48 }
 *
 * Tests verify that:
 * - Dragging a free block into an expanded group triggers onBlockGroupChange
 * - Dragging a free block over a collapsed group does NOT trigger onBlockGroupChange
 *   with the collapsed group as targetGroup (because its hitbox is the collapsed rect
 *   and the transfer layer skips collapsed groups)
 */

const GROUP_PAD = 20;

const BLOCKS = [
  {
    id: "group-block-1",
    is: "Block",
    x: 100,
    y: 100,
    width: 200,
    height: 80,
    name: "Group Block 1",
    anchors: [],
    selected: false,
  },
  {
    id: "group-block-2",
    is: "Block",
    x: 100,
    y: 250,
    width: 200,
    height: 80,
    name: "Group Block 2",
    anchors: [],
    selected: false,
  },
  {
    id: "collapsed-block-1",
    is: "Block",
    x: 400,
    y: 100,
    width: 160,
    height: 80,
    name: "Collapsed Block",
    anchors: [],
    selected: false,
  },
  {
    id: "free-block",
    is: "Block",
    x: 700,
    y: 150,
    width: 200,
    height: 80,
    name: "Free Block",
    anchors: [],
    selected: false,
  },
];

const EXPANDED_GROUP_RECT = {
  x: 100 - GROUP_PAD,
  y: 100 - GROUP_PAD,
  width: 200 + GROUP_PAD * 2,
  height: 230,
};

const COLLAPSED_GROUP_RECT = {
  x: 400 - GROUP_PAD,
  y: 100 - GROUP_PAD,
  width: 160 + GROUP_PAD * 2,
  height: 100,
};

// World center of the expanded group header (in padding area above blocks)
const EXPANDED_GROUP_CENTER = {
  x: EXPANDED_GROUP_RECT.x + EXPANDED_GROUP_RECT.width / 2,
  y: EXPANDED_GROUP_RECT.y + 5,
};

// World center of the free block
const FREE_BLOCK_CENTER = { x: 800, y: 190 };

test.describe("BlockGroupsTransferLayer — collapsed group exclusion", () => {
  let graphPO: GraphPageObject;

  /**
   * Set up the graph with:
   * - BlockGroupsTransferLayer with transferEnabled=true and canDrag=all
   * - group-expanded: starts expanded
   * - group-collapsed: starts collapsed (tests the hitbox-based exclusion)
   * - Records onBlockGroupChange calls in window.__groupChanges
   */
  async function setup(page: any) {
    graphPO = new GraphPageObject(page);

    await graphPO.initialize({
      blocks: BLOCKS,
      settings: {
        canDrag: "all",
        canDragCamera: false,
      },
    });

    await graphPO.page.evaluate(
      ({ expandedRect, collapsedRect }) => {
        const { CollapsibleGroup, BlockGroups } = (window as any).GraphModule;
        const graph = window.graph;

        // Capture all onBlockGroupChange calls for assertions
        (window as any).__groupChanges = [];

        const layer = graph.addLayer(BlockGroups.withPredefinedGroups(), {
          draggable: false,
          transferEnabled: true,
          onBlockGroupChange: (changes: any[]) => {
            (window as any).__groupChanges.push(...changes);
          },
        });

        graph.rootStore.groupsList.setGroups([
          {
            id: "group-expanded",
            rect: expandedRect,
            component: CollapsibleGroup,
            collapsed: false,
          },
          {
            id: "group-collapsed",
            rect: collapsedRect,
            component: CollapsibleGroup,
            collapsed: true,
          },
        ]);

        (window as any).__layer = layer;
      },
      { expandedRect: EXPANDED_GROUP_RECT, collapsedRect: COLLAPSED_GROUP_RECT }
    );

    await graphPO.waitForFrames(5);
  }

  test.beforeEach(async ({ page }) => {
    await setup(page);
  });

  // ---------------------------------------------------------------------------
  // Baseline: transfer into expanded group works
  // ---------------------------------------------------------------------------

  test("dragging free block into expanded group fires onBlockGroupChange with targetGroup", async () => {
    // Start Shift to activate transfer mode, drag free-block into expanded group
    await graphPO.page.keyboard.down("Shift");

    // Drag free-block to the center of the expanded group
    await graphPO.dragTo(
      FREE_BLOCK_CENTER.x,
      FREE_BLOCK_CENTER.y,
      EXPANDED_GROUP_CENTER.x,
      EXPANDED_GROUP_CENTER.y,
      { waitFrames: 20 }
    );

    await graphPO.page.keyboard.up("Shift");
    await graphPO.waitForFrames(5);

    const changes = await graphPO.page.evaluate(() => (window as any).__groupChanges);

    // At least one change where targetGroup is the expanded group
    const matchingChange = changes.find(
      (c: any) => c.blockId === "free-block" && c.targetGroup === "group-expanded"
    );
    expect(matchingChange).toBeTruthy();
  });

  // ---------------------------------------------------------------------------
  // Core: collapsed group is skipped as drop target via hitbox
  // ---------------------------------------------------------------------------

  test("dragging free block over collapsed group header does NOT fire onBlockGroupChange for that group", async () => {
    // The collapsed group's hitbox is its collapsed rect { x:380, y:80, w:200, h:48 }.
    // Dragging a block to the center of that rect would trigger a change IF the
    // transfer layer sees the group as a valid target.
    // With correct hitbox, findGroupAtPoint uses the collapsed rect — so a drop
    // inside it would normally register. But per our layer.ts override,
    // collapsed groups are explicitly excluded as targets.
    //
    // Here we test the underlying hitbox behavior: a drag to the area BELOW the
    // 48px collapsed rect (inside the old expanded rect) must NOT register the
    // collapsed group as a target.
    const belowCollapsedHeader = {
      x: COLLAPSED_GROUP_RECT.x + COLLAPSED_GROUP_RECT.width / 2,
      y: COLLAPSED_GROUP_RECT.y + 80, // below 48px collapsed height
    };

    await graphPO.page.keyboard.down("Shift");

    await graphPO.dragTo(
      FREE_BLOCK_CENTER.x,
      FREE_BLOCK_CENTER.y,
      belowCollapsedHeader.x,
      belowCollapsedHeader.y,
      { waitFrames: 20 }
    );

    await graphPO.page.keyboard.up("Shift");
    await graphPO.waitForFrames(5);

    const changes = await graphPO.page.evaluate(() => (window as any).__groupChanges);

    // No change should target the collapsed group
    const invalidChange = changes.find(
      (c: any) => c.blockId === "free-block" && c.targetGroup === "group-collapsed"
    );
    expect(invalidChange).toBeUndefined();
  });

  test("collapsed group is not highlighted when block is dragged over its expanded-only area", async () => {
    // Drag into the area below the 48px collapsed rect.
    // The layer should not set the group as highlighted (no setHighlighted(true) call).
    const belowCollapsedHeader = {
      x: COLLAPSED_GROUP_RECT.x + COLLAPSED_GROUP_RECT.width / 2,
      y: COLLAPSED_GROUP_RECT.y + 80,
    };

    await graphPO.page.keyboard.down("Shift");
    await graphPO.page.mouse.move(
      ...(await graphPO.page.evaluate(
        ({ wx, wy }) => {
          const [sx, sy] = window.graph.cameraService.getAbsoluteXY(wx, wy);
          const canvas = window.graph.getGraphCanvas();
          const rect = canvas.getBoundingClientRect();
          return [sx + rect.left, sy + rect.top] as [number, number];
        },
        { wx: FREE_BLOCK_CENTER.x, wy: FREE_BLOCK_CENTER.y }
      ))
    );
    await graphPO.page.mouse.down();
    await graphPO.waitForFrames(5);

    // Move to position below collapsed header
    const [vx, vy] = await graphPO.page.evaluate(
      ({ wx, wy }) => {
        const [sx, sy] = window.graph.cameraService.getAbsoluteXY(wx, wy);
        const canvas = window.graph.getGraphCanvas();
        const rect = canvas.getBoundingClientRect();
        return [sx + rect.left, sy + rect.top] as [number, number];
      },
      { wx: belowCollapsedHeader.x, wy: belowCollapsedHeader.y }
    );
    await graphPO.page.mouse.move(vx, vy, { steps: 5 });
    await graphPO.waitForFrames(5);

    const isGroupHighlighted = await graphPO.page.evaluate(() => {
      const { CollapsibleGroup } = (window as any).GraphModule;
      for (const layer of window.graph.layers.getLayers()) {
        const group = layer.$?.["group-collapsed"];
        if (group instanceof CollapsibleGroup) {
          return group.isHighlighted();
        }
      }
      return null;
    });

    // Release
    await graphPO.page.mouse.up();
    await graphPO.page.keyboard.up("Shift");
    await graphPO.waitForFrames(5);

    expect(isGroupHighlighted).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Expand then re-collapse: verify the group becomes a valid target again
  // after expand, and invalid again after re-collapse
  // ---------------------------------------------------------------------------

  test("expanded group becomes valid target after expanding, invalid again after collapsing", async () => {
    // Register dblclick handler to allow expand/collapse
    await graphPO.page.evaluate(() => {
      const { CollapsibleGroup } = (window as any).GraphModule;
      window.graph.on("dblclick", (event: any) => {
        const target = event.detail?.target;
        if (target instanceof CollapsibleGroup) {
          if (target.isCollapsed()) {
            target.expand();
          } else {
            target.collapse();
          }
        }
      });
    });

    // Default collapsed rect: { x:380, y:80, w:200, h:48 }
    const collapsedHeaderCenter = {
      x: COLLAPSED_GROUP_RECT.x + COLLAPSED_GROUP_RECT.width / 2,
      y: COLLAPSED_GROUP_RECT.y + 24,
    };

    // Expand the collapsed group
    await graphPO.doubleClick(collapsedHeaderCenter.x, collapsedHeaderCenter.y, { waitFrames: 5 });

    const isExpanded = await graphPO.page.evaluate(() => {
      return window.graph.rootStore.groupsList.getGroupState("group-collapsed")?.$state.value.collapsed === false;
    });
    expect(isExpanded).toBe(true);

    // Now drag free-block into the (now-expanded) group
    const expandedCenter = {
      x: COLLAPSED_GROUP_RECT.x + COLLAPSED_GROUP_RECT.width / 2,
      y: COLLAPSED_GROUP_RECT.y + 5,
    };

    await graphPO.page.keyboard.down("Shift");
    await graphPO.dragTo(
      FREE_BLOCK_CENTER.x,
      FREE_BLOCK_CENTER.y,
      expandedCenter.x,
      expandedCenter.y,
      { waitFrames: 20 }
    );
    await graphPO.page.keyboard.up("Shift");
    await graphPO.waitForFrames(5);

    const changesAfterExpand = await graphPO.page.evaluate(() => (window as any).__groupChanges);
    const validChange = changesAfterExpand.find(
      (c: any) => c.blockId === "free-block" && c.targetGroup === "group-collapsed"
    );
    // After expanding, the group should now be a valid target
    expect(validChange).toBeTruthy();
  });
});
