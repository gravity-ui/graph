import type { TTileRect } from "./TileIndex";
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

  private childrenWalkAllowed = false;

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

  private ownBounds?: TTileRect;

  /** World-space bounds of this node and its descendants; NaN when unknown. */
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
    this.updateBounds();
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
    this.updateBounds();
  }

  public setChildren(nodes: Tree[]) {
    this.children = new Set(nodes);
    this.childrenDirty = true;

    nodes.forEach((item) => {
      this.addInZIndex(item);
      this.culling?.add(item);
    });
    this.updateBounds();
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

  /** Reports this node's own world-space bounds; culling also includes its descendants. */
  public setBounds(minX: number, minY: number, maxX: number, maxY: number): void {
    if (!this.ownBounds) this.ownBounds = { minX, minY, maxX, maxY };
    else {
      this.ownBounds.minX = minX;
      this.ownBounds.minY = minY;
      this.ownBounds.maxX = maxX;
      this.ownBounds.maxY = maxY;
    }
    this.updateBounds();
  }

  private updateBounds(): void {
    // Containers without their own bounds are always walked, regardless of their children.
    if (!this.ownBounds) return;
    let { minX, minY, maxX, maxY } = this.ownBounds;
    if (
      !Number.isFinite(minX) ||
      !Number.isFinite(minY) ||
      !Number.isFinite(maxX) ||
      !Number.isFinite(maxY) ||
      minX > maxX ||
      minY > maxY
    ) {
      minX = minY = maxX = maxY = NaN;
    } else {
      for (const child of this.children) {
        minX = Math.min(minX, child.boundsMinX);
        minY = Math.min(minY, child.boundsMinY);
        maxX = Math.max(maxX, child.boundsMaxX);
        maxY = Math.max(maxY, child.boundsMaxY);
      }
    }
    if (
      Object.is(this.boundsMinX, minX) &&
      Object.is(this.boundsMinY, minY) &&
      Object.is(this.boundsMaxX, maxX) &&
      Object.is(this.boundsMaxY, maxY)
    ) {
      return;
    }
    this.boundsMinX = minX;
    this.boundsMinY = minY;
    this.boundsMaxX = maxX;
    this.boundsMaxY = maxY;
    if (this.parent?.children.has(this)) {
      this.parent.culling?.update(this);
      this.parent.updateBounds();
    }
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

  /** Whether this node was skipped by an ancestor's culling in the traversal identified by `token`. */
  public isSkippedByCulling(token: unknown): boolean {
    let node: Tree = this;
    while (node.parent) {
      const parent = node.parent;
      if (!parent.children.has(node) || !parent.childrenWalkAllowed) return false;
      if (parent.culling?.isSkipped(node, token)) return true;
      node = parent;
    }
    return false;
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
    this.updateBounds();
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
    this.childrenWalkAllowed = iterator(this);
    if (this.childrenWalkAllowed) {
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
