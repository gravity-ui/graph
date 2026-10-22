import { Layer } from "@gravity-ui/graph";
import { batch } from "@preact/signals-core";

import { getUikitGraphStore } from "../store/UikitGraphStore";

import { resolveGraphEntity } from "./entity";
import type { TGraphEntity } from "./types";

/** Layer without rendering: mirrors hover, pointer, camera and context-menu input into the kit store. */
export class UikitInteractionLayer extends Layer {
  /**
   * Last real pointer move seen on the root. Core also emits `mouseenter` with a synthetic
   * `sourceEvent` when the camera moves under a stationary pointer, so the hover point is taken from here.
   */
  private lastPointerEvent: MouseEvent | null = null;

  /** Set when the pointer leaves the root: core emits no `mouseenter` when it comes back over the same target. */
  private pointerLeftRoot = false;

  protected override afterInit(): void {
    const { graph } = this.props;
    const store = getUikitGraphStore(graph);

    // The layer can be detached and attached again without `unmount()`, so start from a clean pointer.
    this.lastPointerEvent = null;
    this.pointerLeftRoot = false;
    // Capture: core's bubbling root `mousemove` handler emits `mouseenter` synchronously, so the current
    // event has to be stored before it runs.
    this.onRootEvent("mousemove", this.handlePointerMove, { capture: true });
    this.onRootEvent("mouseleave", this.handlePointerLeave);
    this.onGraphEvent("mouseenter", (event) => {
      const entity = resolveGraphEntity(event.detail.target);
      const worldPoint = this.lastPointerEvent ? graph.getPointInCameraSpace(this.lastPointerEvent).world : null;
      store.$hovered.value = entity ? { entity, worldPoint } : null;
    });
    this.onGraphEvent("mouseleave", (event) => {
      if (store.$hovered.value?.entity.component === event.detail.target) {
        store.$hovered.value = null;
      }
    });
    this.onGraphEvent("mousedown", () => {
      store.$pointerPressed.value = true;
    });
    const ownerDocument = this.root?.ownerDocument ?? document;
    ownerDocument.addEventListener("mouseup", this.handlePointerUp, {
      signal: this.eventAbortController.signal,
    });
    // No `mouseup` arrives when the window loses focus or the browser cancels the pointer mid-press.
    (ownerDocument.defaultView ?? window).addEventListener("blur", this.handlePointerUp, {
      signal: this.eventAbortController.signal,
    });
    this.onRootEvent("pointercancel", this.handlePointerUp);
    this.onGraphEvent("camera-change", () => {
      store.$cameraVersion.value += 1;
    });
    this.onRootEvent("contextmenu", this.handleContextMenu);

    super.afterInit();
  }

  protected override unmount(): void {
    const store = getUikitGraphStore(this.props.graph);
    this.lastPointerEvent = null;
    batch(() => {
      store.$hovered.value = null;
      store.$contextMenu.value = null;
      store.$pointerPressed.value = false;
    });
    super.unmount();
  }

  private handlePointerMove = (event: MouseEvent): void => {
    this.lastPointerEvent = event;
    if (this.pointerLeftRoot) {
      this.pointerLeftRoot = false;
      // Hit-test like core does; when core's target changes, its `mouseenter` replaces this right after.
      const { graph } = this.props;
      const point = graph.getPointInCameraSpace(event);
      const entity = resolveGraphEntity(graph.getElementOverPoint(point));
      getUikitGraphStore(graph).$hovered.value = entity ? { entity, worldPoint: point.world } : null;
    }
  };

  private handlePointerLeave = (): void => {
    this.lastPointerEvent = null;
    this.pointerLeftRoot = true;
    // TODO(graph-core): graph "mouseleave" when the pointer leaves the root — core keeps the last target hovered.
    getUikitGraphStore(this.props.graph).$hovered.value = null;
  };

  private handlePointerUp = (): void => {
    getUikitGraphStore(this.props.graph).$pointerPressed.value = false;
  };

  // TODO(graph-core): graph-level "contextmenu" event — the kit listens on the root and hit-tests itself.
  private handleContextMenu = (event: MouseEvent): void => {
    const { graph } = this.props;
    const store = getUikitGraphStore(graph);
    if (store.$contextMenuConsumers.value === 0) {
      return;
    }
    event.preventDefault();
    const point = graph.getPointInCameraSpace(event);
    const entity: TGraphEntity = resolveGraphEntity(graph.getElementOverPoint(point)) ?? {
      kind: "canvas",
      worldPoint: point.world,
    };
    store.$contextMenu.value = {
      entity,
      clientPoint: { x: event.clientX, y: event.clientY },
      cameraVersion: store.$cameraVersion.value,
    };
  };
}
