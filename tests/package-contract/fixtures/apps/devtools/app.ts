import { Graph, Layer } from "@gravity-ui/graph";
import { DEFAULT_DEVTOOLS_LAYER_PROPS, DevToolsLayer } from "@gravity-ui/graph-devtools";
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

addControl("Verify defaults", () => {
  for (const options of [{}, { rulerTextFont: undefined, crosshairColor: undefined }]) {
    const layer = graph.addLayer(DevToolsLayer, options);
    for (const [key, value] of Object.entries(DEFAULT_DEVTOOLS_LAYER_PROPS)) {
      if (Reflect.get(layer.props, key) !== value) throw new Error(`Unresolved devtools prop: ${key}`);
    }
    graph.detachLayer(layer);
  }
  const resources = graph.addLayer(DevToolsLayer, { canvas: { zIndex: 200 }, html: { zIndex: 199 } });
  if (!resources.getCanvas()?.classList.contains("devtools-layer-canvas")) {
    throw new Error("Partial canvas input lost devtools classes");
  }
  if (!resources.getHTML()?.classList.contains("devtools-layer-html")) {
    throw new Error("Partial HTML input lost devtools classes");
  }
  if (resources.props.canvas?.transformByCameraPosition !== false) {
    throw new Error("Partial canvas input lost devtools transform defaults");
  }
  graph.detachLayer(resources);
  root.dataset.defaultsVerified = "true";
});
addControl("Queue patches", () => {
  devtools.setProps({ rulerSize: 40, rulerBackgroundColor: "rgb(20, 30, 40)", showRuler: false });
  devtools.setProps({ rulerSize: undefined, rulerTextFont: "13px Arial", showCrosshair: false });
});
addControl("Queue selective reset", () => {
  devtools.setProps({ rulerSize: 50, rulerBackdropBlur: 2 });
  devtools.resetProps(["rulerSize", "showRuler"]);
  devtools.setProps({ rulerSize: undefined, showRuler: undefined });
});
addControl("Queue full reset", () => {
  devtools.setProps({ rulerSize: 60, crosshairColor: "blue" });
  devtools.resetProps();
});
addControl("Ignore undefined and empty reset", () => {
  devtools.setProps();
  devtools.setProps({ rulerSize: undefined, crosshairColor: undefined });
  devtools.resetProps([]);
});
addControl("Snapshot props", () => {
  root.dataset.props = JSON.stringify(devtools.props, (key, value) =>
    ["graph", "camera", "root"].includes(key) ? undefined : value
  );
});

root.dataset.devtoolsReady = "true";
