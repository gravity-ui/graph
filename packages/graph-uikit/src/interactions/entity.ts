import { Anchor, BaseConnection, CanvasBlock } from "@gravity-ui/graph";
import type { Graph, TRect } from "@gravity-ui/graph";

import type { TClientRect, TGraphComponentEntity, TGraphEntity, TGraphHoverState } from "./types";

// TODO(graph-core): public "component → entity kind/id" API — the kit has to use instanceof checks.
export function resolveGraphEntity(component: unknown): TGraphComponentEntity | null {
  if (component instanceof CanvasBlock) {
    return { kind: "block", id: component.getEntityId(), component };
  }
  if (component instanceof Anchor) {
    return { kind: "anchor", id: component.props.id, blockId: component.props.blockId, component };
  }
  if (component instanceof BaseConnection) {
    return { kind: "connection", id: component.getEntityId(), component };
  }
  return null;
}

export function createClientRect(x: number, y: number, width: number, height: number): TClientRect {
  return { x, y, width, height, left: x, top: y, right: x + width, bottom: y + height };
}

// TODO(graph-core): world rect → viewport rect helper — the kit converts camera space by hand.
export function toClientRect(graph: Graph, world: TRect): TClientRect {
  const [left, top] = graph.cameraService.getAbsoluteXY(world.x, world.y);
  const [right, bottom] = graph.cameraService.getAbsoluteXY(world.x + world.width, world.y + world.height);
  const origin = graph.getGraphCanvas()?.getBoundingClientRect();
  return createClientRect((origin?.left ?? 0) + left, (origin?.top ?? 0) + top, right - left, bottom - top);
}

export function getEntityViewportRect(graph: Graph, entity: TGraphEntity): TClientRect {
  switch (entity.kind) {
    case "block":
      return toClientRect(graph, entity.component.getGeometry());
    case "anchor": {
      const { x, y } = entity.component.getPosition();
      const size = entity.component.state.size;
      return toClientRect(graph, { x: x - size / 2, y: y - size / 2, width: size, height: size });
    }
    case "connection": {
      const [minX, minY, maxX, maxY] = entity.component.getHitBox();
      return toClientRect(graph, { x: minX, y: minY, width: maxX - minX, height: maxY - minY });
    }
    default:
      return toClientRect(graph, { x: entity.worldPoint.x, y: entity.worldPoint.y, width: 0, height: 0 });
  }
}

/** Structural floating-ui `VirtualElement`. */
export type TVirtualElement = {
  getBoundingClientRect: () => TClientRect;
  contextElement?: Element;
};

export function createVirtualElement(rect: TClientRect, contextElement?: Element): TVirtualElement {
  return { getBoundingClientRect: () => rect, contextElement };
}

/**
 * Virtual anchor for a hovered entity. Create a new one on every rect change: uikit Popup re-reads
 * the anchor only when its identity changes.
 */
export function createHoverAnchor(graph: Graph, state: TGraphHoverState): TVirtualElement {
  const rect =
    state.entity.kind === "connection" && state.worldPoint
      ? toClientRect(graph, { x: state.worldPoint.x, y: state.worldPoint.y, width: 0, height: 0 })
      : getEntityViewportRect(graph, state.entity);
  return createVirtualElement(rect, graph.getGraphCanvas());
}
