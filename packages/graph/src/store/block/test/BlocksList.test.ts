import { TBlock } from "../../../components/canvas/blocks/Block";
import { Graph } from "../../../graph";
import { ESelectionStrategy } from "../../../services/selection/types";
import { AnchorState, EAnchorType } from "../../anchor/Anchor";
import { anchorEntityId, parseAnchorEntityId } from "../../anchor/anchorEntityId";
import { BlockListStore } from "../BlocksList";

const generateBlock = (): TBlock => {
  return {
    id: Math.random() * 100,
    is: "FakeBlock",
    x: Math.random() * 100,
    y: Math.random() * 100,
    width: Math.random() * 100,
    height: Math.random() * 100,
    name: "fakeBlock",
    anchors: [],
  };
};

describe("BlocksList", () => {
  let graph: Graph;
  let store: BlockListStore;
  beforeEach(() => {
    graph = new Graph({});
    store = graph.rootStore.blocksList;
  });

  it("should set blocks", () => {
    const blocks = [generateBlock(), generateBlock()];
    store.setBlocks(blocks);
    expect(store.toJSON()).toEqual(blocks);
  });

  it("should append blocks", () => {
    const blocks = [generateBlock(), generateBlock()];
    store.setBlocks(blocks);
    const newBlocks = [generateBlock(), generateBlock()];
    store.updateBlocks(newBlocks);
    expect(store.toJSON()).toEqual([...blocks, ...newBlocks]);
  });

  it("should update blocks", () => {
    const block1 = generateBlock();
    const block2 = generateBlock();
    store.setBlocks([block1, block2]);
    const prevBlockState = store.getBlockState(block1.id);
    const updatedBlock = {
      ...block1,
      x: 100,
    };
    const newBlock = generateBlock();
    store.updateBlocks([updatedBlock, newBlock]);
    const nextBlockState = store.getBlockState(block1.id);
    expect(store.toJSON()).toEqual([updatedBlock, block2, newBlock]);
    expect(prevBlockState).toBe(nextBlockState);
  });

  it("should remove block by id", () => {
    const blocks = [generateBlock(), generateBlock()];
    store.setBlocks(blocks);
    expect(store.toJSON()).toEqual(blocks);
    store.deleteBlocks([blocks[0]]);
    expect(store.toJSON()).toEqual([blocks[1]]);
  });

  it("Should reuse block states on setBlocks", () => {
    const block1 = generateBlock();
    const blocks = [block1, generateBlock()];
    store.setBlocks(blocks);
    const blockState = store.$blocks.value.find((block) => block.id === block1.id);

    const nextBlock = {
      ...block1,
      name: "ChangedName",
    };
    const nextBlocks = [nextBlock, generateBlock()];
    store.setBlocks(nextBlocks);
    expect(store.toJSON()).toEqual(nextBlocks);

    const nextBlockState = store.$blocks.value.find((block) => block.id === block1.id);
    expect(blockState).toBe(nextBlockState);
  });

  it("replaces omitted block data and anchors in a full snapshot, and keeps them across partial updates", () => {
    const block = { id: "b", is: "Block", name: "B", x: 0, y: 0, width: 100, height: 50 };
    const previous = {
      ...block,
      group: "old",
      meta: { status: "failed" },
      settings: { phantom: true },
      customField: "old",
      anchors: [{ id: "out", blockId: block.id, type: EAnchorType.OUT }],
    };
    store.setBlocks([previous]);
    const state = store.getBlockState(block.id);
    const anchor = state?.getAnchorById("out");
    expect(anchor).toBeDefined();
    store.updateBlocksSelection([block.id], true);

    const next = { ...block, x: 75 };
    store.updateBlocks([next]);
    expect(store.toJSON()).toEqual([{ ...previous, ...next }]);
    expect(state?.getAnchorById("out")).toBe(anchor);

    store.setBlocks([next]);
    expect(store.getBlockState(block.id)).toBe(state);
    expect(store.toJSON()).toEqual([next]);
    expect(state?.$anchors.value).toEqual([]);
    expect(anchor?.isAttached()).toBe(false);
    expect(state?.selected).toBe(true);
  });

  it("only emits pending drag geometry that still applies after replacing a snapshot", () => {
    const a = { id: "a", is: "Block", name: "A", x: 0, y: 0, width: 100, height: 50 };
    const b = { ...a, id: "b" };
    store.setBlocks([a, b]);
    const changed = jest.fn();
    graph.on("blocks-geometry-change", changed);
    store.updatePosition(a.id, { x: 10, y: 20 });
    store.updatePosition(b.id, { x: 10, y: 20 });

    store.setBlocks([
      { ...a, x: 100 },
      { ...b, x: 10, y: 20 },
    ]);
    store.flushBatchedBlocksGeometryEmit();
    expect(changed.mock.calls.map(([event]) => event.detail.blocks)).toEqual([
      [{ id: b.id, x: 10, y: 20, width: b.width, height: b.height }],
    ]);
  });

  it.todo("should change block position");
  it.todo("should emit event on block change");
  it.todo("should recompute usableRect on change block");
});

