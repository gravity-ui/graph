import type { Graph } from "../graph";
import type { TTileRect } from "../lib/TileIndex";
import type { TTreeCullingOptions } from "../lib/TreeCulling";

import type { ICamera } from "./camera/CameraService";

/**
 * One viewport source for a layer tree: the camera viewport in world coordinates, or the layer's rectangle in
 * screen pixels. Disabling the index preserves the exact paint gate.
 */
export function createViewportCulling(
  graph: Graph,
  getCamera: () => ICamera,
  space: "world" | "screen" = "world"
): TTreeCullingOptions {
  const viewport: TTileRect = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  return {
    tileSize: graph.graphConstants.system.VISIBILITY_TILE_SIZE,
    isEnabled: () => graph.rootStore.settings.getConfigFlag("EXP_VISIBILITY_CULLING"),
    getViewport: () => {
      if (space === "screen") {
        const { width, height } = getCamera().getCameraState();
        viewport.minX = 0;
        viewport.minY = 0;
        viewport.maxX = width;
        viewport.maxY = height;
        return viewport;
      }
      // Same rect as CameraService.isRectVisible: the full viewport, insets ignored.
      const { relativeX, relativeY, relativeWidth, relativeHeight } = getCamera().getCameraState();
      viewport.minX = -relativeX;
      viewport.minY = -relativeY;
      viewport.maxX = -relativeX + relativeWidth;
      viewport.maxY = -relativeY + relativeHeight;
      return viewport;
    },
  };
}
