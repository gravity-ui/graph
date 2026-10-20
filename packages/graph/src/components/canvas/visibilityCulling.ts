import type { Graph } from "../../graph";
import type { TTileRect } from "../../lib/TileIndex";
import type { TTreeCullingOptions } from "../../lib/TreeCulling";
import type { ICamera } from "../../services/camera/CameraService";

/**
 * Culling options for a container of graph components (blocks, connections, groups): each frame
 * walks the children near the camera viewport. Disabled by the `EXP_VISIBILITY_CULLING` setting.
 */
export function createViewportCulling(
  graph: Graph,
  getCamera: () => ICamera
): Omit<TTreeCullingOptions, "getWalkToken"> {
  const viewport: TTileRect = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  return {
    tileSize: graph.graphConstants.system.VISIBILITY_TILE_SIZE,
    getViewport: () => {
      if (!graph.rootStore.settings.getConfigFlag("EXP_VISIBILITY_CULLING")) return undefined;
      // Same rect as CameraService.isRectVisible: the full viewport, insets ignored.
      const { relativeX, relativeY, relativeWidth, relativeHeight } = getCamera().getCameraState();
      const margin = graph.graphConstants.system.VISIBILITY_CULLING_MARGIN;
      const marginX = relativeWidth * margin;
      const marginY = relativeHeight * margin;
      viewport.minX = -relativeX - marginX;
      viewport.minY = -relativeY - marginY;
      viewport.maxX = -relativeX + relativeWidth + marginX;
      viewport.maxY = -relativeY + relativeHeight + marginY;
      return viewport;
    },
  };
}
