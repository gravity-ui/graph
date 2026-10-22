import { TTreeCullingOptions, TreeCulling } from "./TreeCulling";
import { cache } from "./utils";

type TIterator = (node: Tree) => boolean;

export interface ITree {
  iterate(): boolean;
  /** Applies updates before any node paints; false suppresses this node's descendants. */
  prepareUpdate?(): boolean;
  /** Runs before painting when this node's own viewport visibility changes. */
  onViewportChange?(visible: boolean): void;
}

export class Tree<T extends ITree = ITree> {
  public data: T;
  public parent?: Tree;
  public children: Set<Tree> = new Set();
  private childrenArray: Tree[] = [];
  private childrenWalkAllowed = true;
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
  private scope?: TreeCulling;
  private visible = true;

  constructor(data: T, parent?: Tree) {
    this.data = data;
    this.parent = parent;
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
    this.cullingStamp = 0;
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
    return !this.scope || (this.visible && this.isEligible(this.scope));
  }

  public isSkippedByCulling(token: unknown): boolean {
    const scope = this.scope;
    return Boolean(scope && this.isEligible(scope) && scope.isSkipped(this, token));
  }

  /** Whether every ancestor still contains this branch and permits its traversal. */
  public isTraversalAllowed(): boolean {
    let node: Tree = this;
    while (node.parent) {
      const parent = node.parent;
      if (!parent.children.has(node) || !parent.childrenWalkAllowed) return false;
      node = parent;
    }
    return true;
  }

  private isEligible(scope: TreeCulling): boolean {
    return this.scope === scope && this.isTraversalAllowed();
  }

  private setVisible(visible: boolean): void {
    if (this.visible === visible) return;
    this.visible = visible;
    this.data.onViewportChange?.(visible);
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
  }

  public updateChildZIndex(child: Tree) {
    if (!this.children.has(child)) return;
    this.removeZIndex(child);
    this.addInZIndex(child);
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
    if (this.culling) this.walkScope(iterator, this.culling);
    else this._walkDown(iterator, 0);
  }

  private walkScope(iterator: TIterator, scope: TreeCulling): void {
    const prepared = new Set<Tree>();
    const prepare = (node: Tree): void => {
      if (prepared.has(node) || node.scope !== scope) return;
      if (node !== this) {
        const parent = node.parent;
        if (!parent || !parent.children.has(node)) return;
        prepare(parent);
        if (!prepared.has(parent) || !parent.childrenWalkAllowed || node.scope !== scope) return;
      }
      prepared.add(node);
      scope.pending.delete(node);
      scope.fresh.delete(node);
      node.childrenWalkAllowed = node.data.prepareUpdate?.() ?? true;
    };
    prepare(this);
    const viewport = scope.options.getViewport();
    scope.didCull = Boolean(viewport && (scope.options.isEnabled?.() ?? true));
    scope.walkToken = scope.options.getWalkToken?.();
    scope.stamp++;
    let revision: number;
    do {
      revision = scope.revision;
      const candidates = scope.select(scope.didCull ? viewport : undefined);
      for (const node of candidates) prepare(node);
      for (const node of scope.fresh) prepare(node);
      for (const node of scope.pending) prepare(node);
      // Reconciliation and geometry updates can expose additional nodes in this same frame.
    } while (revision !== scope.revision);

    const active = new Set<Tree>();
    for (const node of prepared) {
      if (node.isEligible(scope) && scope.intersects(node, viewport)) active.add(node);
    }
    for (const node of scope.active) node.setVisible(active.has(node));
    for (const node of prepared) node.setVisible(active.has(node));
    scope.active = active;
    // The root is retained for clearing its canvas, not by the descendant visibility registry.
    scope.active.delete(this);
    this.walkPrepared(iterator, scope, prepared);
  }

  private walkPrepared(iterator: TIterator, scope: TreeCulling, prepared: Set<Tree>): void {
    const children = new Map<Tree, Tree[]>();
    for (const node of prepared) {
      if (node === this || !node.isEligible(scope)) continue;
      const parent = node.parent;
      if (!parent) continue;
      let selected = children.get(parent);
      if (!selected) {
        parent.zIndexChildrenCache.get();
        children.set(parent, (selected = []));
      }
      selected.push(node);
    }
    for (const selected of children.values()) selected.sort((a, b) => a.renderOrder - b.renderOrder);
    const walk = (node: Tree) => {
      node.cullingStamp = scope.stamp;
      const allowed = iterator(node);
      node.childrenWalkAllowed = allowed && node.childrenWalkAllowed;
      if (node.childrenWalkAllowed) {
        for (const child of children.get(node) ?? []) walk(child);
      }
    };
    walk(this);
    // A parent can suppress children while painting; finish their already prepared lifecycles.
    for (const node of prepared) {
      if (node.cullingStamp === scope.stamp || !node.data.prepareUpdate || node.scope !== scope) continue;
      scope.active.delete(node);
      node.setVisible(false);
      node.cullingStamp = scope.stamp;
      const allowed = iterator(node);
      node.childrenWalkAllowed = allowed && node.childrenWalkAllowed;
    }
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
    if (!this.childrenWalkAllowed) return;
    const children = this.zIndexChildrenCache.get();
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (child.culling) child.walkScope(iterator, child.culling);
      else child._walkDown(iterator, i);
    }
  }
}
