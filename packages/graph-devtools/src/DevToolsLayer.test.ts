import { Component, Graph, Layer, LayerProps, LayerPublicProps } from "@gravity-ui/graph";

import { DevToolsLayer } from "./DevToolsLayer";
import { DEFAULT_DEVTOOLS_LAYER_PROPS } from "./constants";
import { TDevToolsLayerInput } from "./types";

class TestDevToolsLayer extends DevToolsLayer {
  public flush() {
    return this.checkData();
  }
}

// Constructor input and runtime props are different contracts, even for custom layers.
class NormalizedLayer extends Layer<LayerProps & { size: number }> {
  constructor(input: LayerProps & { size?: number }) {
    super({ ...input, size: input.size ?? 10 });
  }
}

describe("DevTools visual props", () => {
  let graph: Graph;
  let layer: TestDevToolsLayer;

  beforeEach(() => {
    graph = new Graph({});
    layer = new TestDevToolsLayer({ graph, camera: graph.cameraService, rulerSize: 32 });
  });

  afterEach(() => {
    layer.detachLayer();
    graph.unmount();
  });

  it("uses constructor input for public Layer options while retaining resolved runtime props", () => {
    const options: LayerPublicProps<typeof NormalizedLayer> = {};
    const normalized = graph.addLayer(NormalizedLayer, options);
    const size: number = normalized.props.size;
    expect(size).toBe(10);
    graph.detachLayer(normalized);
  });

  it.each([{}, { rulerTextFont: undefined, crosshairColor: undefined }])(
    "resolves every empty or undefined visual option: %p",
    (input) => {
      const defaults = new TestDevToolsLayer({ graph, camera: graph.cameraService, ...input });
      expect(defaults.props).toMatchObject(DEFAULT_DEVTOOLS_LAYER_PROPS);
      defaults.detachLayer();
    }
  );

  it("keeps explicit constructor overrides and resource defaults", () => {
    const configured = new TestDevToolsLayer({
      graph,
      camera: graph.cameraService,
      showRuler: false,
      rulerBackdropBlur: 0,
      canvas: { zIndex: 200, respectPixelRatio: undefined, alpha: false },
      html: { zIndex: 199, transformByCameraPosition: undefined, activationScale: 0.5 },
    });
    expect(configured.props).toMatchObject({ showRuler: false, rulerBackdropBlur: 0 });
    expect(configured.props.canvas).toMatchObject({
      zIndex: 200,
      respectPixelRatio: true,
      transformByCameraPosition: false,
      alpha: false,
    });
    expect(configured.props.html).toMatchObject({
      zIndex: 199,
      transformByCameraPosition: false,
      activationScale: 0.5,
    });
    expect(configured.getCanvas()?.classList.contains("devtools-layer-canvas")).toBe(true);
    expect(configured.getHTML()?.classList.contains("devtools-layer-html")).toBe(true);
    configured.detachLayer();
  });

  it("lets base queuing accumulate patches while undefined preserves pending values", () => {
    layer.setProps({ rulerSize: 40, rulerBackgroundColor: "blue", showRuler: false });
    layer.setProps({ rulerSize: undefined, rulerTextFont: "13px Arial", showCrosshair: false });
    layer.setProps();
    expect(layer.props.rulerSize).toBe(32);
    layer.flush();
    expect(layer.props).toMatchObject({
      ...DEFAULT_DEVTOOLS_LAYER_PROPS,
      rulerSize: 40,
      rulerBackgroundColor: "blue",
      rulerTextFont: "13px Arial",
      showRuler: false,
      showCrosshair: false,
    });
  });

  it("selectively restores constructor values while preserving unrelated queued updates", () => {
    layer.setProps({ rulerSize: 50, showRuler: false, rulerBackdropBlur: 2 });
    layer.resetProps(["rulerSize", "showRuler"]);
    layer.setProps({ rulerSize: undefined, crosshairColor: "blue" });
    layer.flush();
    expect(layer.props).toMatchObject({
      rulerSize: 32,
      showRuler: true,
      rulerBackdropBlur: 2,
      crosshairColor: "blue",
    });
  });

  it("restores every visual constructor value without resetting infrastructure", () => {
    const initial = { ...layer.props };
    const canvas = { zIndex: 200, respectPixelRatio: false };
    const html = { zIndex: 199 };
    layer.setProps({ rulerSize: 50, showRuler: false, canvas, html });
    layer.resetProps();
    layer.flush();
    expect(layer.props).toEqual({ ...initial, canvas, html });
    expect(layer.props.graph).toBe(graph);
    expect(layer.props.camera).toBe(graph.cameraService);
  });

  it("leaves an empty reset and undefined patches unchanged", () => {
    layer.setProps({ rulerSize: 40 });
    layer.resetProps([]);
    layer.setProps({ rulerSize: undefined });
    layer.flush();
    expect(layer.props.rulerSize).toBe(40);
    expect(layer.flush()).toBe(false);
  });

  it("keeps constructor-only DOM resource configuration on descriptor reuse", () => {
    class Parent extends Component {
      public input: TDevToolsLayerInput = { graph, camera: graph.cameraService, canvas: { zIndex: 200 } };
      public child: TestDevToolsLayer | undefined;
      protected updateChildren() {
        return [TestDevToolsLayer.create(this.input, { key: "devtools", ref: (child) => (this.child = child) })];
      }
      public syncChildren() {
        this.__updateChildren();
      }
    }
    const parent = new Parent({});
    parent.syncChildren();
    const child = parent.child;
    expect(child).toBeDefined();
    const canvas = child?.getCanvas();
    parent.input = { graph, camera: graph.cameraService, canvas: { zIndex: 201 } };
    parent.syncChildren();
    child?.flush();
    expect(parent.child).toBe(child);
    expect(child?.getCanvas()).toBe(canvas);
    expect(canvas?.style.zIndex).toBe("200");
    expect(canvas?.classList.contains("devtools-layer-canvas")).toBe(true);
    expect(child?.props.canvas).toEqual({ zIndex: 201 });
    child?.detachLayer();
  });

  it("updates ruler DOM from resolved props and resets", () => {
    const root = document.createElement("div");
    layer.attachLayer(root);
    const html = layer.getHTML();
    layer.setProps({ rulerSize: 40, rulerBackdropBlur: 2, rulerBackgroundColor: "blue", showRuler: false });
    layer.flush();
    expect(html?.style.getPropertyValue("--devtools-ruler-size")).toBe("40px");
    expect(html?.style.getPropertyValue("--devtools-ruler-bg-color")).toBe("blue");
    expect(html?.style.getPropertyValue("--devtools-ruler-display")).toBe("none");
    layer.resetProps();
    layer.flush();
    expect(html?.style.getPropertyValue("--devtools-ruler-size")).toBe("32px");
    expect(html?.style.getPropertyValue("--devtools-ruler-blur")).toBe("5px");
    expect(html?.style.getPropertyValue("--devtools-ruler-display")).toBe("block");
  });

  it("isolates instance state", () => {
    const other = new TestDevToolsLayer({ graph, camera: graph.cameraService });
    layer.state.mouseX = 50;
    expect(other.state.mouseX).toBeNull();
    other.detachLayer();
  });
});
