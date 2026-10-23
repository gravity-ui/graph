import { TTreeCullingOptions, TreeCulling } from "./TreeCulling";
import { cache } from "./utils";

export type TIterator = (node: Tree) => boolean;

export interface ITree {
  iterate(): boolean;
  /** Applies updates before any node paints; false suppresses this node's descendants. */
  prepareUpdate?(): boolean;
  /** Runs before painting when this node's own viewport visibility changes. */
  onViewportChange?(visible: boolean): void;
  /**
   * `iterate()` applies pending updates itself when `prepareUpdate()` has not run in this traversal.
   * The tree then lets clean nodes update inside their own `iterate()`. Read once per node.
   */
  readonly preparesOnIterate?: boolean;
}

export class Tree<T extends ITree = ITree> {
  public data: T;
  public parent?: Tree;
  public children: Set<Tree> = new Set();
  private childrenArray: Tree[] = [];
  /** @internal Parent traversal permission, independent of own viewport visibility. */
  public childrenWalkAllowed = true;
  protected childrenDirty = false;
  protected zIndexGroups: Map<number, Set<Tree>> = new Map();
  protected zIndexChildrenCache = cache(() => {
    const ordered = Array.from(this.zIndexGroups.keys())
      .sort((a, b) => a - b)
      .flatMap((index) => Array.from(this.zIndexGroups.get(index) || []));
    for (let i = 0; i < ordered.length; i++) ordered[i].renderOrder = i;
    return ordered;
  });
  public renderOrder = 0;
  public zIndex = 1;

  /** This node's own world-space bounds; NaN when unknown. */
  public boundsMinX = NaN;
  public boundsMinY = NaN;
  public boundsMaxX = NaN;
  public boundsMaxY = NaN;
  /** @internal Traversal stamp in the shared spatial scope. */
  public cullingStamp = 0;
  protected culling?: TreeCulling;
  /** @internal Shared frame coordinator for this node. */
  public scope?: TreeCulling;
  private visible = true;
  /** @internal Last traversal that prepared this node. */
  public preparedStamp = 0;
  /** @internal Exact selection for one spatial query. */
  public selectedStamp = 0;
  /** @internal Membership in the scope's published visibility registry. */
  public activeInViewport = false;
  private eligibilityRevision = -1;
  private traversalAllowed = true;

  /** @internal See {@link ITree.preparesOnIterate}. */
  public readonly preparesOnIterate: boolean;

  constructor(data: T, parent?: Tree) {
    this.data = data;
    this.parent = parent;
    this.preparesOnIterate = data.preparesOnIterate === true;
  }

  public append(node: Tree) {
    if (node.parent && node.parent !== this) node.parent.remove(node);
    node.parent = this;
    this.children.add(node);
    this.childrenDirty = true;
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
    this.childrenArray = [];
    this.childrenDirty = true;
    this.removeZIndex(node);
    node.setScope(undefined);
    node.parent = undefined;
  }

  public setChildren(nodes: Tree[]) {
    this.scope?.invalidateStructure();
    const next = new Set(nodes);
    for (const child of this.children) {
      if (!next.has(child)) this.remove(child);
    }
    this.children.clear();
    this.childrenArray = [];
    this.childrenDirty = true;
    this.zIndexGroups.clear();
    this.zIndexChildrenCache.clear();
    for (const node of nodes) this.append(node);
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

  public requestWalk(): void {
    this.scope?.markPending(this);
  }

  /** Own bounds intersect the current exact viewport and ancestors allow traversal. */
  public isVisible(): boolean {
    const scope = this.scope;
    if (!scope) return true;
    // Update hooks need current geometry; painting shares the finalized batch selection.
    const visible =
      scope.painting && scope.preparingNode !== this
        ? this.visible
        : scope.intersects(this, scope.options.getViewport());
    return (
      visible && ((scope.painting && scope.visibilityRevision === scope.structureRevision) || this.isEligible(scope))
    );
  }

  public isSkippedByCulling(token: unknown): boolean {
    const scope = this.scope;
    return Boolean(scope && this.isEligible(scope) && scope.isSkipped(this, token));
  }

  /** Whether every ancestor still contains this branch and permits its traversal. */
  public isTraversalAllowed(): boolean {
    const scope = this.scope;
    if (scope?.walking) {
      if (
        scope.painting &&
        this.visible &&
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

  /** @internal Published viewport visibility; the paint walk visits published nodes. */
  public get publishedVisible(): boolean {
    return this.visible;
  }

  /** @internal */
  public setVisible(visible: boolean): boolean {
    if (this.visible === visible) return false;
    this.visible = visible;
    this.data.onViewportChange?.(visible);
    return true;
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
    this.childrenArray = [];
    this.childrenDirty = true;
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

  /** @internal Children in reconciliation order. */
  public getChildrenArray() {
    if (this.childrenDirty) {
      this.childrenArray = Array.from(this.children);
      this.childrenDirty = false;
    }
    return this.childrenArray;
  }

  /** @internal Children in local paint order. */
  public getOrderedChildren(): Tree[] {
    return this.zIndexChildrenCache.get();
  }

  protected _walkDown(iterator: TIterator, order: number) {
    this.renderOrder = order;
    this.setChildrenWalkAllowed(iterator(this));
    if (!this.childrenWalkAllowed) return;
    const children = this.zIndexChildrenCache.get();
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (child.culling) child.culling.walk(iterator);
      else child._walkDown(iterator, i);
    }
  }
}
