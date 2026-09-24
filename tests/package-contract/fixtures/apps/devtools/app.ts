import { Graph, Layer } from "@gravity-ui/graph";
import { DevToolsLayer } from "@gravity-ui/graph-devtools";
import "@gravity-ui/graph/styles.css";
import "@gravity-ui/graph-devtools/styles.css";

import "../../shared/base.css";

const root = document.querySelector<HTMLDivElement>("#graph");
if (!root) throw new Error("Graph root was not found.");

const graph = new Graph({ blocks: [] }, root);
graph.start();

function addDevtools() {
  const layer = graph.addLayer(DevToolsLayer, { rulerSize: 32, crosshairColor: "rgb(255, 0, 0)" });
  if (!(layer instanceof Layer)) throw new Error("DevTools does not use the consumer's Layer.");
  if (layer.context.graph !== graph) throw new Error("DevTools is connected to a different Graph.");
  return layer;
}

let devtools = addDevtools();

function addControl(label: string, action: () => void) {
  const button = document.createElement("button");
  button.textContent = label;
  button.addEventListener("click", action);
  document.body.prepend(button);
}

addControl("Toggle rulers", () => devtools.setProps({ showRuler: !devtools.props.showRuler }));
addControl("Toggle crosshair", () => devtools.setProps({ showCrosshair: !devtools.props.showCrosshair }));
addControl("Change appearance", () =>
  devtools.setProps({ rulerSize: 40, rulerBackgroundColor: "rgb(20, 30, 40)", rulerBackdropBlur: 2 })
);
addControl("Detach DevTools", () => graph.detachLayer(devtools));
addControl("Add DevTools", () => {
  devtools = addDevtools();
});

root.dataset.devtoolsReady = "true";
