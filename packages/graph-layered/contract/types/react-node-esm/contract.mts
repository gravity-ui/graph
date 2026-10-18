import type { ConverterResult } from "@gravity-ui/graph-layered";
import { useLayeredLayout, type UseLayeredLayoutParams } from "@gravity-ui/graph-layered/react";

const params: UseLayeredLayoutParams = {
  blocks: [{ id: "a", width: 100, height: 50 }],
  connections: [{ id: "ports" }],
  layoutOptions: { nodeVerticalGap: 120 },
  onError: (error: Error) => void error,
};

export function useLayout(): boolean {
  const { result, isLoading }: { result: ConverterResult | null; isLoading: boolean } = useLayeredLayout(params);
  return isLoading || result === null;
}

// @ts-expect-error the hook requires blocks and connections
useLayeredLayout({ blocks: [] });