describe("Blocks selection", () => {
  let graph: Graph;
  let store: BlockListStore;
  let block1: TBlock;
  let block2: TBlock;
  let block3: TBlock;

  beforeEach(() => {
    graph = new Graph({});
    store = graph.rootStore.blocksList;
    block1 = generateBlock();
    block2 = generateBlock();
    block3 = generateBlock();
    store.setBlocks([block1, block2, block3]);
  });

  it("Should select block", () => {
    store.updateBlocksSelection([block1.id], true);
    expect(store.$selectedBlocks.value.map((b) => b.id)).toEqual([block1.id]);
    expect(store.getBlockState(block1.id)?.selected).toBe(true);
  });

  it("Should unselect block", () => {
    store.updateBlocksSelection([block1.id], true);
    store.updateBlocksSelection([block1.id], false);
    expect(store.$selectedBlocks.value.length).toBe(0);
    expect(store.getBlockState(block1.id)?.selected).toBe(false);
  });

  it("Should select multiple blocks", () => {
    store.updateBlocksSelection([block1.id], true);
    store.updateBlocksSelection(
      [block2.id],
      true,
      require("../../../services/selection/types").ESelectionStrategy.APPEND
    );
    expect(store.$selectedBlocks.value.map((b) => b.id).sort()).toEqual([block1.id, block2.id].sort());
    expect(store.getBlockState(block1.id)?.selected).toBe(true);
    expect(store.getBlockState(block2.id)?.selected).toBe(true);
  });

  it("Should unselect multiple blocks", () => {
    store.updateBlocksSelection([block1.id, block2.id], true);
    store.updateBlocksSelection([block1.id, block2.id], false);
    expect(store.$selectedBlocks.value.length).toBe(0);
    expect(store.getBlockState(block1.id)?.selected).toBe(false);
    expect(store.getBlockState(block2.id)?.selected).toBe(false);
  });

  it("Should reset selection", () => {
    store.updateBlocksSelection([block1.id, block2.id], true);
    store.resetSelection();
    expect(store.$selectedBlocks.value.length).toBe(0);
    expect(store.getBlockState(block1.id)?.selected).toBe(false);
    expect(store.getBlockState(block2.id)?.selected).toBe(false);
  });

  it("Should emit blocks-selection-change event with correct params", () => {
    const handler = jest.fn();
    graph.on("blocks-selection-change", handler);

    store.updateBlocksSelection([block1.id], true);

    expect(handler).toHaveBeenCalledTimes(1);
    const eventArg = handler.mock.calls[0][0];
    // Проверяем, что в eventArg есть нужные id
    expect(eventArg.detail.changes.add).toEqual([block1.id]);
    expect(eventArg.detail.changes.removed).toEqual([]);
  });

  it("Should prevent selection change if preventDefault called", () => {
    graph.on("blocks-selection-change", (event) => {
      event.preventDefault();
    });

    store.updateBlocksSelection([block1.id], true);

    // Selection не должен измениться
    expect(store.$selectedBlocks.value.length).toBe(0);
    expect(store.getBlockState(block1.id)?.selected).toBe(false);
  });
});

