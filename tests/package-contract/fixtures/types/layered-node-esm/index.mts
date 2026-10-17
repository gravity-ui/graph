import { Graph, MultipointConnection, type TBlock, type TMultipointConnection } from "@gravity-ui/graph";
import {
  DEFAULT_NODE_HEIGHT,
  DEFAULT_NODE_WIDTH,
  computeLevels,
  layeredConverter,
  layoutGraph,
  type ConverterResult,
  type LayeredLayoutInput,
  type LayeredLayoutOptions,
} from "@gravity-ui/graph-layered";

const input: LayeredLayoutInput = {
  blocks: [
    { id: "a", width: DEFAULT_NODE_WIDTH, height: DEFAULT_NODE_HEIGHT },
    { id: 2, width: 200, height: 100, level: 1 },
  ],
  connections: [{ id: "a/2", sourceBlockId: "a", targetBlockId: 2 }],
};
const options: LayeredLayoutOptions = { nodeHorizontalGap: 80, nodeVerticalGap: 120, layerSpacingFactor: 2 };

const levels: Map<string | number, number> = computeLevels(
  input.blocks.map((block) => block.id),
  input.connections
);
const layout = await layoutGraph({
  nodes: input.blocks.map((block) => ({ ...block, id: String(block.id), level: levels.get(block.id) ?? 0 })),
  edges: input.connections.map((c) => ({ from: String(c.sourceBlockId), to: String(c.targetBlockId) })),
  options,
});
const result: ConverterResult = layeredConverter({
  layoutResult: layout,
  connectionIdBySourceTarget: new Map([["a/2", ["a/2"]]]),
  blockSizes: new Map(input.blocks.map((block) => [String(block.id), block])),
});

// Results merge into core entities without casts.
const blocks: TBlock[] = input.blocks.map((block) => ({
  ...block,
  ...result.blocks[block.id],
  is: "Block",
  name: String(block.id),
  selected: false,
  anchors: [],
}));
const connections: TMultipointConnection[] = input.connections.map((connection) => ({
  ...connection,
  ...result.edges[connection.id ?? ""],
}));
const graph = new Graph({ settings: { connection: MultipointConnection } });
graph.setEntities({ blocks, connections });

// @ts-expect-error layout options keep their types
const invalidOptions: LayeredLayoutOptions = { nodeVerticalGap: "120" };
// @ts-expect-error blocks need a size
const invalidInput: LayeredLayoutInput = { blocks: [{ id: "a" }], connections: [] };
void [invalidOptions, invalidInput];
