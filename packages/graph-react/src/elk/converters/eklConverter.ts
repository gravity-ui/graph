import { ElkExtendedEdge, ElkNode } from "elkjs";

import { ConverterResult } from "../types";

const convertElkEdges = (edges: ElkExtendedEdge[] = []): ConverterResult["edges"] => {
  return edges.reduce<ConverterResult["edges"]>((acc, edge) => {
    const section = edge.sections?.[0];
    if (section) {
      acc[edge.id] = {
        points: [section.startPoint, ...(section.bendPoints || []), section.endPoint],
        labels: edge.labels,
      };
    }

    return acc;
  }, {});
};

const convertElkChildren = (childrens: ElkNode[] = []): ConverterResult["blocks"] => {
  return childrens.reduce<ConverterResult["blocks"]>((acc, children) => {
    if (children.x === undefined || children.y === undefined) return acc;
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
