import { TBlock } from "./components/canvas/blocks/Block";
import { Graph } from "./graph";

describe("Graph export/import and updateBlock integration", () => {
  function createBlock(): TBlock {
    return {
      id: "block1",
      is: "Block",
      x: 10,
      y: 20,
      width: 100,
      height: 50,
      selected: false,
      name: "TestBlock",
      anchors: [],
    };
  }

  it("should allow export, import and updateBlock without errors (no frozen state)", (done) => {
    const graph1Node = document.createElement("div");
    const graph2Node = document.createElement("div");
    const block = createBlock();
    const graph1 = new Graph({ blocks: [block], connections: [] }, graph1Node);
    graph1.start();

    setTimeout(() => {
      const exportedConfig = graph1.rootStore.getAsConfig();
      const graph2 = new Graph(exportedConfig, graph2Node);
      graph2.start();
      const updatedHeight = block.height + 10;
      expect(() => {
        graph2.api.updateBlock({ ...exportedConfig.blocks[0], height: updatedHeight });
      }).not.toThrow();
      const updatedBlock = graph2.rootStore.blocksList.$blocks.value[0];
      expect(updatedBlock.height).toBe(updatedHeight);
      done();
    }, 1000);
  });
});

describe("Graph colors runtime merge behavior", () => {
  it("keeps previously updated colors after unrelated setColors call", () => {
    const graph = new Graph({});

    graph.setColors({
      block: {
        border: "#111111",
      },
    });

    graph.setColors({
      anchor: {
        background: "#222222",
      },
    });

    expect(graph.graphColors.block?.border).toBe("#111111");
    expect(graph.graphColors.anchor?.background).toBe("#222222");
  });
});
