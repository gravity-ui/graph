import { Layer } from "@gravity-ui/graph";
import { batch } from "@preact/signals-core";

import { getUikitGraphStore } from "../store/UikitGraphStore";

import { resolveGraphEntity } from "./entity";
import type { TGraphEntity } from "./types";

/** Layer without rendering: mirrors hover, pointer, camera and context-menu input into the kit store. */
export class UikitInteractionLayer extends Layer {
  protected override afterInit(): void {
    const { graph } = this.props;
    const store = getUikitGraphStore(graph);

    this.onGraphEvent("mouseenter", (event) => {
      const entity = resolveGraphEntity(event.detail.target);
      const source = event.detail.sourceEvent;
      const worldPoint = source instanceof MouseEvent ? graph.getPointInCameraSpace(source).world : null;
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
    (this.root?.ownerDocument ?? document).addEventListener("mouseup", this.handlePointerUp, {
      signal: this.eventAbortController.signal,
    });
    this.onGraphEvent("camera-change", () => {
      store.$cameraVersion.value += 1;
    });
    this.onRootEvent("contextmenu", this.handleContextMenu);

    super.afterInit();
  }

  protected override unmount(): void {
    const store = getUikitGraphStore(this.props.graph);
    batch(() => {
      store.$hovered.value = null;
      store.$contextMenu.value = null;
      store.$pointerPressed.value = false;
    });
    super.unmount();
  }

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
