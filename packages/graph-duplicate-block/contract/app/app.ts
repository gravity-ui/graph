import { ECanDrag, Graph, Layer } from "@gravity-ui/graph";
import { DuplicateBlockLayer } from "@gravity-ui/graph-duplicate-block";
import "@gravity-ui/graph/styles.css";

import "../../../../scripts/package-contract/shared/base.css";

const root = document.querySelector<HTMLDivElement>("#graph");
if (!root) throw new Error("Graph root was not found.");

const graph = new Graph({ settings: { canDrag: ECanDrag.ALL } }, root);
graph.setEntities({
  blocks: [
    { id: "source", is: "Block", x: 0, y: 0, width: 200, height: 100, name: "Source", anchors: [] },
    { id: "other", is: "Block", x: 400, y: 0, width: 200, height: 100, name: "Other", anchors: [] },
  ],
});
graph.start();
graph.zoomTo("center");

const layer = graph.addLayer(DuplicateBlockLayer, { ghostBackground: "rgb(255, 0, 0)" });
if (!(layer instanceof Layer)) throw new Error("The duplicate block layer does not use the consumer's Layer.");
if (layer.context.graph !== graph) throw new Error("The duplicate block layer is connected to a different Graph.");

// The package augments the core event map, so the payloads are typed without casts.
graph.on("blocks-duplicate-start", (event) => {
  root.dataset.duplicateStart = event.detail.blocks.map((block) => block.connectedState.id).join(",");
});
graph.on("blocks-duplicate", (event) => {
  root.dataset.duplicateItems = String(event.detail.items.length);
});

root.dataset.duplicateBlockReady = "true";
