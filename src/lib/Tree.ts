import { cache } from "./utils";

type TIterator = (node: Tree) => boolean;

export interface ITree {
  iterate(): void;
}

export class Tree<T extends ITree = ITree> {
  public data: T;
  public parent: Tree;

  public children: Set<Tree> = new Set();
  
  private childrenArray: Tree[] = [];

  protected childrenDirty = false;

  protected zIndexGroups: Map<number, Set<Tree>> = new Map();

  protected zIndexChildrenCache = cache(() => {
    return Array.from(this.zIndexGroups.keys())
      .sort((a, b) => a - b)
      .map((index) => Array.from(this.zIndexGroups.get(index) || []))
      .flat(2) as Tree[];
  });

  public renderOrder = 0;

  public zIndex = 1;

  constructor(data: T, parent?: Tree) {
    this.data = data;
    this.parent = parent;
  }

  public append(node: Tree) {
    node.parent = this;
    this.children.add(node);
    this.childrenDirty = true;
    this.addInZIndex(node);
  }

  protected addInZIndex(node: Tree) {
    if (!this.zIndexGroups.has(node.zIndex)) {
      this.zIndexGroups.set(node.zIndex, new Set());
    }
    this.zIndexGroups.get(node.zIndex).add(node);
    this.zIndexChildrenCache.reset();
  }

  protected removeZIndex(node: Tree) {
    const zIndex = node.zIndex;
    const set = this.zIndexGroups.get(node.zIndex);
    if (!set) return;
    set.delete(node);
    if (!set.size) {
      this.zIndexGroups.delete(zIndex);
      this.zIndexChildrenCache.reset();
    }
  }

  public remove(node: Tree = this) {
    if (node.parent === null) return;
    this.children.delete(node);
    this.childrenDirty = true;
    this.removeZIndex(node);
  }

  public setChildren(nodes: Tree[]) {
    this.children = new Set(nodes);
    this.childrenDirty = true;

    nodes.forEach((item) => {
      this.addInZIndex(item);
    });
  }

  public updateZIndex(index: number) {
    if (this.zIndex === index) {
      return;
    }
    this.zIndex = index;
    this.parent?.updateChildZIndex(this);
  }

  public updateChildZIndex(child: Tree) {
    if(!this.children.has(child)) {
      return;
    }
    this.removeZIndex(child);
    this.addInZIndex(child);
  }

  public clearChildren() {
    this.children.clear();
    this.childrenDirty = true;

    this.zIndexGroups.clear();
    this.zIndexChildrenCache.clear();
  }

  public traverseDown(iterator: TIterator) {
    this._traverse(iterator, "_walkDown");
  }

  private _traverse(iterator: TIterator, strategyName: string) {
    this[strategyName](iterator);
  }

  protected getChildrenArray() {
    if (this.childrenDirty) {
      this.childrenArray = Array.from(this.children);
      this.childrenDirty = false;
    }
    return this.childrenArray;
  }

  protected _walkDown(iterator: TIterator, order: number) {
    this.renderOrder = order;
    if (iterator(this)) {
      if (!this.children.size) {
        return;
      }
      const children = this.zIndexChildrenCache.get();
      for (let i = 0; i < children.length; i++) {
        children[i]._walkDown(iterator, i);
      }
    }
  }
}
