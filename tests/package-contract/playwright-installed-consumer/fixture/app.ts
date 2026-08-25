import { ECanDrag, Graph, type TBlock, type TConnection } from "@gravity-ui/graph";

import "./app.css";

const blocks = [
  {
    id: "source",
    is: "Block",
    x: 80,
    y: 100,
    width: 180,
    height: 100,
    name: "Source",
    anchors: [],
  },
  {
    id: "target",
    is: "Block",
    x: 500,
    y: 280,
    width: 180,
    height: 100,
    name: "Target",
    anchors: [],
  },
] satisfies TBlock[];

const connections = [
  {
    id: "source-to-target",
    sourceBlockId: "source",
    targetBlockId: "target",
  },
] satisfies TConnection[];

const root = document.querySelector<HTMLDivElement>("#graph");
if (!root) {
  throw new Error("Graph root was not found.");
}

const graph = new Graph(
  {
    blocks,
    connections,
    settings: {
      canDrag: ECanDrag.ALL,
      useBezierConnections: false,
    },
  },
  root
);

graph.start();
graph.zoomTo("center");
