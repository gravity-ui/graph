import { useCallback, useEffect, useMemo, useState } from "react";

import ELK, { ElkLayoutArguments, ElkNode } from "elkjs";

import { elkConverter } from "../converters/eklConverter";
import { ConverterResult } from "../types";

export const useElk = (config: ElkNode, args?: ElkLayoutArguments & { onError?: (e: Error) => void }) => {
  const [result, setResult] = useState<ConverterResult | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const elk = useMemo(() => new ELK(), []);

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

  return { result, isLoading, elk };
};
