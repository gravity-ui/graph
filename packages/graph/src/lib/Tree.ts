import { TTreeCullingOptions, TreeCulling } from "./TreeCulling";
import { cache } from "./utils";

type TIterator = (node: Tree) => boolean;

export interface ITree {
  iterate(): boolean;
}

export class Tree<T extends ITree = ITree> {
  public data: T;
  public parent?: Tree;

  public children: Set<Tree> = new Set();

  private childrenArray: Tree[] = [];

  protected childrenDirty = false;

  protected zIndexGroups: Map<number, Set<Tree>> = new Map();

  protected zIndexChildrenCache = cache(() => {
    const ordered = Array.from(this.zIndexGroups.keys())
      .sort((a, b) => a - b)
      .map((index) => Array.from(this.zIndexGroups.get(index) || []))
      .flat(2) as Tree[];
    if (this.culling) {
      // A culled walk skips children, so every child gets its draw position here instead.
      for (let i = 0; i < ordered.length; i++) {
        ordered[i].renderOrder = i;
      }
    }
    return ordered;
  });

  public renderOrder = 0;

  public zIndex = 1;

  /** World-space bounds reported by the node's data for its parent's culling; NaN when unknown. */
  public boundsMinX = NaN;

  public boundsMinY = NaN;

  public boundsMaxX = NaN;

  public boundsMaxY = NaN;

  /** @internal Selection stamp of the parent's culling. */
  public cullingStamp = 0;

  protected culling?: TreeCulling;

  constructor(data: T, parent?: Tree) {
    this.data = data;
    this.parent = parent;
  }

  public append(node: Tree) {
    node.parent = this;
    this.children.add(node);
    this.childrenDirty = true;
    this.addInZIndex(node);
    this.culling?.add(node);
  }

  protected addInZIndex(node: Tree) {
    let group = this.zIndexGroups.get(node.zIndex);
    if (!group) {
      group = new Set();
      this.zIndexGroups.set(node.zIndex, group);
    }
    group.add(node);
    this.zIndexChildrenCache.reset();
  }

  protected removeZIndex(node: Tree) {
    const zIndex = node.zIndex;
    const set = this.zIndexGroups.get(node.zIndex);
    if (!set) return;
    set.delete(node);
    if (!set.size) {
      this.zIndexGroups.delete(zIndex);
    }
    this.zIndexChildrenCache.reset();
  }

  public remove(node: Tree = this) {
    if (node.parent === null) return;
    this.children.delete(node);
    this.childrenDirty = true;
    this.removeZIndex(node);
    this.culling?.delete(node);
  }

  public setChildren(nodes: Tree[]) {
    this.children = new Set(nodes);
    this.childrenDirty = true;

    nodes.forEach((item) => {
      this.addInZIndex(item);
      this.culling?.add(item);
    });
  }

  /**
   * Enables visibility culling of the children: a traversal walks only children whose bounds
   * intersect the viewport, plus children that requested an update (see {@link requestWalk}).
   * `undefined` disables it.
   */
  public setCulling(options: TTreeCullingOptions | undefined): void {
    if (!options) {
      this.culling = undefined;
    } else {
      const culling = new TreeCulling(this, options);
      this.children.forEach((node) => culling.add(node));
      this.culling = culling;
    }
    this.zIndexChildrenCache.reset();
  }

  /** Reports the world-space bounds this node draws in to the parent's culling. */
  public setBounds(minX: number, minY: number, maxX: number, maxY: number): void {
    this.boundsMinX = minX;
    this.boundsMinY = minY;
    this.boundsMaxX = maxX;
    this.boundsMaxY = maxY;
    this.parent?.culling?.update(this);
  }

  /** Makes every culling ancestor walk the branch with this node in the next traversal. */
  public requestWalk(): void {
    let node: Tree = this;
    let parent = node.parent;
    while (parent) {
      parent.culling?.markPending(node);
      node = parent;
      parent = node.parent;
    }
  }

  /**
   * Whether the parent's culling chose the children to walk in the traversal identified by
   * `token` and this node is still a child. A node like that which was not walked was out of view
   * with nothing to process.
   */
  public isSkippedByCulling(token: unknown): boolean {
    const parent = this.parent;
    if (!parent?.culling) return false;
    return parent.culling.walkToken === token && parent.children.has(this);
  }

  public updateZIndex(index: number) {
    if (this.zIndex === index) {
      return;
    }
    const parent = this.parent;
    if (!parent?.children.has(this)) {
      this.zIndex = index;
      return;
    }
    // Leave the group of the previous zIndex before switching to the new one.
    parent.removeZIndex(this);
    this.zIndex = index;
    parent.addInZIndex(this);
  }

  public updateChildZIndex(child: Tree) {
    if (!this.children.has(child)) {
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
    this._walkDown(iterator, 0);
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
      const selected = this.culling?.select(children);
      if (selected) {
        for (let i = 0; i < selected.length; i++) {
          selected[i]._walkDown(iterator, selected[i].renderOrder);
        }
        return;
      }
      for (let i = 0; i < children.length; i++) {
        children[i]._walkDown(iterator, i);
      }
    }
  }
}
