import { useCallback } from "react";

import type { Graph } from "../../graph";
import type { THighlightTargets } from "../../services/highlight";

export interface UseHighlightResult {
  /** Highlight specified entities only, others stay unchanged */
  highlight: (targets: THighlightTargets) => void;
  /** Focus on specified entities and lowlight all others */
  focus: (targets: THighlightTargets) => void;
  /** Clear all highlight/focus states */
  clear: () => void;
}

/**
 * Hook for managing highlight state in graph
 *
 * @example
 * ```tsx
 * const { highlight, focus, clear } = useHighlight(graph);
 *
 * return (
 *   <div>
 *     <button onClick={() => highlight({ block: ["A", "B"] })}>
 *       Highlight A & B
 *     </button>
 *     <button onClick={() => focus({ block: ["A"] })}>
 *       Focus A
 *     </button>
 *     <button onClick={clear}>Clear</button>
 *   </div>
 * );
 * ```
 */
export function useHighlight(graph: Graph): UseHighlightResult {
  const highlight = useCallback(
    (targets: THighlightTargets) => {
      graph.highlight(targets);
    },
    [graph]
  );

  const focus = useCallback(
    (targets: THighlightTargets) => {
      graph.focus(targets);
    },
    [graph]
  );

  const clear = useCallback(() => {
    graph.clearHighlight();
  }, [graph]);

  return {
    highlight,
    focus,
    clear,
  };
}
