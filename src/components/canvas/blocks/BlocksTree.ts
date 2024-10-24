import { Block } from "./Block";
import { TreeNode } from "./TreeNode";

export class BlocksNode extends TreeNode<{}, Block> {
  public getZIndex(item: Block) {
    return item.zIndex;
  }
}
