import { expect, test } from "@playwright/test";
import type { TBlock, TBlockId } from "@gravity-ui/graph";

import { GraphPageObject } from "../../page-objects/GraphPageObject";

import { DuplicateBlockPageObject } from "./DuplicateBlockPageObject";

function block(id: string, x: number, y: number): TBlock {
  return { id, is: "Block", x, y, width: 200, height: 100, name: id, anchors: [], selected: false };
}

const BLOCKS = [block("block-1", 0, 0), block("block-2", 400, 0), block("block-3", 0, 400)];
const CONNECTIONS = [
  { id: "connection-1-2", sourceBlockId: "block-1", targetBlockId: "block-2" },
  { id: "connection-1-3", sourceBlockId: "block-1", targetBlockId: "block-3" },
];
const ORIGINAL_IDS = BLOCKS.map(({ id }) => id);
const SHIFT = { x: 300, y: 200 };

test.describe("DuplicateBlockLayer", () => {
  let graphPO: GraphPageObject;
  let duplicatePO: DuplicateBlockPageObject;

  test.beforeEach(async ({ page }) => {
    graphPO = new GraphPageObject(page);
    duplicatePO = new DuplicateBlockPageObject(page, graphPO);
    // Blocks are draggable: with the default `canDrag: NONE` the camera pans before the layer sees the press
    // (https://github.com/gravity-ui/graph/issues/405, see the fixme at the end of this file).
    await graphPO.initialize({ blocks: BLOCKS, connections: CONNECTIONS, settings: { canDrag: "all" } });
  });

  async function getCopyIds(): Promise<TBlockId[]> {
    return (await duplicatePO.getBlockIds()).filter((id) => !ORIGINAL_IDS.includes(id));
  }

  /** The drag is anchored at the press point, so the copy lands within a screen pixel of the drop offset. */
  async function getTolerance(): Promise<number> {
    const { scale } = await graphPO.camera().getState();
    return 1 / scale;
  }

  async function altDragBlock(blockId: TBlockId): Promise<void> {
    const center = await graphPO.block(blockId).getCenter();
    await duplicatePO.altDrag(center, { x: center.x + SHIFT.x, y: center.y + SHIFT.y });
  }

  test("Alt-drag of a non-selected block adds one selected copy at the drop point", async () => {
    await duplicatePO.addLayer();
    const cameraBefore = await graphPO.camera().getState();

    await altDragBlock("block-1");

    const copyIds = await getCopyIds();
    expect(copyIds).toHaveLength(1);
    const copy = await graphPO.block(copyIds[0]).getState();
    const tolerance = await getTolerance();
    expect(copy).toMatchObject({ is: "Block", name: "block-1", width: 200, height: 100 });
    expect(Math.abs((copy?.x ?? NaN) - SHIFT.x)).toBeLessThanOrEqual(tolerance);
    expect(Math.abs((copy?.y ?? NaN) - SHIFT.y)).toBeLessThanOrEqual(tolerance);

    // The layer takes over the gesture: the source block and the camera stay in place.
    expect(await graphPO.block("block-1").getGeometry()).toMatchObject({ x: 0, y: 0 });
    expect(await graphPO.camera().getState()).toMatchObject({ x: cameraBefore.x, y: cameraBefore.y });
    expect(await graphPO.getSelectedBlockIds()).toEqual(copyIds);
    // A single copied block brings no connections.
    expect(await graphPO.getConnections()).toHaveLength(CONNECTIONS.length);
  });

  test("Alt-drag of a selected block copies the selection with the connections between its blocks", async () => {
    await duplicatePO.addLayer();
    await graphPO.evaluate((graph) => graph.api.selectBlocks(["block-1", "block-2"], true));

    await altDragBlock("block-1");

    const copyIds = await getCopyIds();
    expect(copyIds).toHaveLength(2);
    const copies = await Promise.all(copyIds.map((id) => graphPO.block(id).getState()));
    const tolerance = await getTolerance();
    const copyOf = (name: string): TBlock | null | undefined => copies.find((copy) => copy?.name === name);
    const firstCopy = copyOf("block-1");
    const secondCopy = copyOf("block-2");
    // Relative positions are kept.
    expect(Math.abs((firstCopy?.x ?? NaN) - SHIFT.x)).toBeLessThanOrEqual(tolerance);
    expect((secondCopy?.x ?? NaN) - (firstCopy?.x ?? NaN)).toBeCloseTo(400);
    expect((secondCopy?.y ?? NaN) - (firstCopy?.y ?? NaN)).toBeCloseTo(0);

    expect([...(await graphPO.getSelectedBlockIds())].sort()).toEqual([...copyIds].sort());
    const connections = await graphPO.getConnections();
    expect(connections).toHaveLength(CONNECTIONS.length + 1);
    expect(await graphPO.hasConnectionBetween(firstCopy?.id ?? "", secondCopy?.id ?? "")).toBe(true);
  });

  test("shows the preview while dragging and clears it on release", async () => {
    await duplicatePO.addLayer({ ghostBackground: "rgb(255, 0, 0)" });
    const center = await graphPO.block("block-1").getCenter();
    const target = { x: center.x + SHIFT.x, y: center.y + SHIFT.y };

    await duplicatePO.startAltDrag(center, target);
    expect(await duplicatePO.getPreviewAlphaAt(target)).toBe(255);
    // The preview edge is where the copy will be: block-1 starts at (0, 0), so its copy starts at SHIFT.
    const { scale } = await graphPO.camera().getState();
    const inset = 3 / scale;
    expect(await duplicatePO.getPreviewAlphaAt({ x: SHIFT.x + inset, y: SHIFT.y + inset })).toBe(255);
    expect(await duplicatePO.getPreviewAlphaAt({ x: SHIFT.x - inset, y: SHIFT.y - inset })).toBe(0);
    expect(await getCopyIds()).toHaveLength(0);

    await duplicatePO.finishAltDrag();
    expect(await duplicatePO.getPreviewAlphaAt(target)).toBe(0);
    expect(await getCopyIds()).toHaveLength(1);
  });

  test("emits start and end events with the source blocks and the offset", async () => {
    await duplicatePO.addLayer();
    const start = await graphPO.events.listen("blocks-duplicate-start");
    const end = await graphPO.events.listen("blocks-duplicate");

    await altDragBlock("block-1");

    expect(
      await start.analyze((events) =>
        events
          .map((event) => (event.detail as { blocks: Array<{ connectedState: { id: TBlockId } }> }).blocks)
          .map((blocks) => blocks.map((source) => source.connectedState.id))
      )
    ).toEqual([["block-1"]]);
    const [detail] = await end.analyze((events) =>
      events.map((event) => {
        const { items, delta } = event.detail as {
          items: Array<{ block: { connectedState: { id: TBlockId } }; coord: { x: number; y: number } }>;
          delta: { x: number; y: number };
        };
        return { ids: items.map((item) => item.block.connectedState.id), coord: items[0].coord, delta };
      })
    );
    const tolerance = await getTolerance();
    expect(detail.ids).toEqual(["block-1"]);
    expect(Math.abs(detail.delta.x - SHIFT.x)).toBeLessThanOrEqual(tolerance);
    expect(Math.abs(detail.delta.y - SHIFT.y)).toBeLessThanOrEqual(tolerance);
    expect(detail.coord).toEqual(detail.delta);
  });

  test("preventing the start event hides the preview but still adds the copy", async () => {
    await duplicatePO.addLayer({ ghostBackground: "rgb(255, 0, 0)" });
    await graphPO.evaluate((graph) => {
      graph.on("blocks-duplicate-start", (event) => event.preventDefault());
    });
    const center = await graphPO.block("block-1").getCenter();
    const target = { x: center.x + SHIFT.x, y: center.y + SHIFT.y };

    await duplicatePO.startAltDrag(center, target);
    expect(await duplicatePO.getPreviewAlphaAt(target)).toBe(0);

    await duplicatePO.finishAltDrag();
    expect(await getCopyIds()).toHaveLength(1);
  });

  test("the default action places copies at coordinates changed by a listener", async () => {
    await duplicatePO.addLayer();
    await graphPO.evaluate((graph) => {
      graph.on("blocks-duplicate", (event) => {
        event.detail.items[0].coord = { x: 1000, y: 1000 };
      });
    });

    await altDragBlock("block-1");

    const [copyId] = await getCopyIds();
    expect(await graphPO.block(copyId).getGeometry()).toMatchObject({ x: 1000, y: 1000 });
  });

  test("preventing the end event cancels adding the copies", async () => {
    await duplicatePO.addLayer();
    await graphPO.evaluate((graph) => {
      graph.on("blocks-duplicate", (event) => event.preventDefault());
    });

    await altDragBlock("block-1");

    expect(await getCopyIds()).toHaveLength(0);
    expect(await graphPO.block("block-1").getGeometry()).toMatchObject({ x: 0, y: 0 });
  });

  test("a block rejected by isDuplicateAllowed is dragged as usual", async () => {
    await duplicatePO.addLayer({ notDuplicableIds: ["block-1"] });

    await altDragBlock("block-1");

    expect(await getCopyIds()).toHaveLength(0);
    expect((await graphPO.block("block-1").getGeometry()).x).toBeGreaterThan(0);
  });

  test("isDuplicateAllowed filters the selected blocks", async () => {
    await duplicatePO.addLayer({ notDuplicableIds: ["block-2"] });
    await graphPO.evaluate((graph) => graph.api.selectBlocks(["block-1", "block-2"], true));

    await altDragBlock("block-1");

    const copyIds = await getCopyIds();
    expect(copyIds).toHaveLength(1);
    expect((await graphPO.block(copyIds[0]).getState())?.name).toBe("block-1");
  });

  test("a disabled layer does not duplicate", async () => {
    await duplicatePO.addLayer();
    await duplicatePO.disable();

    await altDragBlock("block-1");

    expect(await getCopyIds()).toHaveLength(0);
  });

  test("without the layer Alt-drag moves the block and does not duplicate", async () => {
    await altDragBlock("block-1");

    expect(await getCopyIds()).toHaveLength(0);
    expect((await graphPO.block("block-1").getGeometry()).x).toBeGreaterThan(0);
  });

  test.describe("connection addressing", () => {
    function anchoredBlock(id: string, x: number): TBlock {
      return {
        ...block(id, x, 0),
        anchors: [
          { id: "out", blockId: id, type: "OUT" },
          { id: "in", blockId: id, type: "IN" },
        ],
      };
    }

    const ANCHORED_IDS = ["anchored-a", "anchored-b"];

    async function duplicateAnchoredPair(): Promise<TBlockId[]> {
      const before = await duplicatePO.getBlockIds();
      await graphPO.evaluate((graph, ids) => graph.api.selectBlocks(ids, true), ANCHORED_IDS);
      await altDragBlock("anchored-a");
      const copies = (await duplicatePO.getBlockIds()).filter((id) => !before.includes(id));
      const names = await Promise.all(copies.map(async (id) => (await graphPO.block(id).getState())?.name));
      // Order the copies as [copy of anchored-a, copy of anchored-b].
      return ANCHORED_IDS.map((name) => copies[names.indexOf(name)]);
    }

    test.beforeEach(async () => {
      await duplicatePO.addLayer();
    });

    test("a block + anchor connection is copied between the duplicates with its anchors", async () => {
      // No explicit ID: core derives "out:in" from the anchors, the same ID an anchor copy without ID would get.
      await graphPO.setEntities({
        blocks: [anchoredBlock("anchored-a", 0), anchoredBlock("anchored-b", 400)],
        connections: [
          { sourceBlockId: "anchored-a", sourceAnchorId: "out", targetBlockId: "anchored-b", targetAnchorId: "in" },
        ],
      });
      const [original] = await duplicatePO.getConnections();

      const [firstA, firstB] = await duplicateAnchoredPair();
      const [secondA, secondB] = await duplicateAnchoredPair();

      const connections = await duplicatePO.getConnections();
      expect(connections).toHaveLength(3);
      expect(new Set(connections.map((connection) => connection.id)).size).toBe(3);
      expect(connections).toContainEqual(original);
      for (const [sourceBlockId, targetBlockId] of [
        [firstA, firstB],
        [secondA, secondB],
      ]) {
        const copy = connections.find((connection) => connection.sourceBlockId === sourceBlockId);
        expect(copy).toEqual({
          id: expect.any(String),
          sourceBlockId,
          sourceAnchorId: "out",
          targetBlockId,
          targetAnchorId: "in",
          selected: false,
        });
      }
    });

    test("a port connection is copied to the same ports of the duplicates", async () => {
      await graphPO.evaluate((graph) => {
        const { createAnchorPortId } = window.GraphModule;
        graph.setEntities({
          blocks: [
            {
              id: "anchored-a",
              is: "Block",
              x: 0,
              y: 0,
              width: 200,
              height: 100,
              name: "anchored-a",
              anchors: [{ id: "out", blockId: "anchored-a", type: "OUT" }],
            },
            {
              id: "anchored-b",
              is: "Block",
              x: 400,
              y: 0,
              width: 200,
              height: 100,
              name: "anchored-b",
              anchors: [{ id: "in", blockId: "anchored-b", type: "IN" }],
            },
          ],
          connections: [
            {
              id: "ported",
              sourcePortId: createAnchorPortId("anchored-a", "out"),
              targetPortId: createAnchorPortId("anchored-b", "in"),
            },
          ],
        });
      });

      const [copyA, copyB] = await duplicateAnchoredPair();

      const expected = await graphPO.evaluate(
        (_graph, ids) => {
          const { createAnchorPortId } = window.GraphModule;
          return { sourcePortId: createAnchorPortId(ids[0], "out"), targetPortId: createAnchorPortId(ids[1], "in") };
        },
        [copyA, copyB]
      );
      const connections = await duplicatePO.getConnections();
      expect(connections).toHaveLength(2);
      const copy = connections.find((connection) => connection.id !== "ported");
      expect(copy).toEqual({ id: expect.any(String), ...expected, selected: false });
    });
  });

  // Known core issue https://github.com/gravity-ui/graph/issues/405: Camera subscribes to the graph "mousedown"
  // before any layer, and Chromium invokes listeners of a plain EventTarget in registration order even with
  // `capture: true`. With non-draggable blocks the camera starts panning before the layer prevents the event.
  test.fixme("duplicates with the default canDrag setting", async () => {
    await graphPO.evaluate((graph) => graph.updateSettings({ canDrag: window.GraphModule.ECanDrag.NONE }));
    await duplicatePO.addLayer();
    const cameraBefore = await graphPO.camera().getState();

    await altDragBlock("block-1");

    expect(await graphPO.camera().getState()).toMatchObject({ x: cameraBefore.x, y: cameraBefore.y });
    const [copyId] = await getCopyIds();
    expect((await graphPO.block(copyId).getState())?.x).toBeGreaterThan(0);
  });
});
