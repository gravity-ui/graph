import { TreeNode } from "./TreeNode";
import { Block } from "./Block";

export class BlocksNode extends TreeNode<{}, Block> {

  public getZIndex(item: Block) {
    return item.zIndex;
  }
}