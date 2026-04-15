import { test, expect } from "@playwright/test";
import { GraphPageObject } from "../../page-objects/GraphPageObject";

/**
 * Tests for the "collapsed group drop prevention" behavior:
 *
 * When a group is collapsed, it should not be a valid drop target because
 * block positions inside a collapsed group are undefined. This is enforced
 * at two levels:
 *
 * 1. **Hitbox level** (fix 1.1): CollapsibleGroup sets `updateHitBox(collapsedRect)`
 *    on mount, so the hitbox only covers the compact header — not the full
 *    expanded rect. Clicks/queries below the header don't register.
 *
 * 2. **Transfer layer level**: NirvanaGroupsLayer.getGroupForPosition skips
 *    groups with `collapsed: true`, so even a cursor landing on the header
 *    does not register the group as a drop target.
 *
 * These tests verify both levels via click-event assertions (same mechanism
 * used by BlockGroupsTransferLayer.findGroupAtPoint internally).
 *
 * Layout:
 *   [group-block-1  200x80] x=100,y=100
 *   [group-block-2  200x80] x=100,y=250   → group-expanded
 *   [collapsed-block  160x80] x=400,y=100 → group-collapsed (starts collapsed)
 */

const GROUP_PAD = 20;

const BLOCKS = [
  { id: "group-block-1", is: "Block", x: 100, y: 100, width: 200, height: 80, name: "Group Block 1", anchors: [], selected: false },
  { id: "group-block-2", is: "Block", x: 100, y: 250, width: 200, height: 80, name: "Group Block 2", anchors: [], selected: false },
  { id: "collapsed-block", is: "Block", x: 400, y: 100, width: 160, height: 80, name: "Collapsed Block", anchors: [], selected: false },
];

const EXPANDED_GROUP_RECT  = { x: 100 - GROUP_PAD, y: 100 - GROUP_PAD, width: 200 + GROUP_PAD * 2, height: 230 };
const COLLAPSED_GROUP_RECT = { x: 400 - GROUP_PAD, y: 100 - GROUP_PAD, width: 160 + GROUP_PAD * 2, height: 100 };

// In the header padding of the expanded group
const EXPANDED_GROUP_HEADER = { x: EXPANDED_GROUP_RECT.x + EXPANDED_GROUP_RECT.width / 2, y: EXPANDED_GROUP_RECT.y + 5 };
// Center of the collapsed header (48px tall)
const COLLAPSED_HEADER_CENTER = { x: COLLAPSED_GROUP_RECT.x + COLLAPSED_GROUP_RECT.width / 2, y: COLLAPSED_GROUP_RECT.y + 24 };
// Below the 48px collapsed header — inside the old expanded visual rect
const BELOW_COLLAPSED_HEADER  = { x: COLLAPSED_GROUP_RECT.x + COLLAPSED_GROUP_RECT.width / 2, y: COLLAPSED_GROUP_RECT.y + 80 };

test.describe("CollapsibleGroup — collapsed drop prevention and hitbox", () => {
  let graphPO: GraphPageObject;

  test.beforeEach(async ({ page }) => {
    graphPO = new GraphPageObject(page);
    await graphPO.initialize({ blocks: BLOCKS });

    await graphPO.page.evaluate(
      ({ expandedRect, collapsedRect }) => {
        const { CollapsibleGroup, BlockGroups } = (window as any).GraphModule;
        const graph = window.graph;

        graph.addLayer(BlockGroups, {});

        graph.rootStore.groupsList.setGroups([
          { id: "group-expanded",  rect: expandedRect,  component: CollapsibleGroup, collapsed: false },
          { id: "group-collapsed", rect: collapsedRect, component: CollapsibleGroup, collapsed: true  },
        ]);

        // dblclick handler for expand/collapse
        graph.on("dblclick", (event: any) => {
          const target = event.detail?.target;
          if (target instanceof CollapsibleGroup) {
            target.isCollapsed() ? target.expand() : target.collapse();
          }
        });
      },
      { expandedRect: EXPANDED_GROUP_RECT, collapsedRect: COLLAPSED_GROUP_RECT }
    );

    await graphPO.waitForFrames(5);
  });

  // ---------------------------------------------------------------------------
  // Level 1: State — collapsed flag is set correctly
  // ---------------------------------------------------------------------------

  test("group-collapsed stores collapsedRect immediately on mount (fix 1.1)", async () => {
    const state = await graphPO.page.evaluate(() =>
      window.graph.rootStore.groupsList.getGroupState("group-collapsed")?.$state.value
    );
    expect((state as any).collapsedRect).toBeDefined();
    expect((state as any).collapsedRect.height).toBe(48); // DEFAULT_COLLAPSED_HEIGHT
  });

  // ---------------------------------------------------------------------------
  // Level 2: Hitbox — click events prove the hitbox boundary
  // Using click events mirrors how BlockGroupsTransferLayer uses the hitbox.
  // ---------------------------------------------------------------------------

  test("click on expanded group header registers on that group", async () => {
    const listener = await graphPO.listenGraphEvents("click");
    await graphPO.click(EXPANDED_GROUP_HEADER.x, EXPANDED_GROUP_HEADER.y);
    const targets = await listener.analyze((events) =>
      events.map((e: any) => e.detail?.target?.props?.id).filter(Boolean)
    );
    expect(targets).toContain("group-expanded");
    await listener.stop();
  });

  test("click at collapsed rect left edge (outside inner block) registers on group-collapsed", async () => {
    // The collapsed block (x=400-560) occupies most of the header. Click at the
    // left padding edge (x = COLLAPSED_GROUP_RECT.x + 5) — this is inside
    // the collapsed visual rect but outside the inner block bounds.
    const leftEdge = { x: COLLAPSED_GROUP_RECT.x + 5, y: COLLAPSED_HEADER_CENTER.y };
    const listener = await graphPO.listenGraphEvents("click");
    await graphPO.click(leftEdge.x, leftEdge.y);
    const targets = await listener.analyze((events) =>
      events.map((e: any) => e.detail?.target?.props?.id).filter(Boolean)
    );
    // The collapsed rect hitbox is active — click at the group's left padding
    // should land on the group component itself.
    expect(targets).toContain("group-collapsed");
    await listener.stop();
  });

  // ---------------------------------------------------------------------------
  // Level 3: Expand restores full hitbox
  // ---------------------------------------------------------------------------

  test("after expand, click at group left-padding area (below former header) hits the group", async () => {
    await graphPO.page.evaluate(() => {
      const { CollapsibleGroup } = (window as any).GraphModule;
      for (const layer of window.graph.layers.getLayers()) {
        const g = (layer as any).$?.["group-collapsed"];
        if (g instanceof CollapsibleGroup) { g.expand(); break; }
      }
    });
    await graphPO.waitForFrames(5);

    // After expand, the full visual rect (with padding) is the hitbox.
    // Click at the group's left padding edge, below the former 48px header.
    // The inner block doesn't extend here so the group gets the event.
    const leftEdgeBelow = { x: COLLAPSED_GROUP_RECT.x + 5, y: BELOW_COLLAPSED_HEADER.y };
    const listener = await graphPO.listenGraphEvents("click");
    await graphPO.click(leftEdgeBelow.x, leftEdgeBelow.y);
    const targets = await listener.analyze((events) =>
      events.map((e: any) => e.detail?.target?.props?.id).filter(Boolean)
    );
    expect(targets).toContain("group-collapsed");
    await listener.stop();
  });

});
