import { useCallback, useEffect, useState } from "react";

import type { ELK, ElkLayoutArguments, ElkNode } from "elkjs";

import { elkConverter } from "../converters/eklConverter";
import { ConverterResult } from "../types";

export const useElk = (config: ElkNode, elk: ELK, args?: ElkLayoutArguments & { onError?: (e: Error) => void }) => {
  const [result, setResult] = useState<ConverterResult | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const layout = useCallback(() => {
    return elk.layout(config, args);
  }, [elk, config, args]);

  useEffect(() => {
    let isCancelled = false;
    setIsLoading(true);

    layout()
      .then((data) => {
        if (isCancelled) return;
        setResult(elkConverter(data));
        setIsLoading(false);
      })
      .catch((error: unknown) => {
        if (!isCancelled) {
          setResult(null);
          setIsLoading(false);
          args?.onError?.(error instanceof Error ? error : new Error(String(error)));
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [layout]);

  return { result, isLoading };
};
