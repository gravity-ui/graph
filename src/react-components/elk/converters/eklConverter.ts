import { ElkExtendedEdge, ElkNode } from "elkjs";

import { ConverterResult } from "../types";

const convertElkEdges = (edges?: ElkExtendedEdge[]): ConverterResult["edges"] => {
  return (edges ?? []).reduce<ConverterResult["edges"]>((acc, edge) => {
    const firstSection = "sections" in edge ? edge.sections?.[0] : undefined;
    if (firstSection) {
      acc[edge.id] = {
        points: [firstSection.startPoint, ...(firstSection.bendPoints ?? []), firstSection.endPoint],
        labels: edge.labels,
      };
    }

    return acc;
  }, {});
};

const convertElkChildren = (childrens: ElkNode[]): ConverterResult["blocks"] => {
  return childrens.reduce<ConverterResult["blocks"]>((acc, children) => {
    acc[children.id] = {
      x: children.x ?? 0,
      y: children.y ?? 0,
    };
    return acc;
  }, {});
};

export const elkConverter = (node: ElkNode): ConverterResult => {
  return {
    edges: convertElkEdges(node.edges),
    blocks: convertElkChildren(node.children ?? []),
  };
};
