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

      expect(collapsed).toBe(false);
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

      // Geometry must be resolved — source endpoint is now at the group right edge
      const geo = await graphPO.getConnectionGeometry("block-1", "block-outer");
      expect(geo).not.toBeNull();
      // Source point should have moved to the group's right edge (not block-1's original x)
      const state = await graphPO.page.evaluate(() =>
        window.graph.rootStore.groupsList.getGroupState("group-1")?.$state.value
      );
      const collapsedRect = (state as any)?.collapsedRect;
      expect(geo!.source.x).toBe(collapsedRect.x + collapsedRect.width + GROUP_PAD);
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

      expect(state.collapsed).toBe(false);
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

      // Geometry must be resolved and source endpoint moved to group right edge
      const geo = await graphPO.getConnectionGeometry("block-a", "block-b");
      expect(geo).not.toBeNull();
      const gs = await graphPO.page.evaluate(() =>
        window.graph.rootStore.groupsList.getGroupState("group-anchors")?.$state.value
      );
      const collapsedRect = (gs as any)?.collapsedRect;
      expect(geo!.source.x).toBe(collapsedRect.x + collapsedRect.width + GROUP_PAD);
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
        // No connections: connection geometry can sit above the group and steal hit-tests,
        // so mousedown would not start a group drag.
        connections: [],
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

    /** Inner group rect center (expanded); same coordinate space as `GROUP_RECT`. */
    const EXPANDED_GROUP_CENTER = {
      x: GROUP_RECT.x + GROUP_RECT.width / 2,
      y: GROUP_RECT.y + GROUP_RECT.height / 2,
    };

    test("collapse → drag collapsed header → expand keeps geometry and hitbox", async () => {
      await graphPO.click(GROUP_CLICK.x, GROUP_CLICK.y);
      await graphPO.doubleClick(GROUP_CLICK.x, GROUP_CLICK.y, { waitFrames: 5 });

      const before = await graphPO.page.evaluate(() => {
        const g = window.graph.rootStore.groupsList.getGroupState("group-1")?.$state.value;
        return { collapsedRect: g?.collapsedRect, rect: g?.rect };
      });
      expect(before.collapsedRect).toBeDefined();

      await graphPO.dragTo(
        before.collapsedRect!.x + before.collapsedRect!.width / 2,
        before.collapsedRect!.y + before.collapsedRect!.height / 2,
        before.collapsedRect!.x + before.collapsedRect!.width / 2 + 50,
        before.collapsedRect!.y + before.collapsedRect!.height / 2 + 30,
        { waitFrames: 25 },
      );

      const after = await graphPO.page.evaluate(() => {
        const g = window.graph.rootStore.groupsList.getGroupState("group-1")?.$state.value;
        return { collapsedRect: g?.collapsedRect, rect: g?.rect };
      });

      const rdx = after.rect!.x - before.rect!.x;
      const rdy = after.rect!.y - before.rect!.y;
      expect(rdx).not.toBe(0);
      expect(rdy).not.toBe(0);

      const crBefore = before.collapsedRect!;
      const crAfter = after.collapsedRect;
      expect(crAfter?.x).toBeCloseTo(crBefore.x + rdx, 5);
      expect(crAfter?.y).toBeCloseTo(crBefore.y + rdy, 5);

      const collapsedCenter = {
        x: crAfter!.x + crAfter!.width / 2,
        y: crAfter!.y + crAfter!.height / 2,
      };
      await graphPO.doubleClick(collapsedCenter.x, collapsedCenter.y, { waitFrames: 5 });

      const expanded = await graphPO.page.evaluate(() => {
        const g = window.graph.rootStore.groupsList.getGroupState("group-1")?.$state.value;
        return { collapsed: g?.collapsed, collapsedRect: g?.collapsedRect, rect: g?.rect };
      });
      expect(expanded.collapsed).toBe(false);
      expect(expanded.collapsedRect).toBeUndefined();
      expect(expanded.rect).toBeDefined();

      const listener = await graphPO.listenGraphEvents("click");
      await graphPO.click(
        expanded.rect!.x + expanded.rect!.width / 2,
        expanded.rect!.y + expanded.rect!.height / 2,
      );
      const targets = await listener.analyze((events: any[]) =>
        events.map((e: any) => e.detail?.target?.props?.id).filter(Boolean),
      );
      expect(targets).toContain("group-1");
      await listener.stop();
    });

    test("snapped drag: collapsedRect tracks snapped inner rect (SNAPPING_GRID_SIZE > 1)", async () => {
      await graphPO.page.evaluate(() => {
        window.graph.setConstants({ block: { SNAPPING_GRID_SIZE: 40 } });
      });
      await graphPO.waitForFrames(2);

      await graphPO.click(GROUP_CLICK.x, GROUP_CLICK.y);
      await graphPO.doubleClick(GROUP_CLICK.x, GROUP_CLICK.y, { waitFrames: 5 });

      const innerBefore = await graphPO.page.evaluate(() => {
        const g = window.graph.rootStore.groupsList.getGroupState("group-1")?.$state.value;
        return { rect: g?.rect, collapsedRect: g?.collapsedRect };
      });
      expect(innerBefore?.collapsedRect).toBeDefined();

      await graphPO.dragTo(
        innerBefore!.collapsedRect!.x + innerBefore!.collapsedRect!.width / 2,
        innerBefore!.collapsedRect!.y + innerBefore!.collapsedRect!.height / 2,
        innerBefore!.collapsedRect!.x + innerBefore!.collapsedRect!.width / 2 + 55,
        innerBefore!.collapsedRect!.y + innerBefore!.collapsedRect!.height / 2 + 35,
        { waitFrames: 25 },
      );

      const after = await graphPO.page.evaluate(() => {
        const g = window.graph.rootStore.groupsList.getGroupState("group-1")?.$state.value;
        return { rect: g?.rect, collapsedRect: g?.collapsedRect };
      });

      const dx = after.rect!.x - innerBefore!.rect!.x;
      const dy = after.rect!.y - innerBefore!.rect!.y;
      const dcx = after.collapsedRect!.x - innerBefore!.collapsedRect!.x;
      const dcy = after.collapsedRect!.y - innerBefore!.collapsedRect!.y;
      expect(dcx).toBeCloseTo(dx, 5);
      expect(dcy).toBeCloseTo(dy, 5);
    });

    test("move expanded group → collapse: hitbox matches collapsed header only", async () => {
      await graphPO.click(GROUP_CLICK.x, GROUP_CLICK.y);
      await graphPO.dragTo(
        EXPANDED_GROUP_CENTER.x,
        EXPANDED_GROUP_CENTER.y,
        EXPANDED_GROUP_CENTER.x + 70,
        EXPANDED_GROUP_CENTER.y + 40,
        { waitFrames: 25 },
      );

      const rectAfterDrag = await graphPO.page.evaluate(() => {
        const g = window.graph.rootStore.groupsList.getGroupState("group-1")?.$state.value;
        return g?.rect;
      });
      expect(rectAfterDrag).toBeDefined();

      await graphPO.doubleClick(
        rectAfterDrag!.x + rectAfterDrag!.width / 2,
        rectAfterDrag!.y + 8,
        { waitFrames: 5 },
      );

      const collapsed = await graphPO.page.evaluate(() => {
        const g = window.graph.rootStore.groupsList.getGroupState("group-1")?.$state.value;
        return g?.collapsedRect;
      });
      expect(collapsed).toBeDefined();

      const belowHeader = {
        x: collapsed!.x + collapsed!.width / 2,
        y: collapsed!.y + collapsed!.height + 40,
      };

      const listener = await graphPO.listenGraphEvents("click");
      await graphPO.click(belowHeader.x, belowHeader.y);
      let targets = await listener.analyze((events: any[]) =>
        events.map((e: any) => e.detail?.target?.props?.id).filter(Boolean),
      );
      expect(targets).not.toContain("group-1");
      await listener.stop();

      const headerCenter = {
        x: collapsed!.x + collapsed!.width / 2,
        y: collapsed!.y + collapsed!.height / 2,
      };
      const listener2 = await graphPO.listenGraphEvents("click");
      await graphPO.click(headerCenter.x, headerCenter.y);
      targets = await listener2.analyze((events: any[]) =>
        events.map((e: any) => e.detail?.target?.props?.id).filter(Boolean),
      );
      expect(targets).toContain("group-1");
      await listener2.stop();
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

    test("collapsedRect is stored in group state immediately after mount", async () => {
      const state = await graphPO.page.evaluate(() => {
        return window.graph.rootStore.groupsList.getGroupState("group-1")?.$state.value;
      });

      expect(state.collapsed).toBe(true);
      expect(state.collapsedRect).toBeDefined();
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

  });

  // ---------------------------------------------------------------------------
  // Programmatic collapse via setGroups (data-driven API)
  // ---------------------------------------------------------------------------
  //
  // These tests verify that passing `collapsed: true/false` through
  // `graph.rootStore.groupsList.setGroups()` — without calling `.collapse()`
  // or `.expand()` imperatively — correctly drives the component:
  //   - blocks are hidden/shown
  //   - ports are delegated/undelegated and positions are correct
  //   - connections become hidden/visible ($hidden signal)
  //   - hitbox follows the collapsed/expanded rect
  //
  // This is the data-driven contract of the library: the component must react
  // to store updates the same way it reacts to imperative calls.
  // ---------------------------------------------------------------------------

  test.describe("programmatic collapsed prop via setGroups", () => {
    test.beforeEach(async ({ page }) => {
      graphPO = new GraphPageObject(page);

      await graphPO.initialize({
        blocks: BLOCKS,
        connections: CONNECTIONS,
      });

      // Set up graph with group initially EXPANDED (collapsed: false).
      // No dblclick handler — all state changes go through setGroups.
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
        },
        { groupRect: GROUP_RECT }
      );

      await graphPO.waitForFrames(5);
    });

    test("setGroups with collapsed:true hides inner blocks", async () => {
      await graphPO.page.evaluate(
        ({ groupRect }) => {
          window.graph.rootStore.groupsList.setGroups([
            {
              id: "group-1",
              rect: groupRect,
              component: (window as any).GraphModule.CollapsibleGroup,
              collapsed: true,
            },
          ]);
        },
        { groupRect: GROUP_RECT }
      );
      await graphPO.waitForFrames(5);

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

    test("setGroups with collapsed:true delegates output port to right group edge", async () => {
      // Capture original port position before collapse
      const originalPort = await graphPO.page.evaluate(() => {
        const b1 = window.graph.rootStore.blocksList.$blocksMap.value.get("block-1");
        const port = b1?.getViewComponent()?.getOutputPort();
        return { x: port?.$state?.value?.x, y: port?.$state?.value?.y };
      });

      await graphPO.page.evaluate(
        ({ groupRect }) => {
          window.graph.rootStore.groupsList.setGroups([
            {
              id: "group-1",
              rect: groupRect,
              component: (window as any).GraphModule.CollapsibleGroup,
              collapsed: true,
            },
          ]);
        },
        { groupRect: GROUP_RECT }
      );
      await graphPO.waitForFrames(5);

      const result = await graphPO.page.evaluate((pad) => {
        const store = window.graph.rootStore;
        const b1 = store.blocksList.$blocksMap.value.get("block-1");
        const canvasBlock = b1?.getViewComponent();
        const outputPort = canvasBlock?.getOutputPort();
        const point = outputPort?.$point?.value;
        const gs = store.groupsList.getGroupState("group-1")?.$state.value;
        const collapsedRect = gs?.collapsedRect ?? gs?.rect;

        return {
          isDelegated: outputPort?.isDelegated ?? false,
          portX: point?.x,
          portY: point?.y,
          expectedX: collapsedRect ? collapsedRect.x + collapsedRect.width + pad : null,
          expectedY: collapsedRect ? collapsedRect.y + collapsedRect.height / 2 : null,
        };
      }, GROUP_PAD);

      expect(result.isDelegated).toBe(true);
      expect(result.portX).toBe(result.expectedX);
      expect(result.portY).toBe(result.expectedY);

      // Port must have actually moved from original position
      expect(result.portX).not.toBe(originalPort.x);
    });

    test("setGroups with collapsed:false after collapse restores block visibility", async () => {
      // Collapse via setGroups
      await graphPO.page.evaluate(
        ({ groupRect }) => {
          window.graph.rootStore.groupsList.setGroups([
            {
              id: "group-1",
              rect: groupRect,
              component: (window as any).GraphModule.CollapsibleGroup,
              collapsed: true,
            },
          ]);
        },
        { groupRect: GROUP_RECT }
      );
      await graphPO.waitForFrames(5);

      // Expand via setGroups
      await graphPO.page.evaluate(
        ({ groupRect }) => {
          window.graph.rootStore.groupsList.setGroups([
            {
              id: "group-1",
              rect: groupRect,
              component: (window as any).GraphModule.CollapsibleGroup,
              collapsed: false,
            },
          ]);
        },
        { groupRect: GROUP_RECT }
      );
      await graphPO.waitForFrames(5);

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

    test("setGroups with collapsed:false restores port positions to original", async () => {
      // Capture original port position
      const originalPort = await graphPO.page.evaluate(() => {
        const b1 = window.graph.rootStore.blocksList.$blocksMap.value.get("block-1");
        const port = b1?.getViewComponent()?.getOutputPort();
        return { x: port?.$state?.value?.x, y: port?.$state?.value?.y };
      });

      // Collapse
      await graphPO.page.evaluate(
        ({ groupRect }) => {
          window.graph.rootStore.groupsList.setGroups([
            {
              id: "group-1",
              rect: groupRect,
              component: (window as any).GraphModule.CollapsibleGroup,
              collapsed: true,
            },
          ]);
        },
        { groupRect: GROUP_RECT }
      );
      await graphPO.waitForFrames(5);

      // Expand
      await graphPO.page.evaluate(
        ({ groupRect }) => {
          window.graph.rootStore.groupsList.setGroups([
            {
              id: "group-1",
              rect: groupRect,
              component: (window as any).GraphModule.CollapsibleGroup,
              collapsed: false,
            },
          ]);
        },
        { groupRect: GROUP_RECT }
      );
      await graphPO.waitForFrames(5);

      const restoredPort = await graphPO.page.evaluate(() => {
        const b1 = window.graph.rootStore.blocksList.$blocksMap.value.get("block-1");
        const port = b1?.getViewComponent()?.getOutputPort();
        return {
          isDelegated: port?.isDelegated ?? true,
          x: port?.$state?.value?.x,
          y: port?.$state?.value?.y,
        };
      });

      expect(restoredPort.isDelegated).toBe(false);
      expect(restoredPort.x).toBe(originalPort.x);
      expect(restoredPort.y).toBe(originalPort.y);
    });

    test("connection $hidden is true when both endpoints are in a collapsed group", async () => {
      // Add a second connection fully inside the group (block-1 → block-2)
      await graphPO.page.evaluate(() => {
        window.graph.rootStore.connectionsList.setConnections([
          { id: "conn-1", sourceBlockId: "block-1", targetBlockId: "block-outer" },
          { id: "conn-internal", sourceBlockId: "block-1", targetBlockId: "block-2" },
        ]);
      });
      await graphPO.waitForFrames(3);

      // Collapse
      await graphPO.page.evaluate(
        ({ groupRect }) => {
          window.graph.rootStore.groupsList.setGroups([
            {
              id: "group-1",
              rect: groupRect,
              component: (window as any).GraphModule.CollapsibleGroup,
              collapsed: true,
            },
          ]);
        },
        { groupRect: GROUP_RECT }
      );
      await graphPO.waitForFrames(5);

      const result = await graphPO.page.evaluate(() => {
        const cl = window.graph.rootStore.connectionsList;
        const connExternal = cl.$connectionsMap.value.get("conn-1");
        const connInternal = cl.$connectionsMap.value.get("conn-internal");
        return {
          externalHidden: connExternal?.$hidden?.value,
          internalHidden: connInternal?.$hidden?.value,
        };
      });

      // Internal connection (both blocks collapsed) must be hidden
      expect(result.internalHidden).toBe(true);
      // External connection (one endpoint outside the group) must NOT be hidden
      expect(result.externalHidden).toBe(false);
    });

    test("connection $hidden returns to false after expand via setGroups", async () => {
      // Internal connection
      await graphPO.page.evaluate(() => {
        window.graph.rootStore.connectionsList.setConnections([
          { id: "conn-1", sourceBlockId: "block-1", targetBlockId: "block-outer" },
          { id: "conn-internal", sourceBlockId: "block-1", targetBlockId: "block-2" },
        ]);
      });
      await graphPO.waitForFrames(3);

      // Collapse
      await graphPO.page.evaluate(
        ({ groupRect }) => {
          window.graph.rootStore.groupsList.setGroups([
            {
              id: "group-1",
              rect: groupRect,
              component: (window as any).GraphModule.CollapsibleGroup,
              collapsed: true,
            },
          ]);
        },
        { groupRect: GROUP_RECT }
      );
      await graphPO.waitForFrames(5);

      // Expand
      await graphPO.page.evaluate(
        ({ groupRect }) => {
          window.graph.rootStore.groupsList.setGroups([
            {
              id: "group-1",
              rect: groupRect,
              component: (window as any).GraphModule.CollapsibleGroup,
              collapsed: false,
            },
          ]);
        },
        { groupRect: GROUP_RECT }
      );
      await graphPO.waitForFrames(5);

      const result = await graphPO.page.evaluate(() => {
        const cl = window.graph.rootStore.connectionsList;
        const connInternal = cl.$connectionsMap.value.get("conn-internal");
        return { internalHidden: connInternal?.$hidden?.value };
      });

      expect(result.internalHidden).toBe(false);
    });

    test("hitbox after setGroups collapse is at collapsed rect — click outside collapsed area misses group", async () => {
      await graphPO.page.evaluate(
        ({ groupRect }) => {
          window.graph.rootStore.groupsList.setGroups([
            {
              id: "group-1",
              rect: groupRect,
              component: (window as any).GraphModule.CollapsibleGroup,
              collapsed: true,
            },
          ]);
        },
        { groupRect: GROUP_RECT }
      );
      await graphPO.waitForFrames(5);

      // Click below the collapsed header (y + 150) but inside the old expanded area
      const belowCollapsedHeader = { x: GROUP_RECT.x + 100, y: GROUP_RECT.y + 150 };

      const listener = await graphPO.listenGraphEvents("click");
      await graphPO.click(belowCollapsedHeader.x, belowCollapsedHeader.y);

      const targets = await listener.analyze((events) =>
        events.map((e: any) => e.detail?.target?.props?.id).filter(Boolean)
      );
      expect(targets).not.toContain("group-1");
      await listener.stop();
    });

    test("hitbox after setGroups expand is restored — click in expanded area hits group", async () => {
      // Collapse
      await graphPO.page.evaluate(
        ({ groupRect }) => {
          window.graph.rootStore.groupsList.setGroups([
            {
              id: "group-1",
              rect: groupRect,
              component: (window as any).GraphModule.CollapsibleGroup,
              collapsed: true,
            },
          ]);
        },
        { groupRect: GROUP_RECT }
      );
      await graphPO.waitForFrames(5);

      // Expand
      await graphPO.page.evaluate(
        ({ groupRect }) => {
          window.graph.rootStore.groupsList.setGroups([
            {
              id: "group-1",
              rect: groupRect,
              component: (window as any).GraphModule.CollapsibleGroup,
              collapsed: false,
            },
          ]);
        },
        { groupRect: GROUP_RECT }
      );
      await graphPO.waitForFrames(5);

      // Click in the original group padding area (above block-1, inside group visual rect)
      const listener = await graphPO.listenGraphEvents("click");
      await graphPO.click(GROUP_CLICK.x, GROUP_CLICK.y);

      const targets = await listener.analyze((events) =>
        events.map((e: any) => e.detail?.target?.props?.id).filter(Boolean)
      );
      expect(targets).toContain("group-1");
      await listener.stop();
    });

    test("multiple collapse/expand cycles via setGroups remain consistent", async () => {
      for (let i = 0; i < 3; i++) {
        // Collapse
        await graphPO.page.evaluate(
          ({ groupRect }) => {
            window.graph.rootStore.groupsList.setGroups([
              {
                id: "group-1",
                rect: groupRect,
                component: (window as any).GraphModule.CollapsibleGroup,
                collapsed: true,
              },
            ]);
          },
          { groupRect: GROUP_RECT }
        );
        await graphPO.waitForFrames(5);

        const collapsedState = await graphPO.page.evaluate(() => {
          const store = window.graph.rootStore;
          const b1 = store.blocksList.$blocksMap.value.get("block-1");
          const port = b1?.getViewComponent()?.getOutputPort();
          return {
            b1Hidden: b1?.getViewComponent()?.isRendered() === false,
            portDelegated: port?.isDelegated ?? false,
          };
        });
        expect(collapsedState.b1Hidden).toBe(true);
        expect(collapsedState.portDelegated).toBe(true);

        // Expand
        await graphPO.page.evaluate(
          ({ groupRect }) => {
            window.graph.rootStore.groupsList.setGroups([
              {
                id: "group-1",
                rect: groupRect,
                component: (window as any).GraphModule.CollapsibleGroup,
                collapsed: false,
              },
            ]);
          },
          { groupRect: GROUP_RECT }
        );
        await graphPO.waitForFrames(5);

        const expandedState = await graphPO.page.evaluate(() => {
          const store = window.graph.rootStore;
          const b1 = store.blocksList.$blocksMap.value.get("block-1");
          const port = b1?.getViewComponent()?.getOutputPort();
          return {
            b1Rendered: b1?.getViewComponent()?.isRendered() ?? false,
            portDelegated: port?.isDelegated ?? true,
          };
        });
        expect(expandedState.b1Rendered).toBe(true);
        expect(expandedState.portDelegated).toBe(false);
      }
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

  // ---------------------------------------------------------------------------
  // Group deletion
  // ---------------------------------------------------------------------------
  //
  // Verifies that removing a group via setGroups([]) or deleteGroups() cleans
  // up correctly — including port undelegation when the group was collapsed.
  // ---------------------------------------------------------------------------

  test.describe("group deletion", () => {
    test.beforeEach(async ({ page }) => {
      graphPO = new GraphPageObject(page);
      await graphPO.initialize({ blocks: BLOCKS, connections: CONNECTIONS });

      await graphPO.page.evaluate(
        ({ groupRect }) => {
          const { CollapsibleGroup, BlockGroups } = (window as any).GraphModule;
          const graph = window.graph;
          graph.addLayer(BlockGroups, { draggable: false });
          graph.rootStore.groupsList.setGroups([
            { id: "group-1", rect: groupRect, component: CollapsibleGroup, collapsed: false },
          ]);
        },
        { groupRect: GROUP_RECT }
      );
      await graphPO.waitForFrames(5);
    });

    test("deleting an expanded group does not hide blocks", async () => {
      await graphPO.page.evaluate(() => {
        window.graph.rootStore.groupsList.setGroups([]);
      });
      await graphPO.waitForFrames(3);

      const { b1Rendered, b2Rendered } = await graphPO.page.evaluate(() => {
        const store = window.graph.rootStore;
        return {
          b1Rendered: store.blocksList.$blocksMap.value.get("block-1")?.getViewComponent()?.isRendered() ?? false,
          b2Rendered: store.blocksList.$blocksMap.value.get("block-2")?.getViewComponent()?.isRendered() ?? false,
        };
      });
      expect(b1Rendered).toBe(true);
      expect(b2Rendered).toBe(true);
    });

    test("deleting a collapsed group restores block visibility", async () => {
      // Collapse first
      await graphPO.page.evaluate(
        ({ groupRect }) => {
          window.graph.rootStore.groupsList.setGroups([
            {
              id: "group-1",
              rect: groupRect,
              component: (window as any).GraphModule.CollapsibleGroup,
              collapsed: true,
            },
          ]);
        },
        { groupRect: GROUP_RECT }
      );
      await graphPO.waitForFrames(5);

      // Delete group
      await graphPO.page.evaluate(() => {
        window.graph.rootStore.groupsList.setGroups([]);
      });
      await graphPO.waitForFrames(5);

      const { b1Rendered, b2Rendered } = await graphPO.page.evaluate(() => {
        const store = window.graph.rootStore;
        return {
          b1Rendered: store.blocksList.$blocksMap.value.get("block-1")?.getViewComponent()?.isRendered() ?? false,
          b2Rendered: store.blocksList.$blocksMap.value.get("block-2")?.getViewComponent()?.isRendered() ?? false,
        };
      });
      expect(b1Rendered).toBe(true);
      expect(b2Rendered).toBe(true);
    });

    test("deleting a collapsed group undelegates ports", async () => {
      // Capture original port position
      const originalPort = await graphPO.page.evaluate(() => {
        const b1 = window.graph.rootStore.blocksList.$blocksMap.value.get("block-1");
        const port = b1?.getViewComponent()?.getOutputPort();
        return { x: port?.$state?.value?.x, y: port?.$state?.value?.y };
      });

      // Collapse
      await graphPO.page.evaluate(
        ({ groupRect }) => {
          window.graph.rootStore.groupsList.setGroups([
            {
              id: "group-1",
              rect: groupRect,
              component: (window as any).GraphModule.CollapsibleGroup,
              collapsed: true,
            },
          ]);
        },
        { groupRect: GROUP_RECT }
      );
      await graphPO.waitForFrames(5);

      // Delete group
      await graphPO.page.evaluate(() => {
        window.graph.rootStore.groupsList.setGroups([]);
      });
      await graphPO.waitForFrames(5);

      const port = await graphPO.page.evaluate(() => {
        const b1 = window.graph.rootStore.blocksList.$blocksMap.value.get("block-1");
        const p = b1?.getViewComponent()?.getOutputPort();
        return {
          isDelegated: p?.isDelegated ?? true,
          x: p?.$state?.value?.x,
          y: p?.$state?.value?.y,
        };
      });

      expect(port.isDelegated).toBe(false);
      expect(port.x).toBe(originalPort.x);
      expect(port.y).toBe(originalPort.y);
    });

    test("re-adding a group after deletion works correctly", async () => {
      // Delete
      await graphPO.page.evaluate(() => {
        window.graph.rootStore.groupsList.setGroups([]);
      });
      await graphPO.waitForFrames(3);

      // Re-add
      await graphPO.page.evaluate(
        ({ groupRect }) => {
          window.graph.rootStore.groupsList.setGroups([
            { id: "group-1", rect: groupRect, component: (window as any).GraphModule.CollapsibleGroup, collapsed: false },
          ]);
        },
        { groupRect: GROUP_RECT }
      );
      await graphPO.waitForFrames(5);

      const exists = await graphPO.page.evaluate(() =>
        !!window.graph.rootStore.groupsList.getGroupState("group-1")
      );
      expect(exists).toBe(true);

      // Click on group should work
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
  // Group selection
  // ---------------------------------------------------------------------------

  test.describe("group selection", () => {
    test.beforeEach(async ({ page }) => {
      graphPO = new GraphPageObject(page);
      await graphPO.initialize({ blocks: BLOCKS, connections: CONNECTIONS });

      await graphPO.page.evaluate(
        ({ groupRect }) => {
          const { CollapsibleGroup, BlockGroups } = (window as any).GraphModule;
          const graph = window.graph;
          graph.addLayer(BlockGroups, { draggable: false });
          graph.rootStore.groupsList.setGroups([
            { id: "group-1", rect: groupRect, component: CollapsibleGroup, collapsed: false },
          ]);
        },
        { groupRect: GROUP_RECT }
      );
      await graphPO.waitForFrames(5);
    });

    test("clicking group selects it — $selected signal becomes true", async () => {
      await graphPO.click(GROUP_CLICK.x, GROUP_CLICK.y);
      await graphPO.waitForFrames(3);

      const selected = await graphPO.page.evaluate(() =>
        window.graph.rootStore.groupsList.getGroupState("group-1")?.$selected.value
      );
      expect(selected).toBe(true);
    });

    test("clicking outside group deselects it", async () => {
      // Select
      await graphPO.click(GROUP_CLICK.x, GROUP_CLICK.y);
      await graphPO.waitForFrames(3);

      // Click outside — far from any group or block
      await graphPO.click(900, 500);
      await graphPO.waitForFrames(3);

      const selected = await graphPO.page.evaluate(() =>
        window.graph.rootStore.groupsList.getGroupState("group-1")?.$selected.value
      );
      expect(selected).toBe(false);
    });

    test("$selected signal is authoritative — $state.value.selected is not used for selection", async () => {
      await graphPO.click(GROUP_CLICK.x, GROUP_CLICK.y);
      await graphPO.waitForFrames(3);

      const { signalSelected, stateSelected } = await graphPO.page.evaluate(() => {
        const gs = window.graph.rootStore.groupsList.getGroupState("group-1");
        return {
          signalSelected: gs?.$selected.value,
          // Selection is managed exclusively via groupSelectionBucket,
          // not persisted into $state — so $state.selected stays undefined.
          stateSelected: gs?.$state.value.selected,
        };
      });

      expect(signalSelected).toBe(true);
      // $state.selected is not the source of truth — groupSelectionBucket is.
      expect(stateSelected).toBeUndefined();
    });

    test("groups-selection-change event fires on click", async () => {
      const getEvents = await graphPO.collectGraphEventDetails("groups-selection-change");

      await graphPO.click(GROUP_CLICK.x, GROUP_CLICK.y);
      await graphPO.waitForFrames(3);

      const details = await getEvents();
      expect(details.length).toBeGreaterThan(0);
    });

    test("collapsed group can be selected by clicking collapsed header", async () => {
      // Collapse
      await graphPO.page.evaluate(
        ({ groupRect }) => {
          window.graph.rootStore.groupsList.setGroups([
            {
              id: "group-1",
              rect: groupRect,
              component: (window as any).GraphModule.CollapsibleGroup,
              collapsed: true,
            },
          ]);
        },
        { groupRect: GROUP_RECT }
      );
      await graphPO.waitForFrames(5);

      // Click collapsed header center
      const collapsedCenter = { x: GROUP_RECT.x + 100, y: GROUP_RECT.y + 24 };
      await graphPO.click(collapsedCenter.x, collapsedCenter.y);
      await graphPO.waitForFrames(3);

      const selected = await graphPO.page.evaluate(() =>
        window.graph.rootStore.groupsList.getGroupState("group-1")?.$selected.value
      );
      expect(selected).toBe(true);
    });
  });
});
