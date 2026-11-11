import { useEffect, useLayoutEffect } from "react";

import { ESchedulerPriority, Graph } from "@gravity-ui/graph";

import { useSchedulerDebounce } from "./schedulerHooks";

/**
 * Hook to handle scene updates.
 * Scene is updating when camera changes or component changes yours position.
 *
 *
 * @param graph - Graph instance
 * @param fn - Function to handle scene updates
 */
export function useSceneChange(graph: Graph, fn: () => void) {
  const handleSceneChange = useSchedulerDebounce(fn, {
    priority: ESchedulerPriority.HIGHEST,
    frameInterval: 1,
  });

  useLayoutEffect(() => {
    handleSceneChange();

    const unsubscribeCamera = graph.$camera.subscribe(() => {
      handleSceneChange();
    });
    // A level change without a camera change (strategy or constants) also changes the scene.
    const unsubscribeLevel = graph.scene.$level.subscribe(() => {
      handleSceneChange();
    });

    return () => {
      unsubscribeCamera();
      unsubscribeLevel();
    };
  }, [graph, handleSceneChange]);

  useEffect(() => {
    graph.hitTest.on("update", handleSceneChange);

    return () => {
      graph.hitTest.off("update", handleSceneChange);
    };
  }, [graph, handleSceneChange]);

  useLayoutEffect(() => {
    return () => {
      handleSceneChange.cancel();
    };
  }, [handleSceneChange]);
}
