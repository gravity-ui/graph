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

    layout()
      .then((data) => {
        if (isCancelled) return;
        setResult(elkConverter(data));
        setIsLoading(false);
      })
      .catch((error) => {
        if (!isCancelled) {
          args?.onError(error);
          setIsLoading(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [layout]);

  return { result, isLoading };
};
