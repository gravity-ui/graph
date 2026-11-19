import React from "react";

import type { Graph, TBlock, TGraphColorsPatch } from "@gravity-ui/graph";
import { GraphBlock } from "@gravity-ui/graph-react";

/** A block of another class: its name in a plain view (both stories render their own class only). */
export const PlainView = ({ graph, block }: { graph: Graph; block: TBlock }): React.JSX.Element => (
  <GraphBlock graph={graph} block={block}>
    {block.name}
  </GraphBlock>
);

/** White cards on the light canvas; the selection keeps the theme colour. */
export const viewConfiguration: { colors: TGraphColorsPatch } = {
  colors: { block: { background: "#ffffff", border: "#d9dce1", text: "#1f2329" } },
};
