import { signal } from "@preact/signals-core";

import { Block } from "../components/canvas/blocks/Block";
import { GraphLayer } from "../components/canvas/layers/graphLayer/GraphLayer";
import { Graph } from "../graph";
import { Component } from "../lib/Component";
import type { ChildDescriptor } from "../lib/CoreComponent";
import { globalScheduler } from "../lib/Scheduler";

import { Layer } from "./Layer";
import { Layers } from "./LayersService";

class SubscribedLayer extends Layer {
  public readonly value = signal(0);
  public readonly changed = jest.fn();
  public readonly clicked = jest.fn();

  protected afterInit() {
    this.onSignal(this.value, this.changed);
    this.onRootEvent("click", this.clicked);
    super.afterInit();
  }
}

describe("Layer resources and lifecycle", () => {
  let graph: Graph;
  const root = document.createElement("div");

  beforeEach(() => {
    graph = new Graph({});
  });

  afterEach(() => graph.unmount());

  it("exposes only configured resources before attach and after detach", () => {
    const html = new Layer({ graph, camera: graph.cameraService, html: { zIndex: 1 } });
    const canvas = new Layer({ graph, camera: graph.cameraService, canvas: { zIndex: 1 } });
    expect(html.getCanvas()).toBeUndefined();
    expect(html.context.ctx).toBeUndefined();
    expect(html.context.graphCanvas).toBeUndefined();
    expect(html.getHTML()).toBeInstanceOf(HTMLElement);
    expect(canvas.getHTML()).toBeUndefined();
    expect(canvas.context.canvas).toBe(canvas.getCanvas());
    expect(canvas.context.ownerDocument).toBe(canvas.getCanvas()?.ownerDocument);
    expect(html.context.ownerDocument).toBe(html.getHTML()?.ownerDocument);
    expect(canvas.context.ctx).toBeInstanceOf(CanvasRenderingContext2D);
    expect(new Layer({ graph, camera: graph.cameraService }).isHidden()).toBe(false);
    expect(() => html.resetTransform()).not.toThrow();
    const element = html.getHTML();
    html.attachLayer(root);
    expect(html.context.root).toBe(root);
    html.detachLayer();
    expect(html.context.root).toBeUndefined();
    html.detachLayer();
    expect(html.getHTML()).toBe(element);
    expect(element?.parentElement).toBeNull();
    html.attachLayer(root);
    expect(element?.parentElement).toBe(root);
    html.detachLayer();
  });

  it("publishes attachment changes through repeated detach, reattach and unmount", () => {
    const layer = new Layer({ graph, camera: graph.cameraService });
    const changes: boolean[] = [];
    const unsubscribe = layer.$attached.subscribe((attached) => {
      expect(Boolean(layer.context.root)).toBe(attached);
      changes.push(attached);
    });
    layer.attachLayer(root);
    layer.detachLayer();
    layer.detachLayer();
    layer.attachLayer(root);
    Component.unmount(layer);
    expect(changes).toEqual([false, true, false, true, false]);
    expect(layer.$attached.value).toBe(false);
    unsubscribe();
  });

  it("allows an attachment subscriber to detach without leaving active subscriptions", () => {
    const layer = new SubscribedLayer({ graph, camera: graph.cameraService });
    const unsubscribe = layer.$attached.subscribe((attached) => {
      if (attached) layer.detachLayer();
    });
    expect(() => layer.attachLayer(root)).not.toThrow();
    layer.changed.mockClear();
    layer.value.value = 1;
    expect(layer.changed).not.toHaveBeenCalled();
    expect(layer.context.root).toBeUndefined();
    expect(layer.$attached.value).toBe(false);
    unsubscribe();
    Component.unmount(layer);
  });

  it("does not publish attachment when afterInit detaches the layer", () => {
    class SelfDetachingLayer extends Layer {
      protected afterInit(): void {
        super.afterInit();
        this.detachLayer();
      }
    }
    const layer = new SelfDetachingLayer({ graph, camera: graph.cameraService });
    const changes: boolean[] = [];
    const unsubscribe = layer.$attached.subscribe((attached) => changes.push(attached));
    layer.attachLayer(root);
    expect(changes).toEqual([false]);
    expect(layer.context.root).toBeUndefined();
    unsubscribe();
    Component.unmount(layer);
  });

  it("fails explicitly when a configured canvas has no 2D context", () => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = () => null;
    try {
      expect(() => new Layer({ graph, camera: graph.cameraService, canvas: { zIndex: 1 } })).toThrow(
        "2D canvas context is unavailable"
      );
    } finally {
      HTMLCanvasElement.prototype.getContext = getContext;
    }
  });

  it("cleans subscriptions and DOM listeners on detach and installs them once on reattach", () => {
    const layer = new SubscribedLayer({ graph, camera: graph.cameraService, html: { zIndex: 1 } });
    layer.attachLayer(root);
    layer.attachLayer(root);
    layer.changed.mockClear();
    layer.value.value = 1;
    expect(layer.changed).toHaveBeenCalledTimes(1);
    layer.detachLayer();
    layer.detachLayer();
    layer.changed.mockClear();
    layer.value.value = 2;
    root.click();
    expect(layer.changed).not.toHaveBeenCalled();
    expect(layer.clicked).not.toHaveBeenCalled();
    layer.attachLayer(root);
    layer.changed.mockClear();
    layer.value.value = 3;
    root.click();
    expect(layer.changed).toHaveBeenCalledTimes(1);
    expect(layer.clicked).toHaveBeenCalledTimes(1);
    layer.detachLayer();
  });

  it("cleans GraphLayer store subscriptions before reattachment", () => {
    const blocksCleanup = jest.fn();
    const connectionsCleanup = jest.fn();
    const blocks = jest.spyOn(graph.rootStore.blocksList.$blocks, "subscribe").mockReturnValue(blocksCleanup);
    const connections = jest
      .spyOn(graph.rootStore.connectionsList.$connections, "subscribe")
      .mockReturnValue(connectionsCleanup);
    const layer = new GraphLayer({ graph, camera: graph.cameraService });
    layer.attachLayer(root);
    layer.detachLayer();
    expect(blocksCleanup).toHaveBeenCalledTimes(1);
    expect(connectionsCleanup).toHaveBeenCalledTimes(1);
    layer.attachLayer(root);
    expect(blocks).toHaveBeenCalledTimes(2);
    expect(connections).toHaveBeenCalledTimes(2);
    layer.detachLayer();
    expect(blocksCleanup).toHaveBeenCalledTimes(2);
    expect(connectionsCleanup).toHaveBeenCalledTimes(2);
    blocks.mockRestore();
    connections.mockRestore();
  });

  it("preserves explicit hide across attach and reattach while restoring scale activation", () => {
    const layer = new Layer({ graph, camera: graph.cameraService, html: { zIndex: 1, activationScale: 0.5 } });
    layer.hide();
    layer.attachLayer(root);
    expect(layer.isHidden()).toBe(true);
    layer.detachLayer();
    layer.attachLayer(root);
    expect(layer.isHidden()).toBe(true);
    layer.show();
    expect(layer.isHidden()).toBe(false);
    graph.cameraService.set({ scale: 0.25 });
    layer.show();
    expect(layer.isHidden()).toBe(true);
    graph.cameraService.set({ scale: 1 });
    expect(layer.isHidden()).toBe(false);
    layer.detachLayer();
  });

  it("clears pending movement and restores activation after camera changes while detached", () => {
    const layer = new Layer({
      graph,
      camera: graph.cameraService,
      html: { zIndex: 1, activationScale: 2, transformByCameraPosition: true },
    });
    layer.attachLayer(root);
    expect(layer.getHTML()?.classList.contains("layer-hidden")).toBe(true);
    layer.detachLayer();
    graph.cameraService.set({ scale: 3 });
    layer.attachLayer(root);
    expect(layer.getHTML()?.classList.contains("layer-hidden")).toBe(false);
    expect(layer.getHTML()?.classList.contains("layer-with-camera-moving")).toBe(true);
    layer.detachLayer();
    expect(layer.getHTML()?.classList.contains("layer-with-camera-moving")).toBe(false);
  });

  it("can unmount a block without anchors before its first iteration", () => {
    graph.setEntities({ blocks: [{ id: "block", is: "Block", name: "Block", x: 0, y: 0, width: 100, height: 100 }] });
    const parent = new GraphLayer({ graph, camera: graph.cameraService });
    const block = new Block({ id: "block" }, parent);
    expect(block.connectedState.id).toBe("block");
    expect(() => Component.unmount(block)).not.toThrow();
    parent.detachLayer();
  });

  it("validates the service root before attaching and forgets destroyed layers", () => {
    const layers = new Layers();
    const layer = layers.createLayer(Layer, { graph, camera: graph.cameraService, html: { zIndex: 1 } });
    const attach = jest.spyOn(layer, "attachLayer");
    expect(() => layers.start()).toThrow("Root not specified");
    expect(attach).not.toHaveBeenCalled();
    layers.start(root);
    layers.detach();
    layers.start(root);
    expect(layer.getHTML()?.parentElement).toBe(root);
    layers.destroy();
    expect(layers.getLayers()).toEqual([]);
    layers.destroy();
  });
});

