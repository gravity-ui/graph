import { ElkExtendedEdge, ElkNode } from "elkjs";

import { ConverterResult } from "../types";

const convertElkEdges = (edges?: ElkExtendedEdge[]): ConverterResult["edges"] => {
  return edges.reduce<ConverterResult["edges"]>((acc, edge) => {
    if ("sections" in edge) {
      acc[edge.id] = {
        points: [edge.sections[0].startPoint, ...(edge.sections[0].bendPoints || []), edge.sections[0].endPoint],
        labels: edge.labels,
      };
    }

    return acc;
  }, {});
};

const convertElkChildren = (childrens: ElkNode[]): ConverterResult["blocks"] => {
  return childrens.reduce((acc, children) => {
    acc[children.id] = {
      x: children.x,
      y: children.y,
    };
    return acc;
  }, {});
};

export const elkConverter = (node: ElkNode): ConverterResult => {
  return {
    edges: convertElkEdges(node.edges),
    blocks: convertElkChildren(node.children),
  };
};
