import { cache } from "./utils";

type TIterator = (node: Tree) => boolean;

export interface ITree {
  iterate(): boolean;
}

export class Tree<T extends ITree = ITree> {
  public data: T;
  public parent: Tree;

  public children: Set<Tree> = new Set();

  private childrenArray: Tree[] = [];

  protected childrenDirty = false;

  protected zIndexGroups: Map<number, Set<Tree>> = new Map();

  protected zIndexChildrenCache = cache(() => {
    // Sort by zIndex group, then within each group maintain the original
    // insertion order from the children Set (which is stable and never
    // changes when a block temporarily moves to a higher zIndex group).
    // This ensures a selected/dragged block returns to its natural position
    // in the render stack after being deselected or released.
    const childrenInOrder = this.getChildrenArray();
    return Array.from(this.zIndexGroups.keys())
      .sort((a, b) => a - b)
      .flatMap((index) => {
        const group = this.zIndexGroups.get(index)!;
        return childrenInOrder.filter((node) => group.has(node));
      }) as Tree[];
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
    const oldZIndex = this.zIndex;
    this.zIndex = index;
    this.parent?.updateChildZIndex(this, oldZIndex);
  }

  public updateChildZIndex(child: Tree, oldZIndex: number) {
    if (!this.children.has(child)) {
      return;
    }
    const set = this.zIndexGroups.get(oldZIndex);
    if (set) {
      set.delete(child);
      if (!set.size) {
        this.zIndexGroups.delete(oldZIndex);
      }
    }
    // Bring child to the end of the insertion-order Set so it gets the
    // highest renderOrder within its new zIndex group after re-sorting.
    this.children.delete(child);
    this.children.add(child);
    this.childrenDirty = true;
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
