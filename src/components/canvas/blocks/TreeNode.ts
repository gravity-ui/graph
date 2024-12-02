import { ZIndexMap } from "./ZindexMap";

type TIterator = (node: TreeNode) => boolean;

export class TreeNode<T = unknown, Children = unknown> {
  public data: T;
  public parent: TreeNode;

  public childrenLength = 0;

  protected children: TreeNode<Children>[] = [];

  protected itemsMap: Map<Children, TreeNode<Children>> = new Map();

  protected zIndexMap = new ZIndexMap<TreeNode<Children>>();

  protected renderIdex = new Map<TreeNode<Children>, number>();

  constructor(data, parent?: TreeNode, protected onDone?: () => void) {
    this.data = data;
    this.parent = parent;
  }

  public getZIndex(_item: Children) {
    return 0;
  }

  public getRenderOrder(item: Children) {
    return 1;
    const node = this.itemsMap.get(item);
    if (!node) return -1;
    return this.renderIdex.get(node);
  }

  public updateBlockOrder(item: Children) {
    const node = this.itemsMap.get(item);
    if (!node) return;
    this.zIndexMap.update(node, this.getZIndex(item));
  }

  public append(node: TreeNode<Children>) {
    this.children.push(node);
    this.zIndexMap.add(node, this.getZIndex(node.data));
    this.itemsMap.set(node.data, node);
  }

  public remove(node: TreeNode<Children>) {
    if (node.parent === null) return;

    this.children.splice(this.children.indexOf(node), 1);
    this.zIndexMap.remove(node);
    this.itemsMap.delete(node.data);
  }

  public setChildren(nodes: TreeNode<Children>[]) {
    this.children = nodes;
    this.zIndexMap.load(nodes, (node) => this.getZIndex(node.data));
    this.itemsMap = new Map(nodes.map((node) => [node.data, node]));
  }

  public clearChildren() {
    this.setChildren([]);
    this.zIndexMap.clear();
    this.itemsMap.clear();
  }

  public traverseDown(iterator: TIterator) {
    this._traverse(iterator, "_walkDown");
  }

  private _traverse(iterator: TIterator, strategyName: string) {
    this[strategyName](iterator);
  }

  protected _walkDown(iterator: TIterator) {
    if (iterator(this) === true && this.children.length) {
      let i = 0;
      this.zIndexMap.forEach((node) => {
        this.renderIdex.set(node, i++);
        if (iterator(node) === true) {
          node._walkDown(iterator);
        }
      })
      this.onDone?.();
    }
  }
}
