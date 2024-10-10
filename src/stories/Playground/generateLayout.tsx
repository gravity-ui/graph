import { IS_BLOCK_TYPE } from "../../store/block/Block";
import { TBlock } from "../../components/canvas/blocks/Block";
import { TGraphConfig } from "../../graph";
import { EAnchorType } from "../../store/anchor/Anchor";

export const GravityBlockIS = 'gravity'
export type TGravityBlock = TBlock<{ description: string }> & { is: typeof GravityBlockIS };


export function createPlaygroundBlock(x: number, y: number, index): TGravityBlock {
  const blockId = `block_${index}`;
  return {
    id: blockId,
    is: 'gravity',
    x,
    y,
    width: 63 * window.devicePixelRatio,
    height: 63 * window.devicePixelRatio,
    selected: false,
    name: `Block ${index}`,
    meta: {
      description: "Description",
    },
    anchors: [
      {
        id: `${blockId}_anchor_in`,
        blockId: blockId,
        type: EAnchorType.IN,
      },
      {
        id: `${blockId}_anchor_out`,
        blockId: blockId,
        type: EAnchorType.OUT,
      }
    ],
  };
}

function getRandomArbitrary(min, max) {
  return (Math.random() * (max - min) + min) | 0;
}

export function generatePlaygroundLayout(
  layersCount: number,
  connectionsPerLayer: number,
) {
  const config: TGraphConfig<TGravityBlock> = {
    blocks: [],
    connections: [],
  };

  const gapX = 500;
  const gapY = 200;

  let prevLayerBlocks: TBlock[] = [];
  let index = 0;
  for (let i = 0; i <= layersCount; i++) {
    let count = i ** 2;
    if (i >= layersCount / 2) {
      count = (layersCount - i) ** 2;
    }
    const startY = (500 - gapY * count) / 2;
    const layerX = gapX * i * 2.5;
    const currentLayerBlocks: TBlock[] = [];
    for (let j = 0; j <= count; j++) {
      const y = startY + gapY * j;

      const block = createPlaygroundBlock(layerX, y, ++index);

      config.blocks.push(block);
      currentLayerBlocks.push(block);
    }
    if (i > 1) {
      for (let c = 0; c <= connectionsPerLayer; c++) {
        const indexSource = getRandomArbitrary(
          config.blocks.length - currentLayerBlocks.length - prevLayerBlocks.length - 1,
          config.blocks.length - currentLayerBlocks.length - 1
        );
        const indexTarget = getRandomArbitrary(
          config.blocks.length - currentLayerBlocks.length - 1,
          config.blocks.length - 1
        );
        if (indexSource !== indexTarget) {
          const sourceBlockId = `block_${indexSource}`;
          const targetBlockId = `block_${indexTarget}`;
          config.connections.push({
            sourceBlockId: sourceBlockId,
            sourceAnchorId: `${sourceBlockId}_anchor_out`,
            targetBlockId: targetBlockId,
            targetAnchorId: `${targetBlockId}_anchor_in`,
          });
        }
        
      }
      prevLayerBlocks = [...currentLayerBlocks];
    }
  }

  return config;
}
