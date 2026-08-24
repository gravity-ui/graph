import type { TBlock } from "../components/canvas/blocks/Block";
import type { TBlockId } from "../store/block/Block";

import type { GraphPO } from "./GraphPO";
import type { GraphClickOptions, GraphDragOptions, GraphHoverOptions, GraphPoint, GraphRect } from "./types";

export class GraphBlockPO {
  constructor(
    private readonly graph: GraphPO,
    public readonly id: TBlockId
  ) {}

  public async exists(): Promise<boolean> {
    return this.graph.evaluate((graph, blockId) => Boolean(graph.blocks.getBlockState(blockId)), this.id);
  }

  public async getState(): Promise<TBlock | null> {
    return this.graph.evaluate((graph, blockId) => graph.blocks.getBlockState(blockId)?.asTBlock() ?? null, this.id);
  }

  public async getGeometry(): Promise<GraphRect> {
    return this.graph.evaluate((graph, blockId) => {
      const block = graph.blocks.getBlockState(blockId);
      if (!block) {
        throw new Error(`Block ${blockId} was not found.`);
      }
      return block.$geometry.value;
    }, this.id);
  }

  public async getCenter(): Promise<GraphPoint> {
    const geometry = await this.getGeometry();
    return {
      x: geometry.x + geometry.width / 2,
      y: geometry.y + geometry.height / 2,
    };
  }

  public async isSelected(): Promise<boolean> {
    return this.graph.evaluate((graph, blockId) => graph.blocks.getBlockState(blockId)?.selected ?? false, this.id);
  }

  public async click(options?: GraphClickOptions): Promise<void> {
    await this.graph.clickAt(await this.getCenter(), options);
  }

  public async doubleClick(options?: GraphClickOptions): Promise<void> {
    await this.graph.doubleClickAt(await this.getCenter(), options);
  }

  public async hover(options?: GraphHoverOptions): Promise<void> {
    await this.graph.hoverAt(await this.getCenter(), options);
  }

  /** Drags the center of the block to the supplied world coordinate. */
  public async dragTo(point: GraphPoint, options?: GraphDragOptions): Promise<void> {
    await this.graph.drag(await this.getCenter(), point, options);
  }
}
