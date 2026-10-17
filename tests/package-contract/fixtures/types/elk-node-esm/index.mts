import type { TBlock, TMultipointConnection } from "@gravity-ui/graph";
import { elkConverter, type ConverterResult } from "@gravity-ui/graph-elk";
import { useElk, type UseElkArgs } from "@gravity-ui/graph-elk/react";
import type { ELK, ElkNode } from "elkjs";

declare const elk: ELK;
declare const block: TBlock;
declare const connection: TMultipointConnection;

const layout: ElkNode = { id: "root", children: [{ id: "a", width: 10, height: 10 }] };
const converted: ConverterResult = elkConverter(layout);
const positioned: TBlock = { ...block, ...converted.blocks[block.id] };
const routed: TMultipointConnection = { ...connection, ...converted.edges[connection.id ?? ""] };
void [positioned, routed];

const args: UseElkArgs = { layoutOptions: { "elk.algorithm": "layered" }, onError: (error: Error) => void error };
const hook: (config: ElkNode, instance: ELK, options?: UseElkArgs) => {
  result: ConverterResult | null;
  isLoading: boolean;
} = useElk;
void [args, hook, elk];

// @ts-expect-error The converter accepts an ELK graph, not graph entities.
elkConverter(block);
