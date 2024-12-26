import { ElkExtendedEdge, ElkNode } from "elkjs";

import { TGraphConfig } from "../../../graph";
import { measureText } from "../../../utils/functions/text";

const FONT_SIZE = 14;

export const getElkConfig = ({ blocks, connections }: TGraphConfig, algorithm: string) => ({
  id: "root",
  layoutOptions: {
    "elk.algorithm": algorithm,
    "elk.spacing.edgeNode": "500.0",
    "elk.spacing.nodeNode": "500.0",

    "elk.nodeLabels.placement": "OUTSIDE",
    "elk.edgeLabels.placement": "CENTER",
  },
  children: blocks.map((b) => {
    return {
      id: b.id as string,
      width: b.width,
      height: b.height,
    } satisfies ElkNode;
  }),
  edges: connections.map((c, i) => {
    const labelText = `label ${i}`;

    return {
      id: c.id as string,
      sources: [c.sourceBlockId as string],
      targets: [c.targetBlockId as string],
      labels: [{ text: labelText, width: measureText(labelText, `${FONT_SIZE}px sans-serif`), height: FONT_SIZE }],
    } satisfies ElkExtendedEdge;
  }),
});
