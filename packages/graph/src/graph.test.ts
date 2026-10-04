import { TBlock } from "./components/canvas/blocks/Block";
import { Graph } from "./graph";
import { GRAPH_INSTANCE_SYMBOL_KEY, LEGACY_GRAPH_INSTANCE_SYMBOL_KEY } from "./utils/graphInstance";

describe("Graph DOM instance bridge", () => {
  it("registers the graph on attach and clears it on detach", () => {
    const root = document.createElement("div");
    const graph = new Graph({}, root);
    const record = root as unknown as Record<symbol, Graph | undefined>;

    expect(record[Symbol.for(GRAPH_INSTANCE_SYMBOL_KEY)]).toBe(graph);
    expect(record[Symbol.for(LEGACY_GRAPH_INSTANCE_SYMBOL_KEY)]).toBe(graph);

    graph.detach();

    expect(record[Symbol.for(GRAPH_INSTANCE_SYMBOL_KEY)]).toBeUndefined();
    expect(record[Symbol.for(LEGACY_GRAPH_INSTANCE_SYMBOL_KEY)]).toBeUndefined();
  });

  it("moves the bridge when an attached graph receives a new root", () => {
    const firstRoot = document.createElement("div");
    const secondRoot = document.createElement("div");
    const graph = new Graph({}, firstRoot);
    const symbol = Symbol.for(GRAPH_INSTANCE_SYMBOL_KEY);

    graph.attach(secondRoot);

    expect((firstRoot as unknown as Record<symbol, Graph | undefined>)[symbol]).toBeUndefined();
    expect((secondRoot as unknown as Record<symbol, Graph | undefined>)[symbol]).toBe(graph);
    graph.detach();
  });
});

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

describe("setEntities + waitUsableRectUpdate (pendingEntitiesUpdate fix)", () => {
  function makeBlock(id: string, x = 0, y = 0): TBlock {
    return { id, is: "Block", x, y, width: 100, height: 50, selected: false, name: id, anchors: [] };
  }

  it("resolves waitUsableRectUpdate after setEntities with same block positions", (done) => {
    const node = document.createElement("div");
    const block = makeBlock("b1", 10, 20);
    const graph = new Graph({ blocks: [block], connections: [] }, node);
    graph.start();

    // Wait for initial hitboxes to settle
    graph.hitTest.waitUsableRectUpdate(() => {
      // Call setEntities with the exact same block (same position)
      graph.setEntities({ blocks: [block], connections: [] });

      // Must resolve after setEntities even though usableRect doesn't change
      graph.hitTest.waitUsableRectUpdate((rect) => {
        expect(rect.width).toBeGreaterThan(0);
        done();
      });
    });
  }, 5000);

  it("resolves waitUsableRectUpdate after setEntities with new blocks", (done) => {
    const node = document.createElement("div");
    const graph = new Graph({ blocks: [makeBlock("b1")], connections: [] }, node);
    graph.start();

    graph.hitTest.waitUsableRectUpdate(() => {
      graph.setEntities({ blocks: [makeBlock("b2", 200, 200)], connections: [] });

      graph.hitTest.waitUsableRectUpdate((rect) => {
        expect(rect.x).toBeGreaterThanOrEqual(200);
        done();
      });
    });
  }, 5000);
});

describe("Resolved graph configuration", () => {
  it("preserves nested neighbors and ignores undefined without mutating the input", () => {
    const graph = new Graph({});
    const colors = { block: { border: "#123456" } };
    graph.setColors(colors);
    graph.setColors({ block: { border: undefined, text: "" }, canvas: undefined });
    expect(graph.graphColors.block.border).toBe("#123456");
    expect(graph.graphColors.block.text).toBe("");
    expect(graph.graphColors.block.background).toBeDefined();
    expect(graph.graphColors.canvas.dots).toBeDefined();
    expect(colors).toEqual({ block: { border: "#123456" } });
    expect(new Graph({}).graphColors.block.border).not.toBe("#123456");
  });

  it("replaces arrays atomically and keeps nested constant defaults", () => {
    const graph = new Graph({});
    graph.setConstants({
      selectionLayer: { SELECTABLE_ENTITY_TYPES: [] },
      connection: { LABEL: { INNER_PADDINGS: [1, 2, 3, 4] } },
      camera: { SPEED: 0 },
    });
    graph.setConstants({ camera: { SPEED: undefined, PAN_SPEED: 2 } });
    expect(graph.graphConstants.selectionLayer.SELECTABLE_ENTITY_TYPES).toEqual([]);
    expect(graph.graphConstants.connection.LABEL.INNER_PADDINGS).toEqual([1, 2, 3, 4]);
    expect(graph.graphConstants.connection.DEFAULT_Z_INDEX).toBe(0);
    expect(graph.graphConstants.camera.SPEED).toBe(0);
    expect(graph.graphConstants.camera.PAN_SPEED).toBe(2);
  });

  it("copies constructor input, arrays and default objects between graph instances", () => {
    const scales: [number, number, number] = [0.1, 0.2, 0.3];
    const graph = new Graph({}, undefined, { block: { border: "#abcdef" } }, { block: { SCALES: scales } });
    scales[0] = 9;
    expect(graph.graphConstants.block.SCALES).toEqual([0.1, 0.2, 0.3]);
    expect(graph.graphConstants.block.WIDTH).toBe(200);
    const other = new Graph({});
    graph.graphColors.canvas.dots = "#010101";
    expect(other.graphColors.canvas.dots).not.toBe("#010101");
  });

  it("emits complete snapshots matching signals and getters", () => {
    const graph = new Graph({});
    const colorsChanged = jest.fn();
    const constantsChanged = jest.fn();
    graph.on("colors-changed", colorsChanged);
    graph.on("constants-changed", constantsChanged);
    graph.setColors({ block: { border: "#abcdef" } });
    graph.setConstants({ camera: { SPEED: 2 } });
    expect(colorsChanged.mock.calls[0][0].detail.colors).toBe(graph.$graphColors.value);
    expect(constantsChanged.mock.calls[0][0].detail.constants).toBe(graph.graphConstants);
    expect(colorsChanged.mock.calls[0][0].detail.colors.anchor.background).toBeDefined();
  });
});
