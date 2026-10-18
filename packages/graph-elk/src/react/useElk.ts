import { useEffect, useRef, useState } from "react";

import type { ELK, ElkLayoutArguments, ElkNode } from "elkjs";

import { elkConverter } from "../elkConverter";
import type { ConverterResult } from "../types";

export type UseElkArgs = ElkLayoutArguments & { onError?: (e: Error) => void };

export const useElk = (
  config: ElkNode,
  elk: ELK,
  args?: UseElkArgs
): { result: ConverterResult | null; isLoading: boolean } => {
  const [result, setResult] = useState<ConverterResult | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // The latest callback is read when a layout fails; changing it does not start a new layout.
  const onErrorRef = useRef(args?.onError);
  onErrorRef.current = args?.onError;

  const layoutOptions = args?.layoutOptions;
  const logging = args?.logging;
  const measureExecutionTime = args?.measureExecutionTime;

  useEffect(() => {
    let isCancelled = false;
    setIsLoading(true);

    elk
      .layout(config, { layoutOptions, logging, measureExecutionTime })
      .then((data) => {
        if (isCancelled) return;
        setResult(elkConverter(data));
        setIsLoading(false);
      })
      .catch((error: unknown) => {
        if (!isCancelled) {
          setResult(null);
          setIsLoading(false);
          onErrorRef.current?.(error instanceof Error ? error : new Error(String(error)));
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [elk, config, layoutOptions, logging, measureExecutionTime]);

  return { result, isLoading };
};
