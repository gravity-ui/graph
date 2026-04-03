import { test, expect } from "@playwright/test";

import { GraphPageObject } from "../../page-objects/GraphPageObject";

/**
 * Layout used across all tests:
 *
 *   [block-1  300x100]  ─conn-1→  [block-outer 200x100]
 *   x=100,y=100                     x=500,y=100
 *
 *   [block-2  300x100]
 *   x=100,y=250
 *
 * Group "group-1" contains block-1 and block-2.
 * Group rect: { x:80, y:80, w:340, h:290 }  (20px padding around blocks)
 *
 * Collapsed rect (default, direction start): { x:80, y:80, w:200, h:48 }
 *
 * Connection: block-1 → block-outer  (tests port delegation)
 */

const GROUP_PAD = 20;

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
    x: 500,
    y: 100,
    width: 200,
    height: 100,
    name: "Outer Block",
    anchors: [],
    selected: false,
  },
];

const GROUP_RECT = {
  x: 100 - GROUP_PAD,
  y: 100 - GROUP_PAD,
  width: 300 + GROUP_PAD * 2,
  height: 250,
};

const CONNECTIONS = [
  {
    id: "conn-1",
    sourceBlockId: "block-1",
    targetBlockId: "block-outer",
  },
];

// Click position inside the group but above inner blocks (in the padding area)
const GROUP_CLICK = { x: GROUP_RECT.x + GROUP_RECT.width / 2, y: GROUP_RECT.y + 5 };

