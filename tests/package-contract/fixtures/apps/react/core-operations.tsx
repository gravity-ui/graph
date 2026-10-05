import { Graph, type TBlock } from "@gravity-ui/graph";
import { GraphBlock, useBlockState, useBlockAnchorState } from "@gravity-ui/graph-react";
import { coreOperations, genericAuthoring } from "../vanilla/core-operations";

export function reactCoreConsumer({ graph, block }: { graph: Graph; block: TBlock }) {
  const state = useBlockState(graph, block.id);
  const anchor = useBlockAnchorState(graph, { id: "anchor", blockId: block.id, type: "IN" });
  const selected: boolean | undefined = state?.selected;
  const view = anchor?.getViewComponent();
  genericAuthoring(graph);
  void [selected, view, coreOperations];
  return (
    <GraphBlock graph={graph} block={block}>
      Block
    </GraphBlock>
  );
}
