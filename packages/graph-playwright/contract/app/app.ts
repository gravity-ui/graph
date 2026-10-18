import { ECanDrag, Graph, type TBlock, type TConnection } from "@gravity-ui/graph";
import "@gravity-ui/graph/styles.css";

import "../../../../scripts/package-contract/shared/base.css";

const blocks = [
  {
    id: "source",
    is: "Block",
    x: 80,
    y: 100,
    width: 200,
    height: 120,
    name: "Source",
    anchors: [{ id: "out", blockId: "source", type: "OUT", index: 0 }],
  },
  {
    id: "target",
    is: "Block",
    x: 520,
    y: 300,
    width: 200,
    height: 120,
    name: "Target",
    anchors: [{ id: "in", blockId: "target", type: "IN", index: 0 }],
  },
] satisfies TBlock[];

// An anchor-to-anchor connection without an id: tests find it by its endpoints.
const connections = [
  { sourceBlockId: "source", sourceAnchorId: "out", targetBlockId: "target", targetAnchorId: "in" },
] satisfies TConnection[];

const root = document.querySelector<HTMLDivElement>("#graph");
if (!root) {
  throw new Error("Graph root was not found.");
}

const graph = new Graph({ blocks, connections, settings: { canDrag: ECanDrag.ALL } }, root);

graph.start();
graph.zoomTo("center");
