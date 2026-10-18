import type { TConnection, TMultipointConnection } from "@gravity-ui/graph";
import {
  DEFAULT_NODE_HEIGHT,
  DEFAULT_NODE_WIDTH,
  computeLevels,
  layeredConverter,
  type ConverterResult,
  type LayeredLayoutConnection,
  type LayeredLayoutInput,
  type LayeredLayoutOptions,
} from "@gravity-ui/graph-layered";

// Graph connections of either addressing mode are accepted; only block endpoints are laid out.
declare const graphConnections: TConnection[];
const connections: LayeredLayoutConnection[] = graphConnections;
const input: LayeredLayoutInput = {
  blocks: [{ id: 1, width: DEFAULT_NODE_WIDTH, height: DEFAULT_NODE_HEIGHT, level: 0 }],
  connections,
};
const levels: Map<string | number, number> = computeLevels([1], input.connections);
const result: ConverterResult = layeredConverter({
  layoutResult: { nodes: [], edges: [] },
  connections: input.connections,
  blockSizes: new Map(),
});
const merged: TMultipointConnection[] = graphConnections.map((c) =>
  c.id === undefined ? c : { ...c, ...result.edges[c.id] }
);
void [levels, merged];

// @ts-expect-error layout options keep their types
const invalidOptions: LayeredLayoutOptions = { nodeVerticalGap: "120" };
// @ts-expect-error blocks need a size
const invalidInput: LayeredLayoutInput = { blocks: [{ id: "a" }], connections: [] };
// @ts-expect-error the converter maps edges back through connections, not a prebuilt key map
layeredConverter({ layoutResult: { nodes: [], edges: [] }, connectionIdBySourceTarget: new Map(), blockSizes: new Map() });
void [invalidOptions, invalidInput];