test.describe("CollapsibleGroup", () => {
  let graphPO: GraphPageObject;

  /**
   * Set up graph with BlockGroups layer and a CollapsibleGroup.
   * Also registers a dblclick handler to toggle collapse/expand
   * (since CollapsibleGroup no longer has a built-in dblclick handler).
   */
  async function setupWithDblclick(page: any) {
    graphPO = new GraphPageObject(page);

    await graphPO.initialize({
      blocks: BLOCKS,
      connections: CONNECTIONS,
    });

    await graphPO.page.evaluate(
      ({ groupRect }) => {
        const { CollapsibleGroup, BlockGroups } = (window as any).GraphModule;
        const graph = window.graph;

        graph.addLayer(BlockGroups, { draggable: false });

        graph.rootStore.groupsList.setGroups([
          {
            id: "group-1",
            rect: groupRect,
            component: CollapsibleGroup,
            collapsed: false,
          },
        ]);

        // Register dblclick handler (mirrors what users must do now)
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
      },
      { groupRect: GROUP_RECT }
    );

    await graphPO.waitForFrames(5);
  }

  /**
   * Convert a world-coordinate rectangle to a viewport clip region
   * suitable for Playwright's `page.screenshot({ clip })`.
   * Adds `padding` pixels around the world rect.
   */
  async function worldRectToClip(
    worldRect: { x: number; y: number; width: number; height: number },
    padding = 20
  ): Promise<{ x: number; y: number; width: number; height: number }> {
    return graphPO.page.evaluate(
      ({ rect, pad }) => {
        const cam = window.graph.cameraService;
        const [x1, y1] = cam.getAbsoluteXY(rect.x - pad, rect.y - pad);
        const [x2, y2] = cam.getAbsoluteXY(rect.x + rect.width + pad, rect.y + rect.height + pad);
        const canvas = window.graph.getGraphCanvas();
        const bounds = canvas.getBoundingClientRect();
        return {
          x: Math.max(0, Math.round(x1 + bounds.left)),
          y: Math.max(0, Math.round(y1 + bounds.top)),
          width: Math.round(x2 - x1),
          height: Math.round(y2 - y1),
        };
      },
      { rect: worldRect, pad: padding }
    );
  }

  // ---------------------------------------------------------------------------
  // Group rendering and GraphComponent behavior
  // ---------------------------------------------------------------------------

  test.describe("rendering and events", () => {
    test.beforeEach(async ({ page }) => {
      await setupWithDblclick(page);
    });

    test("group is rendered and wraps specified blocks", async () => {
      const result = await graphPO.page.evaluate(() => {
        const groupState = window.graph.rootStore.groupsList.getGroupState("group-1");
        const rect = groupState?.$state.value.rect;
        return { exists: !!groupState, rect };
      });

      expect(result.exists).toBe(true);
      expect(result.rect.x).toBe(GROUP_RECT.x);
      expect(result.rect.y).toBe(GROUP_RECT.y);
      expect(result.rect.width).toBe(GROUP_RECT.width);
      expect(result.rect.height).toBe(GROUP_RECT.height);
    });

    test("group is a full GraphComponent — receives click events", async () => {
      const listener = await graphPO.listenGraphEvents("click");

      await graphPO.click(GROUP_CLICK.x, GROUP_CLICK.y);

      const targets = await listener.analyze((events) =>
        events.map((e: any) => e.detail?.target?.props?.id).filter(Boolean)
      );
      expect(targets).toContain("group-1");
      await listener.stop();
    });

    test("group is a full GraphComponent — receives mouseenter events", async () => {
      const listener = await graphPO.listenGraphEvents("mouseenter");

      await graphPO.hover(GROUP_CLICK.x, GROUP_CLICK.y);
      await graphPO.waitForFrames(2);

      const targets = await listener.analyze((events) =>
        events.map((e: any) => e.detail?.target?.props?.id).filter(Boolean)
      );
      expect(targets).toContain("group-1");
      await listener.stop();
    });

    test("group is a full GraphComponent — receives dblclick events", async () => {
      const listener = await graphPO.listenGraphEvents("dblclick");

      await graphPO.doubleClick(GROUP_CLICK.x, GROUP_CLICK.y, { waitFrames: 5 });

      const targets = await listener.analyze((events) =>
        events.map((e: any) => e.detail?.target?.props?.id).filter(Boolean)
      );
      expect(targets).toContain("group-1");
      await listener.stop();
    });
  });

  // ---------------------------------------------------------------------------
  // Collapse
  // ---------------------------------------------------------------------------

  test.describe("collapse", () => {
    test.beforeEach(async ({ page }) => {
      await setupWithDblclick(page);
    });

    // Scene rect covering group + outer block area for screenshots
    const SCENE_RECT = { x: 40, y: 40, width: 700, height: 360 };

    test("group shrinks to collapsed rect after collapse", async () => {
      const clipBefore = await worldRectToClip(SCENE_RECT);
      // TODO: generate linux snapshots
      // await expect(graphPO.page).toHaveScreenshot("collapse-before.png", { clip: clipBefore });

      await graphPO.doubleClick(GROUP_CLICK.x, GROUP_CLICK.y, { waitFrames: 5 });

      const state = await graphPO.page.evaluate(() => {
        return window.graph.rootStore.groupsList.getGroupState("group-1")?.$state.value;
      });

      // collapsedRect has the compact header dimensions
      expect(state.collapsedRect.x).toBe(GROUP_RECT.x);
      expect(state.collapsedRect.y).toBe(GROUP_RECT.y);
      expect(state.collapsedRect.width).toBe(200); // DEFAULT_COLLAPSED_WIDTH
      expect(state.collapsedRect.height).toBe(48); // DEFAULT_COLLAPSED_HEIGHT

      // rect is still the real bounding box (not locked)
      expect(state.rect.width).toBe(GROUP_RECT.width);
      expect(state.rect.height).toBe(GROUP_RECT.height);

      const clipAfter = await worldRectToClip(SCENE_RECT);
      // TODO: generate linux snapshots
      // await expect(graphPO.page).toHaveScreenshot("collapse-after.png", { clip: clipAfter });
    });

    test("emits group-collapse-change event with correct detail", async () => {
      const getEvents = await graphPO.collectGraphEventDetails("group-collapse-change");

      await graphPO.doubleClick(GROUP_CLICK.x, GROUP_CLICK.y, { waitFrames: 5 });

      const details = await getEvents();

      expect(details).toHaveLength(1);
      expect(details[0].groupId).toBe("group-1");
      expect(details[0].collapsed).toBe(true);
      expect(details[0].currentRect.width).toBe(GROUP_RECT.width);
      expect(details[0].nextRect.width).toBe(200);
      expect(details[0].nextRect.height).toBe(48);
    });

    test("preventDefault cancels collapse", async () => {
      // Register a handler that prevents collapse
      await graphPO.page.evaluate(() => {
        window.graph.on("group-collapse-change" as any, (event: any) => {
          event.preventDefault();
        });
      });

      await graphPO.doubleClick(GROUP_CLICK.x, GROUP_CLICK.y, { waitFrames: 5 });

      const collapsed = await graphPO.page.evaluate(() => {
        return window.graph.rootStore.groupsList.getGroupState("group-1")?.$state.value.collapsed;
      });

      expect(collapsed).toBeFalsy();
    });

    test("blocks inside group disappear after collapse", async () => {
      await graphPO.doubleClick(GROUP_CLICK.x, GROUP_CLICK.y, { waitFrames: 5 });

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

      const clip = await worldRectToClip(SCENE_RECT);
      // TODO: generate linux snapshots
      // await expect(graphPO.page).toHaveScreenshot("collapse-blocks-hidden.png", { clip });
    });

    test("connections redirect to group edges after collapse (port delegation)", async () => {
      await graphPO.doubleClick(GROUP_CLICK.x, GROUP_CLICK.y, { waitFrames: 5 });

      const result = await graphPO.page.evaluate((pad) => {
        const store = window.graph.rootStore;
        const b1 = store.blocksList.$blocksMap.value.get("block-1");
        const canvasBlock = b1?.getViewComponent();
        const outputPort = canvasBlock?.getOutputPort();
        const point = outputPort?.$point?.value;
        const groupState = store.groupsList.getGroupState("group-1")?.$state.value;
        const collapsedRect = groupState?.collapsedRect ?? groupState?.rect;

        // Group.getRect() adds padding, so port positions are at padded rect edges
        return {
          portX: point?.x,
          portY: point?.y,
          expectedX: collapsedRect ? collapsedRect.x + collapsedRect.width + pad : null,
          expectedY: collapsedRect ? collapsedRect.y + collapsedRect.height / 2 : null,
        };
      }, GROUP_PAD);

      // Output port should be at the right edge of the padded collapsedRect
      expect(result.portX).toBe(result.expectedX);
      expect(result.portY).toBe(result.expectedY);

      const clip = await worldRectToClip(SCENE_RECT);
      // TODO: generate linux snapshots
      // await expect(graphPO.page).toHaveScreenshot("collapse-port-delegation.png", { clip });
    });

    test("connection still exists between group block and outer block", async () => {
      await graphPO.doubleClick(GROUP_CLICK.x, GROUP_CLICK.y, { waitFrames: 5 });

      const exists = await graphPO.hasConnectionBetween("block-1", "block-outer");
      expect(exists).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Expand
  // ---------------------------------------------------------------------------

  test.describe("expand", () => {
    test.beforeEach(async ({ page }) => {
      await setupWithDblclick(page);
    });

    // Scene rect covering group + outer block area for screenshots
    const SCENE_RECT = { x: 40, y: 40, width: 700, height: 360 };

    test("group expands back to original rect", async () => {
      // Collapse
      await graphPO.doubleClick(GROUP_CLICK.x, GROUP_CLICK.y, { waitFrames: 5 });

      // The collapsed header is at { x:80, y:80, w:200, h:48 }, center = (180, 104)
      const collapsedCenter = { x: GROUP_RECT.x + 100, y: GROUP_RECT.y + 24 };
      await graphPO.doubleClick(collapsedCenter.x, collapsedCenter.y, { waitFrames: 5 });

      const state = await graphPO.page.evaluate(() => {
        return window.graph.rootStore.groupsList.getGroupState("group-1")?.$state.value;
      });

      expect(state.collapsed).toBeFalsy();
      expect(state.collapsedRect).toBeUndefined();
      expect(state.rect.x).toBe(GROUP_RECT.x);
      expect(state.rect.y).toBe(GROUP_RECT.y);
      expect(state.rect.width).toBe(GROUP_RECT.width);
      expect(state.rect.height).toBe(GROUP_RECT.height);

      const clip = await worldRectToClip(SCENE_RECT);
      // TODO: generate linux snapshots
      // await expect(graphPO.page).toHaveScreenshot("expand-after.png", { clip });
    });

    test("emits group-collapse-change event on expand", async () => {
      // Collapse first
      await graphPO.doubleClick(GROUP_CLICK.x, GROUP_CLICK.y, { waitFrames: 5 });

      // Set up event collection for the expand
      const getEvents = await graphPO.collectGraphEventDetails("group-collapse-change");

      const collapsedCenter = { x: GROUP_RECT.x + 100, y: GROUP_RECT.y + 24 };
      await graphPO.doubleClick(collapsedCenter.x, collapsedCenter.y, { waitFrames: 5 });

      const details = await getEvents();

      expect(details).toHaveLength(1);
      expect(details[0].groupId).toBe("group-1");
      expect(details[0].collapsed).toBe(false);
    });

    test("blocks are visible again after expand", async () => {
      await graphPO.doubleClick(GROUP_CLICK.x, GROUP_CLICK.y, { waitFrames: 5 });

      const collapsedCenter = { x: GROUP_RECT.x + 100, y: GROUP_RECT.y + 24 };
      await graphPO.doubleClick(collapsedCenter.x, collapsedCenter.y, { waitFrames: 5 });

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

      const clip = await worldRectToClip(SCENE_RECT);
      // TODO: generate linux snapshots
      // await expect(graphPO.page).toHaveScreenshot("expand-blocks-visible.png", { clip });
    });

    test("group hitbox is restored after expand — click on group works", async () => {
      // Collapse programmatically
      await graphPO.page.evaluate(() => {
        const { CollapsibleGroup } = (window as any).GraphModule;
        const layers = window.graph.layers.getLayers();
        for (const layer of layers) {
          const group = layer.$?.["group-1"];
          if (group instanceof CollapsibleGroup) {
            group.collapse();
            break;
          }
        }
      });
      await graphPO.waitForFrames(5);

      // Expand programmatically
      await graphPO.page.evaluate(() => {
        const { CollapsibleGroup } = (window as any).GraphModule;
        const layers = window.graph.layers.getLayers();
        for (const layer of layers) {
          const group = layer.$?.["group-1"];
          if (group instanceof CollapsibleGroup) {
            group.expand();
            break;
          }
        }
      });
      await graphPO.waitForFrames(5);

      // Click on the group at its original (expanded) position
      const listener = await graphPO.listenGraphEvents("click");
      await graphPO.click(GROUP_CLICK.x, GROUP_CLICK.y);

      const targets = await listener.analyze((events) =>
        events.map((e: any) => e.detail?.target?.props?.id).filter(Boolean),
      );
      expect(targets).toContain("group-1");
      await listener.stop();
    });

    test("connection ports return to block positions after expand", async () => {
      // Capture original port position
      const originalPort = await graphPO.page.evaluate(() => {
        const b1 = window.graph.rootStore.blocksList.$blocksMap.value.get("block-1");
        const port = b1?.getViewComponent()?.getOutputPort();
        const state = port?.$state?.value;
        return { x: state?.x, y: state?.y };
      });

      // Collapse
      await graphPO.doubleClick(GROUP_CLICK.x, GROUP_CLICK.y, { waitFrames: 5 });

      // Expand
      const collapsedCenter = { x: GROUP_RECT.x + 100, y: GROUP_RECT.y + 24 };
      await graphPO.doubleClick(collapsedCenter.x, collapsedCenter.y, { waitFrames: 5 });

      const restoredPort = await graphPO.page.evaluate(() => {
        const b1 = window.graph.rootStore.blocksList.$blocksMap.value.get("block-1");
        const port = b1?.getViewComponent()?.getOutputPort();
        const state = port?.$state?.value;
        return { x: state?.x, y: state?.y };
      });

      expect(restoredPort.x).toBe(originalPort.x);
      expect(restoredPort.y).toBe(originalPort.y);
    });
  });

  // ---------------------------------------------------------------------------
  // Anchor ports
  // ---------------------------------------------------------------------------

  test.describe("anchor port delegation", () => {
    const ANCHOR_GROUP_RECT = { x: 80, y: 80, width: 240, height: 140 };
    const ANCHOR_GROUP_CLICK = { x: ANCHOR_GROUP_RECT.x + 120, y: ANCHOR_GROUP_RECT.y + 5 };

    test.beforeEach(async ({ page }) => {
      graphPO = new GraphPageObject(page);

      const blocksWithAnchors = [
        {
          id: "block-a",
          is: "Block",
          x: 100,
          y: 100,
          width: 200,
          height: 100,
          name: "Block A",
          selected: false,
          group: "group-anchors",
          anchors: [
            { id: "anchor-out", blockId: "block-a", type: "OUT", index: 0 },
            { id: "anchor-in", blockId: "block-a", type: "IN", index: 0 },
          ],
        },
        {
          id: "block-b",
          is: "Block",
          x: 500,
          y: 100,
          width: 200,
          height: 100,
          name: "Block B",
          selected: false,
          anchors: [{ id: "anchor-in-b", blockId: "block-b", type: "IN", index: 0 }],
        },
      ];

      const anchorConnections = [
        {
          id: "conn-anchor",
          sourceBlockId: "block-a",
          sourceAnchorId: "anchor-out",
          targetBlockId: "block-b",
          targetAnchorId: "anchor-in-b",
        },
      ];

      await graphPO.initialize({
        blocks: blocksWithAnchors,
        connections: anchorConnections,
      });

      await graphPO.page.evaluate(
        ({ rect }) => {
          const { CollapsibleGroup, BlockGroups } = (window as any).GraphModule;
          const graph = window.graph;

          graph.addLayer(BlockGroups, { draggable: false });

          graph.rootStore.groupsList.setGroups([
            {
              id: "group-anchors",
              rect,
              component: CollapsibleGroup,
              collapsed: false,
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
        },
        { rect: ANCHOR_GROUP_RECT }
      );

      await graphPO.waitForFrames(5);
    });

    test("anchor OUT port redirects to right edge on collapse", async () => {
      await graphPO.doubleClick(ANCHOR_GROUP_CLICK.x, ANCHOR_GROUP_CLICK.y, { waitFrames: 5 });

      const result = await graphPO.page.evaluate((pad) => {
        const store = window.graph.rootStore;
        const blockA = store.blocksList.$blocksMap.value.get("block-a");
        const canvasBlock = blockA?.getViewComponent();

        const anchorPort = canvasBlock?.getAnchorPort("anchor-out");
        const point = anchorPort?.$point?.value;
        const gs = store.groupsList.getGroupState("group-anchors")?.$state.value;
        const groupRect = gs?.collapsedRect ?? gs?.rect;

        // Group.getRect() adds padding, so port positions are at padded rect edges
        return {
          portX: point?.x,
          portY: point?.y,
          expectedX: groupRect ? groupRect.x + groupRect.width + pad : null,
          expectedY: groupRect ? groupRect.y + groupRect.height / 2 : null,
        };
      }, GROUP_PAD);

      expect(result.portX).toBe(result.expectedX);
      expect(result.portY).toBe(result.expectedY);
    });

    test("anchor IN port redirects to left edge on collapse", async () => {
      await graphPO.doubleClick(ANCHOR_GROUP_CLICK.x, ANCHOR_GROUP_CLICK.y, { waitFrames: 5 });

      const result = await graphPO.page.evaluate((pad) => {
        const store = window.graph.rootStore;
        const blockA = store.blocksList.$blocksMap.value.get("block-a");
        const canvasBlock = blockA?.getViewComponent();

        const anchorPort = canvasBlock?.getAnchorPort("anchor-in");
        const point = anchorPort?.$point?.value;
        const gs = store.groupsList.getGroupState("group-anchors")?.$state.value;
        const groupRect = gs?.collapsedRect ?? gs?.rect;

        // Group.getRect() adds padding, left edge is shifted by -padding
        return {
          portX: point?.x,
          portY: point?.y,
          expectedX: groupRect ? groupRect.x - pad : null,
          expectedY: groupRect ? groupRect.y + groupRect.height / 2 : null,
        };
      }, GROUP_PAD);

      expect(result.portX).toBe(result.expectedX);
      expect(result.portY).toBe(result.expectedY);
    });

    test("connection still exists via anchor ports after collapse", async () => {
      await graphPO.doubleClick(ANCHOR_GROUP_CLICK.x, ANCHOR_GROUP_CLICK.y, { waitFrames: 5 });

      const exists = await graphPO.hasConnectionBetween("block-a", "block-b");
      expect(exists).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Collapse → move group → expand (draggable groups)
  // ---------------------------------------------------------------------------

  test.describe("collapse, move, expand", () => {
    test.beforeEach(async ({ page }) => {
      graphPO = new GraphPageObject(page);

      await graphPO.initialize({
        blocks: BLOCKS,
        connections: CONNECTIONS,
        settings: {
          canDrag: "all",
          canDragCamera: false,
        },
      });

      // Use withBlockGrouping so $groupsBlocksMap is populated (required for updateBlocksOnDrag)
      await graphPO.page.evaluate(
        ({ groupRect }) => {
          const { CollapsibleGroup, BlockGroups } = (window as any).GraphModule;
          const graph = window.graph;

          const CollapsibleBlockGroups = BlockGroups.withBlockGrouping({
            groupingFn: (blocks: any[]) => {
              const result: Record<string, any[]> = {};
              blocks.forEach((block: any) => {
                const groupId = block.$state.value.group;
                if (groupId) {
                  if (!result[groupId]) result[groupId] = [];
                  result[groupId].push(block);
                }
              });
              return result;
            },
            mapToGroups: (_key: string, { rect }: any) => ({
              id: _key,
              rect: {
                x: rect.x - 20,
                y: rect.y - 20,
                width: rect.width + 40,
                height: rect.height + 40,
              },
              component: CollapsibleGroup,
            }),
          });

          graph.addLayer(CollapsibleBlockGroups, { draggable: true, updateBlocksOnDrag: true });

          // Register dblclick handler
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
        },
        { groupRect: GROUP_RECT }
      );

      await graphPO.waitForFrames(5);
    });

    // TODO: drag distance varies across platforms, making exact position checks unreliable on Linux CI
    test.skip("blocks move with group after collapse → drag → expand", async () => {
      // Capture initial block positions
      const initialPositions = await graphPO.page.evaluate(() => {
        const store = window.graph.rootStore;
        const b1 = store.blocksList.$blocksMap.value.get("block-1");
        const b2 = store.blocksList.$blocksMap.value.get("block-2");
        return {
          b1: { x: b1?.$geometry.value.x, y: b1?.$geometry.value.y },
          b2: { x: b2?.$geometry.value.x, y: b2?.$geometry.value.y },
        };
      });

      // Collapse
      await graphPO.doubleClick(GROUP_CLICK.x, GROUP_CLICK.y, { waitFrames: 5 });

      const collapsed = await graphPO.page.evaluate(() => {
        return window.graph.rootStore.groupsList.getGroupState("group-1")?.$state.value.collapsed;
      });
      expect(collapsed).toBe(true);

      // Drag the collapsed group
      const dragDx = 200;
      const dragDy = 100;
      const collapsedCenter = { x: GROUP_RECT.x + 100, y: GROUP_RECT.y + 24 };

      await graphPO.dragTo(
        collapsedCenter.x,
        collapsedCenter.y,
        collapsedCenter.x + dragDx,
        collapsedCenter.y + dragDy,
        { waitFrames: 20 },
      );

      // Verify collapsedRect moved
      const movedState = await graphPO.page.evaluate(() => {
        return window.graph.rootStore.groupsList.getGroupState("group-1")?.$state.value;
      });
      const movedCollapsedRect = movedState.collapsedRect;
      expect(movedCollapsedRect).toBeTruthy();
      // Verify the group actually moved (drag distance varies across platforms)
      expect(movedCollapsedRect.x).toBeGreaterThan(GROUP_RECT.x);

      // Compute the actual drag delta from the collapsedRect movement
      const originalCollapsedX = GROUP_RECT.x; // default direction start
      const originalCollapsedY = GROUP_RECT.y;
      const actualDx = movedCollapsedRect.x - originalCollapsedX;
      const actualDy = movedCollapsedRect.y - originalCollapsedY;

      // Expand at new position (use actual moved center, not target)
      const movedCollapsedCenter = {
        x: movedCollapsedRect.x + 100,
        y: movedCollapsedRect.y + 24,
      };
      await graphPO.doubleClick(movedCollapsedCenter.x, movedCollapsedCenter.y, { waitFrames: 5 });

      // Verify expand happened
      const expandedState = await graphPO.page.evaluate(() => {
        return window.graph.rootStore.groupsList.getGroupState("group-1")?.$state.value.collapsed;
      });
      expect(expandedState).toBeFalsy();

      // Check that blocks moved by the actual group drag delta
      const finalPositions = await graphPO.page.evaluate(() => {
        const store = window.graph.rootStore;
        const b1 = store.blocksList.$blocksMap.value.get("block-1");
        const b2 = store.blocksList.$blocksMap.value.get("block-2");
        return {
          b1: { x: b1?.$geometry.value.x, y: b1?.$geometry.value.y },
          b2: { x: b2?.$geometry.value.x, y: b2?.$geometry.value.y },
        };
      });

      // Block positions should have shifted by the same delta as the group
      const tolerance = 5;
      expect(Math.abs(finalPositions.b1.x - initialPositions.b1.x - actualDx)).toBeLessThan(tolerance);
      expect(Math.abs(finalPositions.b1.y - initialPositions.b1.y - actualDy)).toBeLessThan(tolerance);
      expect(Math.abs(finalPositions.b2.x - initialPositions.b2.x - actualDx)).toBeLessThan(tolerance);
      expect(Math.abs(finalPositions.b2.y - initialPositions.b2.y - actualDy)).toBeLessThan(tolerance);
    });
  });

  // ---------------------------------------------------------------------------
  // Initial collapsed state
  // ---------------------------------------------------------------------------
  //
  // These tests cover the fix where `subscribeToGroup` now calls
  // `updateHitBox(rect)` immediately after `delegatePorts` so that a group
  // mounted with `collapsed: true` has the correct collapsed hitbox from the
  // very first frame — without needing an explicit `collapse()` call.
  // ---------------------------------------------------------------------------

  test.describe("initial collapsed state", () => {
    /**
     * Layout used across all tests in this section:
     * Same blocks/connections as the outer suite.
     * Group starts with collapsed: true — no dblclick needed to collapse.
     *
     * Default collapsed rect: { x:80, y:80, w:200, h:48 }
     * Expanded visual rect (after padding): { x:60, y:60, w:380, h:310 }
     *   (GROUP_RECT + 20px padding on each side via Group.getRect)
     */
    test.beforeEach(async ({ page }) => {
      graphPO = new GraphPageObject(page);

      await graphPO.initialize({
        blocks: BLOCKS,
        connections: CONNECTIONS,
      });

      await graphPO.page.evaluate(
        ({ groupRect }) => {
          const { CollapsibleGroup, BlockGroups } = (window as any).GraphModule;
          const graph = window.graph;

          graph.addLayer(BlockGroups, { draggable: false });

          // Mount with collapsed: true — the hitbox must be set to the
          // collapsed rect immediately, without a separate collapse() call.
          graph.rootStore.groupsList.setGroups([
            {
              id: "group-1",
              rect: groupRect,
              component: CollapsibleGroup,
              collapsed: true,
            },
          ]);

          // Register dblclick handler so expand works in tests that need it
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
        },
        { groupRect: GROUP_RECT }
      );

      await graphPO.waitForFrames(5);
    });

    test("isCollapsed() returns true immediately after mount", async () => {
      const isCollapsed = await graphPO.page.evaluate(() => {
        const { CollapsibleGroup } = (window as any).GraphModule;
        for (const layer of window.graph.layers.getLayers()) {
          const group = layer.$?.["group-1"];
          if (group instanceof CollapsibleGroup) {
            return group.isCollapsed();
          }
        }
        return null;
      });

      expect(isCollapsed).toBe(true);
    });

    test("inner blocks are hidden immediately after mount", async () => {
      const { b1Hidden, b2Hidden } = await graphPO.page.evaluate(() => {
        const store = window.graph.rootStore;
        const b1 = store.blocksList.$blocksMap.value.get("block-1");
        const b2 = store.blocksList.$blocksMap.value.get("block-2");
        return {
          b1Hidden: b1?.getViewComponent()?.isRendered() === false,
          b2Hidden: b2?.getViewComponent()?.isRendered() === false,
        };
      });

      expect(b1Hidden).toBe(true);
      expect(b2Hidden).toBe(true);
    });

    test("collapsedRect is stored in group state immediately after mount", async () => {
      const state = await graphPO.page.evaluate(() => {
        return window.graph.rootStore.groupsList.getGroupState("group-1")?.$state.value;
      });

      expect(state.collapsed).toBe(true);
      expect(state.collapsedRect).toBeTruthy();
      // Default collapsed rect aligns top-left with expanded rect
      expect(state.collapsedRect.x).toBe(GROUP_RECT.x);
      expect(state.collapsedRect.y).toBe(GROUP_RECT.y);
      expect(state.collapsedRect.width).toBe(200); // DEFAULT_COLLAPSED_WIDTH
      expect(state.collapsedRect.height).toBe(48); // DEFAULT_COLLAPSED_HEIGHT
    });

    test("click inside collapsed header rect registers on the group", async () => {
      // Collapsed header center: (80 + 100, 80 + 24) = (180, 104)
      const collapsedCenter = { x: GROUP_RECT.x + 100, y: GROUP_RECT.y + 24 };

      const listener = await graphPO.listenGraphEvents("click");
      await graphPO.click(collapsedCenter.x, collapsedCenter.y);

      const targets = await listener.analyze((events) =>
        events.map((e: any) => e.detail?.target?.props?.id).filter(Boolean)
      );
      expect(targets).toContain("group-1");
      await listener.stop();
    });

    test("click in expanded-only area (outside collapsed rect) does NOT hit group", async () => {
      // The expanded visual rect spans ~310px tall but the collapsed rect is
      // only 48px tall. A point at y = GROUP_RECT.y + 150 is outside the
      // collapsed hitbox but inside the old expanded hitbox.
      const belowCollapsedHeader = { x: GROUP_RECT.x + 100, y: GROUP_RECT.y + 150 };

      const listener = await graphPO.listenGraphEvents("click");
      await graphPO.click(belowCollapsedHeader.x, belowCollapsedHeader.y);

      const targets = await listener.analyze((events) =>
        events.map((e: any) => e.detail?.target?.props?.id).filter(Boolean)
      );
      // Without the fix, the hitbox was the expanded visual rect so this click
      // would incorrectly land on the group.
      expect(targets).not.toContain("group-1");
      await listener.stop();
    });

    test("expand after initial-collapsed mount restores hitbox to expanded area", async () => {
      const collapsedCenter = { x: GROUP_RECT.x + 100, y: GROUP_RECT.y + 24 };
      await graphPO.doubleClick(collapsedCenter.x, collapsedCenter.y, { waitFrames: 5 });

      const state = await graphPO.page.evaluate(() => {
        return window.graph.rootStore.groupsList.getGroupState("group-1")?.$state.value;
      });
      expect(state.collapsed).toBeFalsy();

      // After expand, a click in the original expanded padding area should hit
      const listener = await graphPO.listenGraphEvents("click");
      await graphPO.click(GROUP_CLICK.x, GROUP_CLICK.y);

      const targets = await listener.analyze((events) =>
        events.map((e: any) => e.detail?.target?.props?.id).filter(Boolean)
      );
      expect(targets).toContain("group-1");
      await listener.stop();
    });
  });

  // ---------------------------------------------------------------------------
  // Custom getCollapseRect
  // ---------------------------------------------------------------------------

  test.describe("custom getCollapseRect", () => {
    test("uses user-provided getCollapseRect function", async ({ page }) => {
      graphPO = new GraphPageObject(page);

      await graphPO.initialize({
        blocks: BLOCKS,
        connections: CONNECTIONS,
      });

      await graphPO.page.evaluate(
        ({ groupRect }) => {
          const { CollapsibleGroup, BlockGroups } = (window as any).GraphModule;
          const graph = window.graph;

          graph.addLayer(BlockGroups, { draggable: false });

          graph.rootStore.groupsList.setGroups([
            {
              id: "group-1",
              rect: groupRect,
              component: CollapsibleGroup,
              collapsed: false,
              // Custom collapse rect: 150x40, centered horizontally, top-aligned
              getCollapseRect: (_group: any, rect: any) => ({
                x: rect.x + rect.width / 2 - 75,
                y: rect.y,
                width: 150,
                height: 40,
              }),
            },
          ]);

          // Register dblclick handler
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
        },
        { groupRect: GROUP_RECT }
      );

      await graphPO.waitForFrames(5);

      // Collapse via double-click on group padding area
      await graphPO.doubleClick(GROUP_CLICK.x, GROUP_CLICK.y, { waitFrames: 5 });

      const collapsedRect = await graphPO.page.evaluate(() => {
        return window.graph.rootStore.groupsList.getGroupState("group-1")?.$state.value.collapsedRect;
      });

      // Custom rect: centered at x, top-aligned y, 150x40
      expect(collapsedRect.width).toBe(150);
      expect(collapsedRect.height).toBe(40);
      expect(collapsedRect.y).toBe(GROUP_RECT.y);
      expect(collapsedRect.x).toBe(GROUP_RECT.x + GROUP_RECT.width / 2 - 75);

      const sceneRect = { x: 40, y: 40, width: 700, height: 360 };
      const clip = await worldRectToClip(sceneRect);
      // TODO: generate linux snapshots
      // await expect(graphPO.page).toHaveScreenshot("custom-collapse-rect.png", { clip });
    });
  });
});
