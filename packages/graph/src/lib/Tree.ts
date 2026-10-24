import { TTreeCullingOptions, TreeCulling } from "./TreeCulling";
import { cache } from "./utils";

/**
 * Runs one node's frame. `prepared` tells whether the tree already called `prepareUpdate()` for this
 * node in this traversal; `visible` is the tree's paint decision for the node's own bounds.
 */
export type TIterator = (node: Tree, prepared: boolean, visible: boolean) => boolean;

export interface ITree {
  /**
   * Runs this node's frame. When `prepared` is false, `iterate()` applies its pending work itself first.
   * `visible` is the tree's paint decision; the node may still veto painting. False suppresses children.
   */
  iterate(prepared: boolean, visible: boolean): boolean;
  /** Applies pending work without painting; false suppresses this node's descendants. */
  prepareUpdate?(): boolean;
}

export class Tree<T extends ITree = ITree> {
  public data: T;
  public parent?: Tree;
  public children: Set<Tree> = new Set();
  /** @internal Parent traversal permission, independent of own viewport visibility. */
  public childrenWalkAllowed = true;
  protected zIndexGroups: Map<number, Set<Tree>> = new Map();
  protected zIndexChildrenCache = cache(() => {
    const groups = this.zIndexGroups;
    const ordered: Tree[] = [];
    const indexes = groups.size > 1 ? Array.from(groups.keys()).sort((a, b) => a - b) : groups.keys();
    for (const index of indexes) {
      for (const node of groups.get(index) ?? []) {
        node.renderOrder = ordered.length;
        ordered.push(node);
      }
    }
    return ordered;
  });
  public renderOrder = 0;
  public zIndex = 1;

  /** This node's own world-space bounds; NaN when unknown. */
  public boundsMinX = NaN;
  public boundsMinY = NaN;
  public boundsMaxX = NaN;
  public boundsMaxY = NaN;
  protected culling?: TreeCulling;
  /** @internal Shared frame coordinator for this node. */
  public scope?: TreeCulling;
  /** @internal Viewport visibility published by the scope for the current frame. */
  public published = false;
  /** @internal Last traversal that prepared this node. */
  public preparedStamp = 0;
  /** @internal Last traversal that ran this node's iterate(). */
  public paintedStamp = 0;
  /** @internal Exact selection for one spatial query. */
  public selectedStamp = 0;
  /** @internal Paint order that lists this node; it marks the node eligible while that order is current. */
  public orderStamp = 0;
  /** @internal Positions in the scope's node lists; -1 when absent. */
  public scopeSlot = -1;
  public visibleSlot = -1;
  public freshSlot = -1;
  public pendingSlot = -1;
  public boundsSlot = -1;
  private eligibilityRevision = -1;
  private traversalAllowed = true;

  constructor(data: T, parent?: Tree) {
    this.data = data;
    this.parent = parent;
  }

  public append(node: Tree) {
    if (node.parent && node.parent !== this) node.parent.remove(node);
    node.parent = this;
    this.children.add(node);
    this.addInZIndex(node);
    node.setScope(node.culling ?? this.scope);
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
    const set = this.zIndexGroups.get(node.zIndex);
    if (!set) return;
    set.delete(node);
    if (!set.size) this.zIndexGroups.delete(node.zIndex);
    this.zIndexChildrenCache.clear();
  }

  public remove(node: Tree = this) {
    if (node === this) {
      this.parent?.remove(this);
      return;
    }
    if (node.parent !== this) return;
    this.children.delete(node);
    this.removeZIndex(node);
    node.setScope(undefined);
    node.parent = undefined;
  }

  public setChildren(nodes: Tree[]) {
    // Components reconcile on every update; unchanged children must not invalidate the whole scope.
    if (this.hasChildrenInOrder(nodes)) return;
    this.scope?.invalidateStructure();
    if (this.children.size) {
      const next = new Set(nodes);
      for (const child of this.children) {
        if (!next.has(child)) this.remove(child);
      }
    }
    this.children.clear();
    this.zIndexGroups.clear();
    this.zIndexChildrenCache.clear();
    for (const node of nodes) this.append(node);
  }

  /** Whether the children are exactly `nodes`, in this order and in this order within each z-index. */
  private hasChildrenInOrder(nodes: Tree[]): boolean {
    if (nodes.length !== this.children.size) return false;
    let i = 0;
    for (const child of this.children) {
      if (child !== nodes[i++]) return false;
    }
    for (const [zIndex, group] of this.zIndexGroups) {
      let j = 0;
      for (const node of group) {
        while (j < nodes.length && nodes[j].zIndex !== zIndex) j++;
        if (nodes[j++] !== node) return false;
      }
    }
    return true;
  }

