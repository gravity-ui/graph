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
  // Moving between scopes must not repeat a node's lifecycle in the same traversal.
  private static walkStamp = 0;
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
  private preparedStamp = 0;
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
    if (this.scope) this.scope.revision++;
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
    return (
      !scope ||
      (this.visible && ((scope.walking && scope.fullVisibilityRevision === scope.revision) || this.isEligible(scope)))
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
      if (this.visible && this !== scope.owner && scope.fullVisibilityRevision === scope.revision) return true;
      if (this.eligibilityRevision !== scope.revision) {
        const parent = this.parent;
        this.traversalAllowed =
          !parent || (parent.children.has(this) && parent.childrenWalkAllowed && parent.isTraversalAllowed());
        this.eligibilityRevision = scope.revision;
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

  private isEligible(scope: TreeCulling): boolean {
    return this.scope === scope && this.isTraversalAllowed();
  }

  private setChildrenWalkAllowed(allowed: boolean): void {
    if (this.childrenWalkAllowed === allowed) return;
    this.childrenWalkAllowed = allowed;
    if (this.scope) this.scope.revision++;
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
    if (this.scope) this.scope.revision++;
  }

  public updateChildZIndex(child: Tree) {
    if (!this.children.has(child)) return;
    this.removeZIndex(child);
    this.addInZIndex(child);
    if (this.scope) this.scope.revision++;
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
    const wasWalking = scope.walking;
    scope.walking = true;
    scope.stamp = ++Tree.walkStamp;
    // An ancestor outside this scope can change its traversal permission independently.
    if (this.parent) scope.revision++;
    try {
      this.prepareAndWalk(iterator, scope);
    } finally {
      scope.walking = wasWalking;
    }
  }

  private prepareData(scope: TreeCulling): void {
    this.preparedStamp = scope.stamp;
    if (scope.pending.size) scope.pending.delete(this);
    if (scope.fresh.size) scope.fresh.delete(this);
    this.setChildrenWalkAllowed(this.data.prepareUpdate?.() ?? true);
  }

  private prepareAndWalk(iterator: TIterator, scope: TreeCulling): void {
    let prepared: Tree[] = [];
    const prepareNode = (node: Tree): void => {
      prepared.push(node);
      node.prepareData(scope);
    };
    const prepare = (node: Tree): void => {
      if (node.preparedStamp === scope.stamp || node.scope !== scope) return;
      if (node !== this) {
        const parent = node.parent;
        if (!parent || !parent.children.has(node)) return;
        prepare(parent);
        if (parent.preparedStamp !== scope.stamp || !parent.childrenWalkAllowed || node.scope !== scope) return;
      }
      prepareNode(node);
    };
    prepare(this);
    const viewport = scope.options.getViewport();
    scope.didCull = Boolean(viewport && (scope.options.isEnabled?.() ?? true));
    scope.walkToken = scope.options.getWalkToken?.();
    const fullWalk = !scope.didCull || !viewport || scope.index.covers(viewport);
    const preparationRevision = scope.revision;
    if (fullWalk) {
      const cached = scope.fullPreparation;
      if (cached?.revision === scope.revision) {
        prepared = cached.nodes;
        for (let i = 1; i < cached.nodes.length; i++) {
          cached.nodes[i].prepareData(scope);
          if (cached.revision !== scope.revision) {
            prepared = cached.nodes.slice(0, i + 1);
            break;
          }
        }
      }
      const prepareBranch = (node: Tree): void => {
        if (node.scope !== scope) return;
        if (node.preparedStamp !== scope.stamp) prepareNode(node);
        if (!node.childrenWalkAllowed || !node.children.size) return;
        for (const child of node.getChildrenArray()) {
          if (child.parent === node) prepareBranch(child);
        }
      };
      if (cached?.revision !== scope.revision) prepareBranch(this);
    }
    let revision: number;
    do {
      revision = scope.revision;
      if (!fullWalk) {
        const candidates = scope.select(scope.didCull ? viewport : undefined);
        for (const node of candidates) prepare(node);
      }
      for (const node of scope.fresh) prepare(node);
      for (const node of scope.pending) prepare(node);
      // Reconciliation and geometry updates can expose additional nodes in this same frame.
    } while (revision !== scope.revision);
    if (fullWalk) {
      scope.fullPreparation =
        preparationRevision === scope.revision ? { revision: scope.revision, nodes: prepared } : undefined;
    }

    const fullyVisible = (!viewport || scope.index.covers(viewport)) && this.isTraversalAllowed();
    this.setVisible(this.isEligible(scope) && scope.intersects(this, viewport));
    // Camera movement cannot change visibility while it still contains the unchanged tree.
    if (!fullyVisible || scope.fullVisibilityRevision !== scope.revision) {
      const visibilityRevision = scope.revision;
      scope.fullVisibilityRevision = -1;
      const active = scope.active;
      for (const node of active) {
        if (node.preparedStamp !== scope.stamp) {
          active.delete(node);
          node.setVisible(false);
        }
      }
      for (const node of prepared) {
        const visible = node.isEligible(scope) && scope.intersects(node, viewport);
        node.setVisible(visible);
        if (visible) active.add(node);
        else active.delete(node);
      }
      // The root is retained for clearing its canvas, not by the descendant visibility registry.
      active.delete(this);
      if (fullyVisible && scope.revision === visibilityRevision) scope.fullVisibilityRevision = visibilityRevision;
    }
    this.walkPrepared(iterator, scope, prepared, fullWalk);
  }

  private walkPrepared(iterator: TIterator, scope: TreeCulling, prepared: Tree[], fullWalk: boolean): void {
    let walked: number;
    if (fullWalk) {
      walked = this.paintFull(iterator, scope);
    } else {
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
      walked = this.paintPrepared(iterator, scope, children);
    }
    if (walked === prepared.length) return;
    // A parent can suppress children while painting; finish their already prepared lifecycles.
    for (const node of prepared) {
      if (node.cullingStamp === scope.stamp || !node.data.prepareUpdate || node.scope !== scope) continue;
      scope.active.delete(node);
      node.setVisible(false);
      node.cullingStamp = scope.stamp;
      const allowed = iterator(node);
      if (!allowed) node.setChildrenWalkAllowed(false);
    }
  }

  private paintFull(iterator: TIterator, scope: TreeCulling): number {
    let ordered = scope.fullPaint;
    if (ordered?.revision !== scope.revision) {
      const nodes: Tree[] = [];
      const collect = (node: Tree): void => {
        if (node !== this && (node.preparedStamp !== scope.stamp || !node.isEligible(scope))) return;
        nodes.push(node);
        if (!node.childrenWalkAllowed || !node.children.size) return;
        for (const child of node.zIndexChildrenCache.get()) {
          if (child.parent === node) collect(child);
        }
      };
      collect(this);
      scope.fullPaint = ordered = { revision: scope.revision, nodes };
    }
    let walked = 0;
    for (let i = 0; i < ordered.nodes.length; i++) {
      const node = ordered.nodes[i];
      if (
        scope.revision !== ordered.revision &&
        node !== this &&
        (node.preparedStamp !== scope.stamp || node.cullingStamp === scope.stamp || !node.isEligible(scope))
      )
        continue;
      node.cullingStamp = scope.stamp;
      const allowed = iterator(node);
      if (!allowed) node.setChildrenWalkAllowed(false);
      walked++;
    }
    return walked;
  }

  private paintPrepared(iterator: TIterator, scope: TreeCulling, children: Map<Tree, Tree[]>): number {
    this.cullingStamp = scope.stamp;
    const allowed = iterator(this);
    if (!allowed) this.setChildrenWalkAllowed(false);
    let walked = 1;
    if (this.childrenWalkAllowed && this.children.size) {
      const selected = children.get(this) ?? [];
      for (const child of selected) {
        if (
          child.preparedStamp === scope.stamp &&
          child.cullingStamp !== scope.stamp &&
          child.scope === scope &&
          child.parent === this &&
          child.isTraversalAllowed()
        ) {
          walked += child.paintPrepared(iterator, scope, children);
        }
      }
    }
    return walked;
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
    this.setChildrenWalkAllowed(iterator(this));
    if (!this.childrenWalkAllowed) return;
    const children = this.zIndexChildrenCache.get();
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (child.culling) child.walkScope(iterator, child.culling);
      else child._walkDown(iterator, i);
    }
  }
}
