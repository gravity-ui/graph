import { useCallback, useEffect, useMemo, useState } from "react";

import { layeredConverter } from "../converters/layeredConverter";
import { Node, layoutGraph } from "../layout";
import type { ConverterResult, LayeredLayoutInput, LayeredLayoutOptions } from "../types";
import { computeLevels } from "../utils/computeLevels";

export type UseLayeredLayoutParams = LayeredLayoutInput & {
  /** Layout algorithm options (gaps, default sizes, spacing factor, etc.) */
  layoutOptions?: LayeredLayoutOptions;
  onError?: (e: Error) => void;
};

export function useLayeredLayout(params: UseLayeredLayoutParams) {
  const { blocks, connections, layoutOptions, onError } = params;
  const [result, setResult] = useState<ConverterResult | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const layoutNodes = useMemo(() => {
    const levels = computeLevels(
      blocks.map((b) => b.id),
      connections.map((c) => ({ sourceBlockId: c.sourceBlockId, targetBlockId: c.targetBlockId }))
    );
    return blocks.map((b) => ({
      id: String(b.id),
      level: b.level ?? levels.get(b.id) ?? 0,
      width: b.width,
      height: b.height,
    })) as Node<string>[];
  }, [blocks, connections]);

  const layoutEdges = useMemo(
    () =>
      connections.map((c) => ({
        from: String(c.sourceBlockId),
        to: String(c.targetBlockId),
      })),
    [connections]
  );

  const connectionIdBySourceTarget = useMemo(() => {
    const map = new Map<string, (string | number | symbol)[]>();
    for (const c of connections) {
      const key = `${String(c.sourceBlockId)}/${String(c.targetBlockId)}`;
      const list = map.get(key) ?? [];
      list.push(c.id ?? key);
      map.set(key, list);
    }
    return map;
  }, [connections]);

  const blockSizes = useMemo(() => {
    const map = new Map<string, { width: number; height: number }>();
    for (const b of blocks) {
      map.set(String(b.id), { width: b.width, height: b.height });
    }
    return map;
  }, [blocks]);

  const runLayout = useCallback(() => {
    return layoutGraph({
      nodes: layoutNodes,
      edges: layoutEdges,
      options: layoutOptions,
    });
  }, [layoutNodes, layoutEdges, layoutOptions]);

  useEffect(() => {
    let isCancelled = false;

    runLayout()
      .then((layoutResult) => {
        if (isCancelled) return;
        const converted = layeredConverter({
          layoutResult: {
            nodes: layoutResult.nodes.map((n) => ({
              id: String(n.id),
              x: n.x,
              y: n.y,
              shape: (n as Node<string> & { shape?: string }).shape,
            })),
            edges: layoutResult.edges.map((e) => ({ from: String(e.from), to: String(e.to), arrows: e.arrows })),
          },
          connectionIdBySourceTarget: new Map(
            Array.from(connectionIdBySourceTarget.entries()).map(([k, v]) => [k, [...v]])
          ),
          blockSizes,
        });
        setResult(converted);
        setIsLoading(false);
      })
      .catch((error) => {
        if (!isCancelled) {
          onError?.(error);
          setIsLoading(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [runLayout, connectionIdBySourceTarget, blockSizes, onError]);

  return { result, isLoading };
}
