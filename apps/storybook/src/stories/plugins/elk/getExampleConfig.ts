import { ElkExtendedEdge, ElkNode, LayoutOptions } from "elkjs";

import { TGraphConfig } from "@gravity-ui/graph";
import { measureText } from "@gravity-ui/graph";
import { createBlock, generatePrettyBlocks } from "@gravity-ui/graph";

import { Algorithm } from "./elk.stories";
import { generateExampleTree } from "./generateExampleTree";

const FONT_SIZE = 14;

const prepareChildren = (blocks: TGraphConfig["blocks"]) => {
  return blocks.map((b) => {
    return {
      id: b.id as string,
      width: b.width,
      height: b.height,
    } satisfies ElkNode;
  });
};

const prepareEdges = (connections: TGraphConfig["connections"], skipLabels?: boolean) => {
  return connections.map((c, i) => {
    const labelText = `label ${i}`;

    return {
      id: c.id as string,
      sources: [c.sourceBlockId as string],
      targets: [c.targetBlockId as string],
      labels: skipLabels
        ? []
        : [{ text: labelText, width: measureText(labelText, `${FONT_SIZE}px sans-serif`), height: FONT_SIZE }],
    } satisfies ElkExtendedEdge;
  });
};

const ElkOptionalMap: Record<Algorithm, LayoutOptions> = {
  box: {
    "elk.algorithm": "box",
    "elk.spacing.edgeNode": "500.0",
    "elk.spacing.nodeNode": "500.0",
  },
  radial: {
    "elk.algorithm": "radial",
    "elk.spacing.nodeNode": "300",
  },
  disco: {
    "elk.algorithm": "disco",
    "elk.disco.componentCompaction.componentLayoutAlgorithm": "force",
  },
  mrtree: {
    "elk.algorithm": "mrtree",
    "elk.direction": "DOWN",
    "elk.nodeLabels.placement": "OUTSIDE",
    "elk.edgeLabels.placement": "CENTER",
    "elk.spacing.edgeNode": "200",
    "elk.spacing.nodeNode": "200",
  },
  random: {
    "elk.algorithm": "random",
    "elk.spacing.nodeNode": "200",
  },
  force: {
    "elk.algorithm": "force",
    "elk.nodeLabels.placement": "OUTSIDE",
    "elk.edgeLabels.placement": "CENTER",
  },
  stress: {
    "elk.algorithm": "stress",
    "elk.stress.desiredEdgeLength": "500",
  },
  sporeOverlap: {
    "elk.algorithm": "sporeOverlap",
    "elk.spacing.nodeNode": "100.0",
  },
  sporeCompaction: {
    "elk.algorithm": "sporeCompaction",
    "elk.spacing.nodeNode": "100",
    "elk.underlyingLayoutAlgorithm": "force",
  },
  layered: {
    "elk.algorithm": "layered",
    "elk.spacing.edgeNode": "500.0",
    "elk.spacing.nodeNode": "500.0",
    "elk.nodeLabels.placement": "OUTSIDE",
    "elk.edgeLabels.placement": "CENTER",
  },
};

export const getExampleConfig = (algorithm: Algorithm): { elkConfig: ElkNode; graphConfig: TGraphConfig } => {
  let config = generatePrettyBlocks({ layersCount: 10, connectionsPerLayer: 30, dashedLine: true });

  const elkConfig = {
    id: "root",
    children: prepareChildren(config.blocks),
    edges: prepareEdges(config.connections),
    layoutOptions: ElkOptionalMap[algorithm],
  };

  switch (algorithm) {
    case Algorithm.Box: {
      config = {
        ...config,
        blocks: config.blocks.map((block, i) => {
          const scale = algorithm === Algorithm.Box ? Math.floor(i / 10) || 1 : 1;
          return {
            ...block,
            width: block.width * scale,
            height: block.height * scale,
          };
        }),
      };

      return {
        elkConfig: {
          ...elkConfig,
          children: prepareChildren(config.blocks),
          layoutOptions: {
            "elk.algorithm": Algorithm.Box,
            "elk.spacing.edgeNode": "500.0",
            "elk.spacing.nodeNode": "500.0",
          },
        },
        graphConfig: config,
      };
    }
    case Algorithm.Disco: {
      config = {
        blocks: Array.from({ length: 6 }, (_, i) => {
          return createBlock(0, 0, i);
        }),
        connections: [
          {
            id: `block_0/block_1`,
            targetBlockId: `block_1`,
            sourceBlockId: `block_0`,
          },
          {
            id: `block_2/block_3`,
            targetBlockId: `block_3`,
            sourceBlockId: `block_2`,
          },
          {
            id: `block_2/block_5`,
            targetBlockId: `block_5`,
            sourceBlockId: `block_2`,
          },
          {
            id: `block_3/block_4`,
            targetBlockId: `block_4`,
            sourceBlockId: `block_3`,
          },
          {
            id: `block_4/block_2`,
            targetBlockId: `block_2`,
            sourceBlockId: `block_4`,
          },
        ],
      };
      return {
        elkConfig: {
          ...elkConfig,
          children: prepareChildren(config.blocks),
          edges: prepareEdges(config.connections),
        },
        graphConfig: config,
      };
    }
    case Algorithm.Radial:
    case Algorithm.Stress:
    case Algorithm.SporeOverlap: {
      config = generateExampleTree(4);

      return {
        elkConfig: {
          ...elkConfig,
          children: prepareChildren(config.blocks),
          edges: prepareEdges(config.connections),
        },
        graphConfig: config,
      };
    }
    case Algorithm.MrTree:
    case Algorithm.Random:
    case Algorithm.Force:
    case Algorithm.SporeCompaction: {
      config = generateExampleTree(4);

      return {
        elkConfig: {
          ...elkConfig,
          children: prepareChildren(config.blocks),
          edges: prepareEdges(config.connections, true),
        },
        graphConfig: config,
      };
    }
    default: {
      return {
        elkConfig: {
          ...elkConfig,
          layoutOptions: {
            "elk.algorithm": algorithm,
            "elk.spacing.edgeNode": "500.0",
            "elk.spacing.nodeNode": "500.0",
            "elk.nodeLabels.placement": "OUTSIDE",
            "elk.edgeLabels.placement": "CENTER",
          },
        },
        graphConfig: config,
      };
    }
  }
};
