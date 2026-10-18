import { useEffect, useMemo, useRef, useState } from "react";

import { computeLevels, layeredConverter, layoutGraph } from "..";
import type { ConverterResult, Edge, LayeredLayoutInput, LayeredLayoutOptions, Node } from "..";
import { hasBlockEndpoints } from "../utils/blockConnections";

export type UseLayeredLayoutParams = LayeredLayoutInput & {
  /** Layout algorithm options (gaps, default sizes, spacing factor, etc.) */
  layoutOptions?: LayeredLayoutOptions;
  onError?: (e: Error) => void;
};

/**
 * Keeps the previous value while `key` is unchanged, so inputs that are recreated on every render
 * but describe the same layout (inline arrays and option objects) do not restart the layout.
 * The ref is read and written during render on purpose: the kept value always matches the current key,
 * so a discarded or repeated (StrictMode) render cannot produce a wrong value.
 */
function useStructuralValue<T>(value: T, key: string): T {
  const ref = useRef<{ key: string; value: T } | null>(null);
  if (ref.current === null || ref.current.key !== key) {
    ref.current = { key, value };
  }
  return ref.current.value;
}

export function useLayeredLayout(params: UseLayeredLayoutParams): {
  result: ConverterResult | null;
  isLoading: boolean;
} {
  const [result, setResult] = useState<ConverterResult | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Only the fields the layout reads take part in the keys.
  const blocks = useStructuralValue(
    params.blocks,
    JSON.stringify(params.blocks.map((b) => [b.id, b.width, b.height, b.level ?? null]))
  );
  const connections = useStructuralValue(
    params.connections,
    JSON.stringify(params.connections.map((c) => [c.id ?? null, c.sourceBlockId ?? null, c.targetBlockId ?? null]))
  );
  const layoutOptions = useStructuralValue(params.layoutOptions, JSON.stringify(params.layoutOptions ?? null));

  const onErrorRef = useRef(params.onError);
  useEffect(() => {
    onErrorRef.current = params.onError;
  });

  const layoutNodes = useMemo((): Node<string>[] => {
    const levels = computeLevels(
      blocks.map((b) => b.id),
      connections
    );
    return blocks.map((b) => ({
      id: String(b.id),
      level: b.level ?? levels.get(b.id) ?? 0,
      width: b.width,
      height: b.height,
    }));
  }, [blocks, connections]);

  const layoutEdges = useMemo(
    (): Edge<string>[] =>
      connections.filter(hasBlockEndpoints).map((c) => ({
        from: String(c.sourceBlockId),
        to: String(c.targetBlockId),
      })),
    [connections]
  );

  const blockSizes = useMemo(() => {
    const map = new Map<string, { width: number; height: number }>();
    for (const b of blocks) {
      map.set(String(b.id), { width: b.width, height: b.height });
    }
    return map;
  }, [blocks]);

  useEffect(() => {
    let isCancelled = false;
    setIsLoading(true);

    layoutGraph({
      nodes: layoutNodes,
      edges: layoutEdges,
      options: layoutOptions,
    })
      .then((layoutResult) => {
        if (isCancelled) return;
        const converted = layeredConverter({
          layoutResult: {
            nodes: layoutResult.nodes.map((n) => ({
              id: String(n.id),
              x: n.x,
              y: n.y,
              shape: n.shape,
            })),
            edges: layoutResult.edges.map((e) => ({ from: String(e.from), to: String(e.to), arrows: e.arrows })),
          },
          connections,
          blockSizes,
        });
        setResult(converted);
        setIsLoading(false);
      })
      .catch((error) => {
        if (!isCancelled) {
          onErrorRef.current?.(error);
          setIsLoading(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [layoutNodes, layoutEdges, layoutOptions, connections, blockSizes]);

  return { result, isLoading };
}
