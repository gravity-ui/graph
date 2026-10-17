import { ECanDrag, Graph, Layer, type TBlock } from "@gravity-ui/graph";
import { ConnectionEditingLayer } from "@gravity-ui/graph-connection-editing";
import "@gravity-ui/graph/styles.css";

import "../../shared/base.css";

const blocks = [
  {
    id: "source",
    is: "Block",
    x: 80,
    y: 100,
    width: 180,
    height: 100,
    name: "Source",
    anchors: [{ id: "out", blockId: "source", type: "OUT" }],
  },
  {
    id: "target",
    is: "Block",
    x: 1600,
    y: 900,
    width: 180,
    height: 100,
    name: "Target",
    anchors: [{ id: "in", blockId: "target", type: "IN" }],
  },
] satisfies TBlock[];
// The blocks are far apart so that zoomTo("center") stays below the detailed zoom level, where canvas anchors are drawn.

const root = document.querySelector<HTMLDivElement>("#graph");
if (!root) {
  throw new Error("Graph root was not found.");
}

// Graph layers are absolutely positioned: anchor the canvas to the root so GraphPO points match the anchors.
root.style.position = "relative";

const graph = new Graph({ blocks, settings: { canDrag: ECanDrag.ALL, useBlocksAnchors: true } }, root);

graph.start();
graph.zoomTo("center");

const layer = graph.addLayer(ConnectionEditingLayer, { searchRadius: 20 });
if (!(layer instanceof Layer)) throw new Error("ConnectionEditingLayer does not use the consumer's Layer.");
if (layer.context.graph !== graph) throw new Error("ConnectionEditingLayer is connected to a different Graph.");

const created: string[] = [];
graph.on("connection-created", (event) => {
  created.push(`${String(event.detail.sourcePort.id)}->${String(event.detail.targetPort.id)}`);
  root.dataset.created = created.join(",");
});

root.dataset.connectionEditingReady = "true";
