import { test, expect } from "@playwright/test";

import { GraphPageObject } from "../../page-objects/GraphPageObject";

const TWO_BLOCKS = [
  {
    id: "block-1",
    is: "Block",
    x: 300,
    y: 200,
    width: 200,
    height: 100,
    name: "Block 1",
    anchors: [],
    selected: false,
  },
  {
    id: "block-2",
    is: "Block",
    x: 600,
    y: 300,
    width: 200,
    height: 100,
    name: "Block 2",
    anchors: [],
    selected: false,
  },
];

const DRAG_SETTINGS = {
  canDrag: "all" as const,
  dragThreshold: 0,
};

test.describe("block-change + coalesced blocks-geometry-change", () => {
  test("single-block drag emits both block-change and fewer blocks-geometry-change events", async ({ page }) => {
    const graphPO = new GraphPageObject(page);
    await graphPO.initialize({
      blocks: TWO_BLOCKS,
      connections: [],
      settings: DRAG_SETTINGS,
    });

    const readBlockChange = await graphPO.collectGraphEventDetails<{ block: { id: string } }>("block-change");
    const readGeom = await graphPO.collectGraphEventDetails<{ blocks: { id: string }[] }>("blocks-geometry-change");

    const nBlock0 = (await readBlockChange()).length;
    const nGeom0 = (await readGeom()).length;

    const block1 = graphPO.getBlockCOM("block-1");
    await block1.click();
    await block1.dragTo({ x: 420, y: 260 });

    const dBlock = (await readBlockChange()).length - nBlock0;
    const dGeom = (await readGeom()).length - nGeom0;

    expect(dBlock).toBeGreaterThan(0);
    expect(dGeom).toBeGreaterThan(0);
    expect(dGeom).toBeLessThanOrEqual(dBlock);
  });

  test("after drag end, blocks-geometry-change follows last block-change (rAF or flush)", async ({ page }) => {
    const graphPO = new GraphPageObject(page);
    await graphPO.initialize({
      blocks: TWO_BLOCKS,
      connections: [],
      settings: DRAG_SETTINGS,
    });

    await page.evaluate(() => {
      const order: string[] = [];
      (window as unknown as { __geometryFlushOrder: string[] }).__geometryFlushOrder = order;
      window.graph.on("block-change", () => {
        order.push("block-change");
      });
      window.graph.on("blocks-geometry-change", () => {
        order.push("blocks-geometry-change");
      });
    });

    const block1 = graphPO.getBlockCOM("block-1");
    await block1.click();
    await block1.dragTo({ x: 420, y: 260 });

    const order = await page.evaluate(() => (window as unknown as { __geometryFlushOrder: string[] }).__geometryFlushOrder);

    const lastBlockIdx = order.lastIndexOf("block-change");
    expect(lastBlockIdx).toBeGreaterThan(-1);
    expect(order.slice(lastBlockIdx + 1).includes("blocks-geometry-change")).toBe(true);
  });

  test("multi-block drag: geometry batches include both ids; geometry fires less often than block-change", async ({
    page,
  }) => {
    const graphPO = new GraphPageObject(page);
    await graphPO.initialize({
      blocks: TWO_BLOCKS,
      connections: [],
      settings: DRAG_SETTINGS,
    });

    const readBlockChange = await graphPO.collectGraphEventDetails("block-change");
    const readGeom = await graphPO.collectGraphEventDetails<{ blocks: { id: string; x: number; y: number; width: number; height: number }[] }>(
      "blocks-geometry-change"
    );

    const nBlock0 = (await readBlockChange()).length;
    const nGeom0 = (await readGeom()).length;

    const block1 = graphPO.getBlockCOM("block-1");
    const block2 = graphPO.getBlockCOM("block-2");
    await block1.click();
    await block2.click({ ctrl: true });
    await block1.dragTo({ x: 500, y: 350 });

    const dBlock = (await readBlockChange()).length - nBlock0;
    const geomEvents = await readGeom();
    const newGeom = geomEvents.slice(nGeom0);

    expect(dBlock).toBeGreaterThan(0);
    expect(newGeom.length).toBeGreaterThan(0);
    expect(newGeom.length).toBeLessThan(dBlock);

    const last = newGeom[newGeom.length - 1];
    expect(last.blocks.map((b) => b.id).sort()).toEqual(["block-1", "block-2"]);

    for (const b of last.blocks) {
      expect(Object.keys(b).sort()).toEqual(["height", "id", "width", "x", "y"]);
    }
  });

  test("group drag moves two blocks: last geometry batch lists both ids", async ({ page }) => {
    const graphPO = new GraphPageObject(page);
    const GROUP_PAD = 20;
    const blocks = [
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
        group: "group-1",
      },
      {
        id: "block-2",
        is: "Block",
        x: 100,
        y: 280,
        width: 200,
        height: 100,
        name: "Block 2",
        anchors: [],
        selected: false,
        group: "group-1",
      },
    ];

    await graphPO.initialize({
      blocks,
      connections: [],
      settings: {
        ...DRAG_SETTINGS,
        canDragCamera: false,
      },
    });

    await graphPO.page.evaluate((pad: number) => {
      const { BlockGroups, Group } = (window as any).GraphModule;
      const graph = window.graph;

      const GroupingLayer = BlockGroups.withBlockGrouping({
        groupingFn: (blockStates: any[]) => {
          const result: Record<string, any[]> = {};
          blockStates.forEach((blockState) => {
            const groupId = blockState.$state.value.group;
            if (groupId) {
              if (!result[groupId]) result[groupId] = [];
              result[groupId].push(blockState);
            }
          });
          return result;
        },
        mapToGroups: (key: string, { rect }: { rect: { x: number; y: number; width: number; height: number } }) => ({
          id: key,
          rect: {
            x: rect.x - pad,
            y: rect.y - pad,
            width: rect.width + pad * 2,
            height: rect.height + pad * 2,
          },
          component: Group,
        }),
      });

      graph.addLayer(GroupingLayer, { draggable: true, updateBlocksOnDrag: true });
    }, GROUP_PAD);

    await graphPO.waitForFrames(5);

    const readGeom = await graphPO.collectGraphEventDetails<{ blocks: { id: string }[] }>("blocks-geometry-change");

    const nGeom0 = (await readGeom()).length;

    const groupRect = await graphPO.page.evaluate(() => {
      return window.graph.rootStore.groupsList.getGroupState("group-1")!.$state.value.rect;
    });

    const cx = groupRect.x + groupRect.width / 2;
    const cy = groupRect.y + 12;

    await graphPO.click(cx, cy);
    await graphPO.dragTo(cx, cy, cx + 80, cy + 50, { waitFrames: 25 });

    const newGeom = (await readGeom()).slice(nGeom0);
    expect(newGeom.length).toBeGreaterThan(0);

    const last = newGeom[newGeom.length - 1];
    expect(last.blocks.map((b) => b.id).sort()).toEqual(["block-1", "block-2"]);
  });

  test("block-change preventDefault skips position update and blocks-geometry-change", async ({ page }) => {
    const graphPO = new GraphPageObject(page);
    await graphPO.initialize({
      blocks: TWO_BLOCKS,
      connections: [],
      settings: DRAG_SETTINGS,
    });

    await page.evaluate(() => {
      window.graph.on("block-change", (event: Event) => {
        event.preventDefault();
      });
    });

    const readGeom = await graphPO.collectGraphEventDetails("blocks-geometry-change");
    const nGeom0 = (await readGeom()).length;

    const block1 = graphPO.getBlockCOM("block-1");
    const initial = await block1.getGeometry();
    await block1.click();
    await block1.dragTo({ x: 500, y: 350 });

    const final = await block1.getGeometry();
    expect(final.x).toBe(initial.x);
    expect(final.y).toBe(initial.y);
    expect((await readGeom()).length - nGeom0).toBe(0);
  });
});
