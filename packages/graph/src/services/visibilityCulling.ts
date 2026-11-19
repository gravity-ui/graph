import type { Graph } from "../graph";
import type { TTileRect } from "../lib/culling/TileIndex";
import type { TTreeCullingOptions } from "../lib/culling/TreeCulling";
import { alignToPixelGrid } from "../utils/functions";

import type { ICamera, TCameraState } from "./camera/CameraService";

/** World bounds of the rendered scene. Canvas2D snaps the translation to its backing pixels. */
export function cameraWorldViewport(camera: TCameraState, canvasDpr?: number): TTileRect {
  const { width, height, scale } = camera;
  const x = canvasDpr === undefined ? camera.x : alignToPixelGrid(camera.x, canvasDpr);
  const y = canvasDpr === undefined ? camera.y : alignToPixelGrid(camera.y, canvasDpr);
  return { minX: -x / scale, minY: -y / scale, maxX: (width - x) / scale, maxY: (height - y) / scale };
}

/**
 * One viewport source for a layer tree: the camera viewport in world coordinates, or the layer's rectangle in
 * screen pixels.
 */
export function createViewportCulling(
  graph: Graph,
  getCamera: () => ICamera,
  space: "world" | "screen" = "world"
): TTreeCullingOptions {
  const viewport: TTileRect = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  return {
    tileSize: graph.graphConstants.system.VISIBILITY_TILE_SIZE,
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