describe("Anchors selection", () => {
  let graph: Graph;
  let store: BlockListStore;
  let block: TBlock;
  let anchorId: string;

  beforeEach(() => {
    graph = new Graph({});
    store = graph.rootStore.blocksList;
    // Создаем блок с одним якорем
    block = {
      ...generateBlock(),
      anchors: [{ id: "anchor-1", blockId: "block-1", type: EAnchorType.IN, index: 0 }],
    };
    // Проставляем blockId в блоке для якоря
    block.id = "block-1";
    store.setBlocks([block]);
    const anchor = block.anchors?.[0];
    if (!anchor) throw new Error("Expected fixture anchor");
    anchorId = anchor.id;
  });

  it("Should select anchor", () => {
    store.setAnchorSelection(block.id, anchorId, true);
    // Проверяем, что выбранный якорь совпадает по id
    expect(store.$selectedAnchor.value?.id).toBe(anchorId);
  });

  it("Should unselect anchor", () => {
    store.setAnchorSelection(block.id, anchorId, true);
    store.setAnchorSelection(block.id, anchorId, false);
    expect(store.$selectedAnchor.value).toBeUndefined();
  });

  it("Should emit block-anchor-selection-change event with correct params", () => {
    const handler = jest.fn();
    graph.on("block-anchor-selection-change", handler);

    store.setAnchorSelection(block.id, anchorId, true);

    expect(handler).toHaveBeenCalledTimes(1);
    const eventArg = handler.mock.calls[0][0];
    expect(eventArg.detail.anchor.id).toBe(anchorId);
    expect(eventArg.detail.selected).toBe(true);
  });

  it("Should prevent anchor selection if preventDefault called", () => {
    graph.on("block-anchor-selection-change", (event) => {
      event.preventDefault();
    });

    store.setAnchorSelection(block.id, anchorId, true);

    // Selection не должен измениться
    expect(store.$selectedAnchor.value).toBeUndefined();
  });

  it("Should allow only one anchor to be selected at a time, even across different blocks", () => {
    // Первый блок с anchor-1
    const blockA: TBlock = {
      ...generateBlock(),
      id: "block-A",
      anchors: [{ id: "anchor-1", blockId: "block-A", type: EAnchorType.IN, index: 0 }],
    };
    // Второй блок с anchor-2
    const blockB: TBlock = {
      ...generateBlock(),
      id: "block-B",
      anchors: [{ id: "anchor-2", blockId: "block-B", type: EAnchorType.IN, index: 0 }],
    };
    store.setBlocks([blockA, blockB]);

    // Выделяем anchor-1
    store.setAnchorSelection(blockA.id, "anchor-1", true);
    expect(store.$selectedAnchor.value?.id).toBe("anchor-1");

    // Теперь выделяем anchor-2 (другой блок)
    store.setAnchorSelection(blockB.id, "anchor-2", true);
    // Должен быть выбран только anchor-2
    expect(store.$selectedAnchor.value?.id).toBe("anchor-2");
    // anchor-1 больше не должен быть выбран
    const blockAState = store.getBlockState(blockA.id);
    const anchor1State = blockAState?.getAnchorState("anchor-1");
    expect(anchor1State?.$selected.value).toBe(false);
    // anchor-2 должен быть выбран
    const blockBState = store.getBlockState(blockB.id);
    const anchor2State = blockBState?.getAnchorState("anchor-2");
    expect(anchor2State?.$selected.value).toBe(true);
  });
});