describe("Graph.removeLayer", () => {
  class LifecycleChild extends Component {
    public static readonly unmounted = jest.fn();
    protected unmount(): void {
      LifecycleChild.unmounted();
      super.unmount();
    }
  }

  class LifecycleLayer extends Layer {
    public readonly unmounted = jest.fn();
    protected updateChildren(): ChildDescriptor[] {
      return [LifecycleChild.create({}, { key: "child" })];
    }
    protected unmount(): void {
      this.unmounted();
      super.unmount();
    }
  }

  let graph: Graph;
  let root: HTMLDivElement;

  beforeEach(() => {
    LifecycleChild.unmounted.mockClear();
    root = document.createElement("div");
    graph = new Graph({}, root);
    graph.start();
  });

  afterEach(() => graph.unmount());

  function addMountedLayer(): LifecycleLayer {
    const layer = graph.addLayer(LifecycleLayer, { html: { zIndex: 1 } });
    globalScheduler.performUpdate();
    return layer;
  }

  it("unmounts the layer and its children and forgets it", () => {
    const layer = addMountedLayer();
    expect(layer.$attached.value).toBe(true);

    graph.removeLayer(layer);

    expect(layer.unmounted).toHaveBeenCalledTimes(1);
    expect(LifecycleChild.unmounted).toHaveBeenCalledTimes(1);
    expect(layer.$attached.value).toBe(false);
    expect(layer.getHTML()?.parentElement).toBeNull();
    expect(graph.layers.getLayers()).not.toContain(layer);

    const iterate = jest.spyOn(layer, "iterate");
    layer.performRender();
    globalScheduler.performUpdate();
    expect(iterate).not.toHaveBeenCalled();
  });

  it("destroys a previously detached layer exactly once", () => {
    const layer = addMountedLayer();
    graph.detachLayer(layer);
    expect(layer.unmounted).not.toHaveBeenCalled();

    graph.removeLayer(layer);
    graph.removeLayer(layer);
    graph.unmount();

    expect(layer.unmounted).toHaveBeenCalledTimes(1);
    expect(LifecycleChild.unmounted).toHaveBeenCalledTimes(1);
  });

  it("ignores layers created by another graph", () => {
    const other = new Graph({}, document.createElement("div"));
    const foreign = other.addLayer(LifecycleLayer, { html: { zIndex: 1 } });

    graph.removeLayer(foreign);

    expect(foreign.unmounted).not.toHaveBeenCalled();
    expect(other.layers.getLayers()).toContain(foreign);
    other.unmount();
    expect(foreign.unmounted).toHaveBeenCalledTimes(1);
  });

  it("ignores layers already destroyed by graph.unmount", () => {
    const layer = addMountedLayer();
    graph.unmount();
    graph.removeLayer(layer);

    expect(layer.unmounted).toHaveBeenCalledTimes(1);
    expect(LifecycleChild.unmounted).toHaveBeenCalledTimes(1);
  });
});

