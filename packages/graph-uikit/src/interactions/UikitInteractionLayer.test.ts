import { getUikitGraphStore } from "../store/UikitGraphStore";
import { createUikitGraph, disposeUikitGraph, getBlockView } from "../test-utils/graphFixture";

import { UikitInteractionLayer } from "./UikitInteractionLayer";

function setup(): ReturnType<typeof createUikitGraph> {
  const fixture = createUikitGraph();
  fixture.graph.addLayer(UikitInteractionLayer, {});
  return fixture;
}

/** The element layers listen on (`onRootEvent`). */
function layersRoot(fixture: ReturnType<typeof createUikitGraph>): HTMLElement {
  const root = fixture.graph.layers.$root;
  if (!root) throw new Error("Expected an attached graph");
  return root;
}

describe("UikitInteractionLayer", () => {
  it("mirrors graph hover into the kit store", () => {
    const fixture = setup();
    const { graph } = fixture;
    const view = getBlockView(graph, "a");
    const store = getUikitGraphStore(graph);

    graph.emit("mouseenter", { target: view, sourceEvent: new MouseEvent("mousemove") });
    expect(store.$hovered.value?.entity).toEqual({ kind: "block", id: "a", component: view });

    graph.emit("mouseleave", { target: view, sourceEvent: new MouseEvent("mousemove") });
    expect(store.$hovered.value).toBeNull();

    disposeUikitGraph(fixture);
  });

  it("anchors the hover point to the current pointer move that core handles in the same dispatch", () => {
    const fixture = createUikitGraph();
    const { graph } = fixture;
    const view = getBlockView(graph, "a");
    const store = getUikitGraphStore(graph);
    const root = layersRoot(fixture);
    // Real pointer events bubble from a child of the root.
    const child = root.appendChild(document.createElement("div"));
    // Mirrors GraphLayer: its bubbling root `mousemove` handler emits `mouseenter` synchronously with
    // a sourceEvent whose own coordinates are not the pointer position. GraphLayer is created in the
    // Graph constructor, so its listener is registered before any layer added later — do the same here.
    const synthetic = new MouseEvent("mousemove", { clientX: 1, clientY: 1 });
    root.addEventListener("mousemove", () => graph.emit("mouseenter", { target: view, sourceEvent: synthetic }));
    graph.addLayer(UikitInteractionLayer, {});

    const firstMove = new MouseEvent("mousemove", { bubbles: true, clientX: 120, clientY: 80 });
    child.dispatchEvent(firstMove);
    expect(store.$hovered.value?.worldPoint).toEqual(graph.getPointInCameraSpace(firstMove).world);

    const secondMove = new MouseEvent("mousemove", { bubbles: true, clientX: 200, clientY: 150 });
    child.dispatchEvent(secondMove);
    expect(store.$hovered.value?.worldPoint).toEqual(graph.getPointInCameraSpace(secondMove).world);
    expect(store.$hovered.value?.worldPoint).not.toEqual(graph.getPointInCameraSpace(synthetic).world);

    disposeUikitGraph(fixture);
  });

  it("forgets the pointer when it leaves the root", () => {
    const fixture = setup();
    const { graph } = fixture;
    const view = getBlockView(graph, "a");
    const store = getUikitGraphStore(graph);
    const root = layersRoot(fixture);

    root.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: 120, clientY: 80 }));
    root.dispatchEvent(new MouseEvent("mouseleave"));
    graph.emit("mouseenter", { target: view, sourceEvent: new MouseEvent("mousemove", { clientX: 5, clientY: 5 }) });

    expect(store.$hovered.value).toMatchObject({ entity: { kind: "block", id: "a" }, worldPoint: null });

    disposeUikitGraph(fixture);
  });

  it("has no hover point until a real pointer move was seen", () => {
    const fixture = setup();
    const { graph } = fixture;
    const view = getBlockView(graph, "a");
    const store = getUikitGraphStore(graph);

    graph.emit("mouseenter", { target: view, sourceEvent: new MouseEvent("mousemove", { clientX: 50, clientY: 50 }) });

    expect(store.$hovered.value).toMatchObject({ entity: { kind: "block", id: "a" }, worldPoint: null });

    disposeUikitGraph(fixture);
  });

  it("tracks the pressed pointer and camera changes", () => {
    const fixture = setup();
    const { graph, root } = fixture;
    const store = getUikitGraphStore(graph);

    graph.emit("mousedown", { target: undefined, sourceEvent: new MouseEvent("mousedown") });
    expect(store.$pointerPressed.value).toBe(true);
    root.ownerDocument.dispatchEvent(new MouseEvent("mouseup"));
    expect(store.$pointerPressed.value).toBe(false);

    const version = store.$cameraVersion.value;
    graph.emit("camera-change", graph.cameraService.getCameraState());
    expect(store.$cameraVersion.value).toBe(version + 1);

    disposeUikitGraph(fixture);
  });

  it("leaves the native context menu alone without a GraphContextMenu", () => {
    const fixture = setup();
    const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });

    layersRoot(fixture).dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(getUikitGraphStore(fixture.graph).$contextMenu.value).toBeNull();
    disposeUikitGraph(fixture);
  });

  it("opens the kit context menu on empty canvas when a consumer is mounted", () => {
    const fixture = setup();
    const store = getUikitGraphStore(fixture.graph);
    store.$contextMenuConsumers.value = 1;
    // The fixture camera scale is 0.5, so client (300, 300) is world (600, 600): outside every block.
    const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 300, clientY: 300 });

    layersRoot(fixture).dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(store.$contextMenu.value).toMatchObject({ entity: { kind: "canvas" }, clientPoint: { x: 300, y: 300 } });
    store.$contextMenuConsumers.value = 0;
    disposeUikitGraph(fixture);
  });

  it("opens the kit context menu on the block under the pointer", () => {
    const fixture = setup();
    const store = getUikitGraphStore(fixture.graph);
    store.$contextMenuConsumers.value = 1;
    // Client (30, 40) is world (60, 80): inside block "a".
    const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 30, clientY: 40 });

    layersRoot(fixture).dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(store.$contextMenu.value).toMatchObject({
      entity: { kind: "block", id: "a" },
      clientPoint: { x: 30, y: 40 },
    });
    store.$contextMenuConsumers.value = 0;
    disposeUikitGraph(fixture);
  });
});