describe("Block-qualified anchor selection", () => {
  let graph: Graph;
  let store: BlockListStore;

  const blockWithOut = (id: TBlock["id"]): TBlock => ({
    ...generateBlock(),
    id,
    anchors: [{ id: "out", blockId: id, type: EAnchorType.OUT, index: 0 }],
  });
  const outOf = (blockId: TBlock["id"]): AnchorState => {
    const state = store.getBlockState(blockId)?.getAnchorById("out");
    if (!state) throw new Error(`no anchor "out" in ${String(blockId)}`);
    return state;
  };

  beforeEach(() => {
    graph = new Graph({});
    store = graph.rootStore.blocksList;
    store.setBlocks([blockWithOut("A"), blockWithOut("B")]);
  });

  it("selects the anchor of one block only, though both blocks have an anchor 'out'", () => {
    store.setAnchorSelection("A", "out", true);
    expect(store.anchorSelectionBucket.$selected.value).toEqual(new Set([anchorEntityId("A", "out")]));
    expect([outOf("A").$selected.value, outOf("B").$selected.value]).toEqual([true, false]);
    expect(store.$selectedAnchor.value).toBe(outOf("A"));
    expect(store.anchorSelectionBucket.$selectedEntities.value).toEqual([outOf("A")]);
  });

  it("keeps $selectedAnchors per block", () => {
    store.setAnchorSelection("B", "out", true);
    expect(store.getBlockState("A")?.$selectedAnchors.value).toEqual([]);
    expect(store.getBlockState("B")?.$selectedAnchors.value).toEqual([outOf("B")]);
    expect(store.getBlockState("B")?.getSelectedAnchor()).toBe(outOf("B"));
    store.setAnchorSelection("A", "out", true);
    expect(store.getBlockState("A")?.$selectedAnchors.value).toEqual([outOf("A")]);
    expect(store.getBlockState("B")?.$selectedAnchors.value).toEqual([]);
  });

  it("gives each anchor state its block-qualified entity id", () => {
    expect(outOf("A").entityId).toBe(anchorEntityId("A", "out"));
    expect(outOf("B").entityId).toBe(anchorEntityId("B", "out"));
  });

  it("round-trips through the public selection API", () => {
    graph.api.setAnchorSelection("B", "out", true);
    const selected = [...(graph.selectionService.$selection.value.get("anchor") ?? [])];
    expect(selected).toEqual([anchorEntityId("B", "out")]);
    expect(parseAnchorEntityId(selected[0])).toEqual({ blockId: "B", anchorId: "out" });
    // Deselecting the other block's "out" leaves the selection alone.
    graph.api.setAnchorSelection("A", "out", false);
    expect(outOf("B").$selected.value).toBe(true);
    // The selection service takes the same ids.
    graph.selectionService.select("anchor", [anchorEntityId("A", "out")], ESelectionStrategy.REPLACE);
    expect([outOf("A").$selected.value, outOf("B").$selected.value]).toEqual([true, false]);
    graph.api.setAnchorSelection("A", "out", false);
    expect(graph.selectionService.$selection.value.get("anchor")?.size).toBe(0);
    // A bare anchor id names no anchor.
    graph.selectionService.select("anchor", ["out"], ESelectionStrategy.REPLACE);
    expect([outOf("A").$selected.value, outOf("B").$selected.value]).toEqual([false, false]);
    expect(store.$selectedAnchor.value).toBeUndefined();
  });

  it("resolves a number block id", () => {
    store.setBlocks([blockWithOut(1), blockWithOut("1")]);
    graph.api.setAnchorSelection(1, "out", true);
    expect(store.$selectedAnchor.value).toBe(outOf(1));
    expect([outOf(1).$selected.value, outOf("1").$selected.value]).toEqual([true, false]);
  });

  it("selects a number anchor id with its events and entities (TAnchorId is string | number)", () => {
    // Data read from JSON can carry number anchor ids; TAnchor declares a string.
    const id = 7 as unknown as string;
    store.setBlocks([
      { ...generateBlock(), id: "N", anchors: [{ id, blockId: "N", type: EAnchorType.OUT, index: 0 }] },
    ]);
    const state = store.getBlockState("N")?.getAnchorById(7);
    expect(state?.entityId).toBe('["N",7]');
    const handler = jest.fn();
    graph.on("block-anchor-selection-change", handler);
    state?.setSelection(true);
    expect(state?.$selected.value).toBe(true);
    expect(store.$selectedAnchor.value).toBe(state);
    expect(store.anchorSelectionBucket.$selectedEntities.value).toEqual([state]);
    state?.setSelection(false);
    expect(handler.mock.calls.map(([event]) => event.detail)).toEqual([
      { anchor: { id: 7, blockId: "N", type: EAnchorType.OUT, index: 0 }, selected: true },
      { anchor: { id: 7, blockId: "N", type: EAnchorType.OUT, index: 0 }, selected: false },
    ]);
  });

  it("emits block-anchor-selection-change with the anchor of the selected block", () => {
    const handler = jest.fn();
    graph.on("block-anchor-selection-change", handler);
    store.setAnchorSelection("B", "out", true);
    store.setAnchorSelection("B", "out", false);
    expect(handler.mock.calls.map(([event]) => event.detail)).toEqual([
      { anchor: { id: "out", blockId: "B", type: EAnchorType.OUT, index: 0 }, selected: true },
      { anchor: { id: "out", blockId: "B", type: EAnchorType.OUT, index: 0 }, selected: false },
    ]);
  });
});