  /** Configures a shared spatial scope for this root and all its descendants. */
  public setCulling(options: TTreeCullingOptions | undefined): void {
    this.setScope(undefined);
    this.culling = options ? new TreeCulling(this, options) : undefined;
    this.setScope(this.culling ?? this.parent?.scope);
  }

  private setScope(scope: TreeCulling | undefined): void {
    if (this.scope === scope) return;
    this.scope?.delete(this);
    this.scope = scope;
    this.eligibilityRevision = -1;
    scope?.add(this);
    for (const child of this.children) child.setScope(scope);
  }

  /** Reports this node's own bounds without including descendants. */
  public setBounds(minX: number, minY: number, maxX: number, maxY: number): void {
    if (
      !Number.isFinite(minX) ||
      !Number.isFinite(minY) ||
      !Number.isFinite(maxX) ||
      !Number.isFinite(maxY) ||
      minX > maxX ||
      minY > maxY
    )
      minX = minY = maxX = maxY = NaN;
    if (
      Object.is(this.boundsMinX, minX) &&
      Object.is(this.boundsMinY, minY) &&
      Object.is(this.boundsMaxX, maxX) &&
      Object.is(this.boundsMaxY, maxY)
    )
      return;
    this.boundsMinX = minX;
    this.boundsMinY = minY;
    this.boundsMaxX = maxX;
    this.boundsMaxY = maxY;
    this.scope?.update(this);
  }

  /** Asks the scope to prepare this node before the next frame publishes visibility and paints. */
  public requestWalk(): void {
    this.scope?.markPending(this);
  }

  /**
   * Own bounds intersect the viewport and ancestors allow traversal. While the scope paints this is the
   * frame's published decision; otherwise it reads the current viewport and bounds.
   */
  public isVisible(): boolean {
    const scope = this.scope;
    if (!scope) return true;
    const visible = scope.painting ? this.published : scope.intersects(this, scope.options.getViewport());
    return (
      visible && ((scope.painting && scope.visibilityRevision === scope.structureRevision) || this.isEligible(scope))
    );
  }

  /** Whether every ancestor still contains this branch and permits its traversal. */
  public isTraversalAllowed(): boolean {
    const scope = this.scope;
    if (scope?.walking) {
      if (
        scope.painting &&
        this.published &&
        this !== scope.owner &&
        scope.visibilityRevision === scope.structureRevision
      )
        return true;
      if (this.eligibilityRevision !== scope.structureRevision) {
        const parent = this.parent;
        this.traversalAllowed =
          !parent || (parent.children.has(this) && parent.childrenWalkAllowed && parent.isTraversalAllowed());
        this.eligibilityRevision = scope.structureRevision;
      }
      return this.traversalAllowed;
    }
    let node: Tree = this;
    while (node.parent) {
      const parent = node.parent;
      if (!parent.children.has(node) || !parent.childrenWalkAllowed) return false;
      node = parent;
    }
    return true;
  }

  /** @internal */
  public isEligible(scope: TreeCulling): boolean {
    return this.scope === scope && this.isTraversalAllowed();
  }

  /** @internal */
  public setChildrenWalkAllowed(allowed: boolean): void {
    if (this.childrenWalkAllowed === allowed) return;
    this.childrenWalkAllowed = allowed;
    this.scope?.invalidateStructure();
  }

  public updateZIndex(index: number) {
    if (this.zIndex === index) return;
    const parent = this.parent;
    if (!parent?.children.has(this)) {
      this.zIndex = index;
      return;
    }
    parent.removeZIndex(this);
    this.zIndex = index;
    parent.addInZIndex(this);
    this.scope?.invalidateStructure();
  }

  public updateChildZIndex(child: Tree) {
    if (!this.children.has(child)) return;
    this.removeZIndex(child);
    this.addInZIndex(child);
    this.scope?.invalidateStructure();
  }

  public clearChildren() {
    for (const child of this.children) child.setScope(undefined);
    this.children.clear();
    this.zIndexGroups.clear();
    this.zIndexChildrenCache.clear();
  }

  public traverseDown(iterator: TIterator) {
    if (this.culling) this.culling.walk(iterator);
    else this._walkDown(iterator, 0);
  }

  /** @internal */
  public prepareData(stamp: number): void {
    this.preparedStamp = stamp;
    this.setChildrenWalkAllowed(this.data.prepareUpdate?.() ?? true);
  }

  /** @internal Children in local paint order. */
  public getOrderedChildren(): Tree[] {
    return this.zIndexChildrenCache.get();
  }

  protected _walkDown(iterator: TIterator, order: number) {
    this.renderOrder = order;
    this.setChildrenWalkAllowed(iterator(this, false, true));
    if (!this.childrenWalkAllowed) return;
    const children = this.zIndexChildrenCache.get();
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (child.culling) child.culling.walk(iterator);
      else child._walkDown(iterator, i);
    }
  }
}