describe("root layer scheduling", () => {
  // Layers that forward events to the camera override getParent(), like BlockGroups.
  class CameraForwardingLayer extends Layer {
    public readonly iterated = jest.fn();

    public getParent(): Component | undefined {
      return this.props.graph.getGraphLayer().$.camera;
    }

    public iterate(): boolean {
      this.iterated();
      return super.iterate();
    }
  }

  it("renders a layer that overrides getParent when it is added after the first frame", () => {
    const graph = new Graph({}, document.createElement("div"));
    graph.start();
    globalScheduler.performUpdate();
    expect(graph.getGraphLayer().$.camera).toBeDefined();

    const layer = graph.addLayer(CameraForwardingLayer, {});
    layer.performRender();
    globalScheduler.performUpdate();
    expect(layer.iterated).toHaveBeenCalled();

    graph.stop();
    layer.iterated.mockClear();
    layer.performRender();
    globalScheduler.performUpdate();
    globalScheduler.performUpdate();
    expect(layer.iterated).not.toHaveBeenCalled();
    graph.unmount();
  });
});

describe("Graph.attachLayer", () => {
  class TrackedLayer extends Layer {
    public readonly iterated = jest.fn();

    public iterate(): boolean {
      this.iterated();
      return super.iterate();
    }
  }

  let graph: Graph;
  let root: HTMLDivElement;

  beforeEach(() => {
    root = document.createElement("div");
    graph = new Graph({}, root);
    graph.start();
    globalScheduler.performUpdate();
  });

  afterEach(() => graph.unmount());

  function rendersOnNextFrame(layer: TrackedLayer): boolean {
    layer.iterated.mockClear();
    layer.performRender();
    globalScheduler.performUpdate();
    return layer.iterated.mock.calls.length > 0;
  }

  it("returns a detached layer to the graph, which updates it again", () => {
    const layer = graph.addLayer(TrackedLayer, { html: { zIndex: 1 } });
    graph.detachLayer(layer);
    expect(rendersOnNextFrame(layer)).toBe(false);

    graph.attachLayer(layer);

    expect(graph.layers.getLayers()).toContain(layer);
    expect(layer.$attached.value).toBe(true);
    expect(layer.context.root).toBe(root);
    expect(rendersOnNextFrame(layer)).toBe(true);
  });

  it("moves a layer the caller attached elsewhere back to the graph root", () => {
    const layer = graph.addLayer(TrackedLayer, { html: { zIndex: 1 } });
    graph.detachLayer(layer);
    const elsewhere = document.createElement("div");
    layer.attachLayer(elsewhere);

    graph.attachLayer(layer);

    expect(layer.context.root).toBe(root);
    expect(elsewhere.childElementCount).toBe(0);
  });

  it("moves a hand-attached layer to the graph root when the graph starts later", () => {
    const layer = graph.addLayer(TrackedLayer, { html: { zIndex: 1 } });
    graph.detachLayer(layer);
    graph.stop();
    const elsewhere = document.createElement("div");
    layer.attachLayer(elsewhere);

    graph.attachLayer(layer);
    expect(elsewhere.childElementCount).toBe(0);
    graph.start();

    expect(layer.context.root).toBe(root);
    expect(rendersOnNextFrame(layer)).toBe(true);
  });

  it("does not detach a layer of another graph", () => {
    const other = new Graph({}, document.createElement("div"));
    other.start();
    const foreign = other.addLayer(TrackedLayer, { html: { zIndex: 1 } });

    graph.detachLayer(foreign);

    expect(foreign.$attached.value).toBe(true);
    expect(other.layers.getLayers()).toContain(foreign);
    other.unmount();
  });

  it("does not add a layer twice", () => {
    const layer = graph.addLayer(TrackedLayer, { html: { zIndex: 1 } });
    const count = graph.layers.getLayers().length;

    graph.attachLayer(layer);

    expect(graph.layers.getLayers()).toHaveLength(count);
  });

  it("attaches a returned layer when a stopped graph starts again", () => {
    const layer = graph.addLayer(TrackedLayer, { html: { zIndex: 1 } });
    graph.detachLayer(layer);
    graph.stop();

    graph.attachLayer(layer);
    expect(layer.$attached.value).toBe(false);
    graph.start();

    expect(layer.$attached.value).toBe(true);
    expect(rendersOnNextFrame(layer)).toBe(true);
  });

  it("ignores removed layers and layers of another graph", () => {
    const removed = graph.addLayer(TrackedLayer, { html: { zIndex: 1 } });
    graph.removeLayer(removed);
    const other = new Graph({}, document.createElement("div"));
    const foreign = other.addLayer(TrackedLayer, { html: { zIndex: 1 } });

    graph.attachLayer(removed);
    graph.attachLayer(foreign);

    expect(graph.layers.getLayers()).not.toContain(removed);
    expect(graph.layers.getLayers()).not.toContain(foreign);
    other.unmount();
  });
});
