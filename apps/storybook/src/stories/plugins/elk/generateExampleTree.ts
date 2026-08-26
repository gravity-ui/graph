import { TGraphConfig } from "@gravity-ui/graph";

import { createBlock } from "../../configurations/generatePretty";

export function generateExampleTree(levels: number) {
  const tree: Pick<TGraphConfig, "blocks" | "connections"> = {
    blocks: [],
    connections: [],
  };

  function generateLevel(level: number, parentIndex = -1) {
    const numNodes = 2 ** level;

    for (let i = 0; i < numNodes; i++) {
      const id = `block_${level}-${i}`;
      tree.blocks.push(createBlock(1, 1, `${level}-${i}`));

      if (level) {
        const sourceId = `block_${level - 1}-${parentIndex - 1}`;
        tree.connections.push({
          id: `${sourceId}/${id}`,
          targetBlockId: id,
          sourceBlockId: sourceId,
        });
      }
    }
  }

  for (let i = 0; i < levels; i++) {
    generateLevel(i, Math.floor(2 ** i / 2));
  }

  return tree;
}
