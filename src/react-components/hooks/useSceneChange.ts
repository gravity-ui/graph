import { useEffect, useLayoutEffect } from "react";

import { Graph } from "../../graph";
import { ESchedulerPriority } from "../../lib";

import { useSchedulerDebounce } from "./schedulerHooks";
import { useGraphEvent } from "./useGraphEvents";

/**
 * Hook to handle scene updates.
 * Scene is updating when camera changes or component changes yours position.
 *
 *
 * @param graph - Graph instance
 * @param fn - Function to handle scene updates
 */
export function useSceneChange(graph: Graph, fn: () => void) {
  const handleCameraChange = useSchedulerDebounce(fn, {
    priority: ESchedulerPriority.HIGHEST,
    frameInterval: 1,
  });

  /* Subscribe to camera changes */
  useGraphEvent(graph, "camera-change", handleCameraChange);

  // Subscribe to hitTest updates to catch when blocks become available in viewport
  useEffect(() => {
    graph.hitTest.on("update", handleCameraChange);

    return () => {
      graph.hitTest.off("update", handleCameraChange);
    };
  }, [graph, handleCameraChange]);

  // Check initial camera scale on mount to handle cases where zoomTo() is called
  // during initialization before the camera-change event subscription is active
  useLayoutEffect(() => {
    handleCameraChange();
    return () => {
      handleCameraChange.cancel();
    };
  }, [graph, handleCameraChange]);
}
