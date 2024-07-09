import { TBlock } from "../../components/canvas/blocks/Block";
import { Graph } from "../../graph";
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
  it.todo("Should select block");
  it.todo("Should unselect block");
  it.todo("Should selection multiple blocks");
  it.todo("Should unselect multiple blocks");
  it.todo("Should unselect connection and anchor on block select");
  it.todo("Should emit event on selection change");
  it.todo("Should prevent selection on prevent selection event");
  it.todo("Should reset selection");

  it.todo("Should select anchor");
  it.todo("Should unselect anchor");
  it.todo("Should emit event on select anchor");
});
