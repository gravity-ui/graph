import { Graph, Layer } from "@gravity-ui/graph";
import { CSSVariablesLayer } from "@gravity-ui/graph-css-variables";
import "@gravity-ui/graph/styles.css";

import "../../../../scripts/package-contract/shared/base.css";
import "./theme.css";

const root = document.querySelector<HTMLDivElement>("#graph");
if (!root) throw new Error("Graph root was not found.");

const graph = new Graph({ blocks: [] }, root);
graph.start();

const publishGraphState = () => {
  root.dataset.blockBackground = graph.graphColors.block.background;
  root.dataset.gridSize = String(graph.graphConstants.system.GRID_SIZE);
};
graph.on("colors-changed", publishGraphState);
graph.on("constants-changed", publishGraphState);

const layer = graph.addLayer(CSSVariablesLayer, { containerClass: "graph-theme" });
if (!(layer instanceof Layer)) throw new Error("CSSVariablesLayer does not use the consumer's Layer.");
if (layer.context.graph !== graph) throw new Error("CSSVariablesLayer is connected to a different Graph.");
publishGraphState();

const button = document.createElement("button");
button.textContent = "Switch theme";
button.addEventListener("click", () => root.classList.replace("theme-light", "theme-dark"));
document.body.prepend(button);

root.dataset.cssVariablesReady = "true";
