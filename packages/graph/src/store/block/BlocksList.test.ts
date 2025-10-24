import { jest } from "@jest/globals";

import { TBlock } from "../../components/canvas/blocks/Block";
import { Graph } from "../../graph";
import { GraphEventsDefinitions } from "../../graphEvents";
import { ESelectionStrategy } from "../../services/selection/types";
import { EAnchorType } from "../anchor/Anchor";

import { BlockListStore } from "./BlocksList";

const generateBlock = (): TBlock => {
  return {
    id: Math.random() * 100,
    is: "FakeBlock",
    x: Math.random() * 100,
    y: Math.random() * 100,
    width: Math.random() * 100,
    height: Math.random() * 100,
    selected: false,
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
    store.updateBlocksSelection([block2.id], true, ESelectionStrategy.APPEND);
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

  it.todo("Should select anchor");
  it.todo("Should unselect anchor");
  it.todo("Should emit event on select anchor");

  it("Should emit blocks-selection-change event with correct params", () => {
    const handler = jest.fn<GraphEventsDefinitions["blocks-selection-change"]>();
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
    anchorId = block.anchors?.[0]?.id ?? "anchor-1";
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
    const handler = jest.fn<GraphEventsDefinitions["block-anchor-selection-change"]>();
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
