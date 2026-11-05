import { TTileRect, TileIndex } from "./TileIndex";
import type { TIterator, Tree } from "./Tree";

export type TTreeCullingOptions = {
  /** Edge of a visibility tile in world units. */
  tileSize: number;
  /** Exact world-space viewport; undefined makes every node visible. */
  getViewport: () => TTileRect | undefined;
  /** Candidate share above which a complete selection scans nodes instead of querying tiles. @default 0.75 */
  fullWalkShare?: number;
};

/** Eligible nodes in local paint order. */
type TPaintOrder = { revision: number; stamp: number; nodes: Tree[] };

/** A work list in insertion order; nodes that leave it leave a hole until the list is compacted. */
type TWorkList = Array<Tree | undefined>;

function sameRect(a: TTileRect, b: TTileRect): boolean {
  return a.minX === b.minX && a.minY === b.minY && a.maxX === b.maxX && a.maxY === b.maxY;
}

/**
 * Owns preparation, viewport visibility and painting for one configured Tree root.
 *
 * A frame has three steps:
 * 1. The owner, new nodes and nodes that requested an update prepare, ancestors first.
 * 2. Visibility is published. It is kept between frames: a camera move rechecks only nodes in the
 *    parts of the old and new viewports outside each other, plus nodes with new bounds. A structural
 *    change runs one complete selection.
 * 3. One pass over the cached local paint order runs `iterate()` for visible and prepared nodes. A
 *    clean visible node applies its own pending work there. Clean offscreen nodes get no call, and
 *    their visible descendants are still reached through them. Painting does not change which
 *    branches are walked and ignores what `iterate()` returns: only preparation decides.
 *
 * A camera frame therefore does work for the visible nodes plus what changed, and a flag check for every
 * node of the cached paint order. Only publication writes `Tree.published`. Node sets are arrays indexed
 * by slots stored on the nodes, so registering, publishing and preparing a node costs no hashing.
 */
export class TreeCulling {
  // Stamps are global: a node that moves to another scope must not match stamps of the new one.
  private static walkStamp = 0;
  private static selectionStamp = 0;
  private static orderStamp = 0;

  public readonly index: TileIndex<Tree>;

  /** Registered nodes except the owner, at `Tree.scopeSlot`. */
  public readonly nodes: Tree[] = [];

  /** Nodes published as visible, at `Tree.visibleSlot`. */
  private readonly visible: Tree[] = [];

  /** Nodes not prepared since they were registered, at `Tree.freshSlot`. */
  private readonly fresh: TWorkList = [];

  /** Nodes that requested preparation, at `Tree.pendingSlot`. */
  private readonly pending: TWorkList = [];

  /** Nodes whose bounds changed since visibility was last published, at `Tree.boundsSlot`. */
  private readonly boundsDirty: TWorkList = [];

  /** Observing nodes whose published visibility changed since the last notification. */
  private readonly viewportChanges: Tree[] = [];

  /** Any change that can affect this frame's preparation: membership, order, permission or bounds. */
  private revision = 0;

  /** Membership, local order and traversal permission; bounds do not change these. */
  public structureRevision = 0;

  /** Structure revision the published visibility belongs to; -1 while it is being rebuilt. */
  public visibilityRevision = -1;

  public stamp = 0;

  public walking = false;

  public painting = false;

  /** Viewport and structure of the last exact publication: the base of the next incremental one. */
  private selectionBase?: TTileRect & { structure: number };

  /** Structure revision of the last publication that made every eligible node visible. */
  private allVisibleRevision = -1;

  /** Viewport of the latest publication, a stable copy; undefined when every node is visible. */
  public frameViewport?: TTileRect;

  /** Nodes prepared ahead of painting in the current frame. */
  private prepared: Tree[] = [];

  /** How many of them were painted; the rest finish their lifecycle without painting. */
  private preparedPainted = 0;

  private paintOrder?: TPaintOrder;

  private readonly visitList: Tree[] = [];

  constructor(
    public readonly owner: Tree,
    public readonly options: TTreeCullingOptions
  ) {
    this.index = new TileIndex({ tileSize: options.tileSize });
    // The owner is published apart from the index, but it observes its viewport like any node.
    owner.observesViewport = typeof owner.data.viewportChanged === "function";
  }

  public walk(iterator: TIterator): void {
    this.walking = true;
    this.painting = false;
    this.stamp = ++TreeCulling.walkStamp;
    try {
      this.prepared = [];
      this.preparedPainted = 0;
      this.prepare(this.owner);
      let revision: number;
      do {
        revision = this.revision;
        // Reconciliation and geometry updates can register or request more nodes in this same frame;
        // the lists grow while they are read.
        const fresh = this.fresh;
        for (let i = 0; i < fresh.length; i++) {
          const node = fresh[i];
          if (node) this.prepare(node);
        }
        const pending = this.pending;
        for (let i = 0; i < pending.length; i++) {
          const node = pending[i];
          if (node) this.prepare(node);
        }
      } while (revision !== this.revision);
      // Only nodes whose preparation an ancestor blocked are left.
      this.compactFresh();
      this.compactPending();
      // The structure is final for this frame: the paint order also tells publication which nodes are eligible.
      const order = this.getPaintOrder();
      this.publish(order.stamp);
      if (this.viewportChanges.length) this.notifyViewportChanges();
      this.painting = true;
      this.paint(iterator, order.nodes);
      if (this.preparedPainted !== this.prepared.length) this.finishPrepared(iterator);
    } finally {
      this.walking = false;
      this.painting = false;
      // Frame lists must not keep removed nodes alive until the next traversal.
      this.prepared = [];
      this.visitList.length = 0;
    }
  }

  /** Prepares a node after its ancestors, unless an ancestor forbids walking its branch. */
  private prepare(node: Tree): void {
    if (node.scope !== this) return;
    if (node.preparedStamp === this.stamp) {
      // Registered again after its preparation in this frame, for example moved to another parent:
      // its update already ran, so it is painted in this frame like any other prepared node.
      this.takeFresh(node);
      return;
    }
    if (node !== this.owner) {
      const parent = node.parent;
      if (!parent || !parent.children.has(node)) return;
      if (parent.preparedStamp !== this.stamp) this.prepare(parent);
      if (parent.preparedStamp !== this.stamp || !parent.childrenWalkAllowed || node.scope !== this) return;
    }
    this.prepared.push(node);
    if (node.pendingSlot >= 0) {
      this.pending[node.pendingSlot] = undefined;
      node.pendingSlot = -1;
    }
    this.takeFresh(node);
    node.prepareData(this.stamp);
  }

  private takeFresh(node: Tree): void {
    if (node.freshSlot < 0) return;
    this.fresh[node.freshSlot] = undefined;
    node.freshSlot = -1;
  }

  private compactFresh(): void {
    const list = this.fresh;
    let size = 0;
    for (let i = 0; i < list.length; i++) {
      const node = list[i];
      if (!node) continue;
      node.freshSlot = size;
      list[size++] = node;
    }
    list.length = size;
  }

  private compactPending(): void {
    const list = this.pending;
    let size = 0;
    for (let i = 0; i < list.length; i++) {
      const node = list[i];
      if (!node) continue;
      node.pendingSlot = size;
      list[size++] = node;
    }
    list.length = size;
  }

  private publish(eligible: number): void {
    // Bounds can change several times per frame, for example while components mount; index them once.
    const dirty = this.boundsDirty;
    for (let i = 0; i < dirty.length; i++) {
      const node = dirty[i];
      if (node) this.index.set(node, node.boundsMinX, node.boundsMinY, node.boundsMaxX, node.boundsMaxY);
    }
    // Viewport sources may reuse one object; publication works on a stable copy.
    const source = this.options.getViewport();
    const viewport = source && { ...source };
    this.frameViewport = viewport;
    this.visibilityRevision = -1;
    // New descendants whose preparation an ancestor blocked stay hidden.
    const fresh = this.fresh;
    for (let i = 0; i < fresh.length; i++) {
      const node = fresh[i];
      if (node) this.show(node, false);
    }
    if (!viewport || this.index.covers(viewport)) {
      this.publishAll(eligible);
    } else if (!this.publishDelta(viewport, eligible)) {
      this.publishSelection(viewport, eligible);
    }
    for (let i = 0; i < dirty.length; i++) {
      const node = dirty[i];
      if (node) node.boundsSlot = -1;
    }
    dirty.length = 0;
    // The owner is not indexed: its own bounds are always checked against the viewport.
    const owner = this.owner;
    const ownerVisible = owner.isEligible(this) && this.intersects(owner, viewport);
    if (owner.published !== ownerVisible) {
      owner.published = ownerVisible;
      if (owner.observesViewport) this.viewportChanges.push(owner);
    }
    this.visibilityRevision = this.structureRevision;
  }

  private show(node: Tree, visible: boolean): void {
    if (node.published === visible) return;
    if (visible) {
      node.published = true;
      node.visibleSlot = this.visible.length;
      this.visible.push(node);
    } else {
      this.unlist(node);
    }
    if (node.observesViewport) this.viewportChanges.push(node);
  }

  /** Clears a node's published visibility without notifying it, for example when it leaves the scope. */
  private unlist(node: Tree): void {
    node.published = false;
    const slot = node.visibleSlot;
    if (slot < 0) return;
    const list = this.visible;
    const last = list.pop() as Tree;
    if (last !== node) {
      list[slot] = last;
      last.visibleSlot = slot;
    }
    node.visibleSlot = -1;
  }

  /**
   * Tells observing nodes about their new membership, once per change. A node that changed back within the frame,
   * or left the scope, is not notified. Handlers run after publication: updates they request apply in a later frame.
   */
  private notifyViewportChanges(): void {
    const changes = this.viewportChanges;
    for (let i = 0; i < changes.length; i++) {
      const node = changes[i];
      const inViewport = node.published;
      if (node.scope !== this || node.notifiedInViewport === inViewport) continue;
      node.notifiedInViewport = inViewport;
      node.data.viewportChanged?.(inViewport);
    }
    changes.length = 0;
  }

  /**
   * The viewport contains every indexed node: eligibility alone decides visibility. `eligible` is the
   * stamp of the current paint order, which lists exactly the eligible nodes.
   */
  private publishAll(eligible: number): void {
    this.selectionBase = undefined;
    if (this.allVisibleRevision === this.structureRevision) return;
    const nodes = this.nodes;
    for (let i = 0; i < nodes.length; i++) this.show(nodes[i], nodes[i].orderStamp === eligible);
    this.allVisibleRevision = this.structureRevision;
  }

  /** Publishes a complete selection by checking every node: for dense views. */
  private publishScan(viewport: TTileRect, eligible: number): void {
    this.allVisibleRevision = -1;
    const nodes = this.nodes;
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      this.show(node, node.orderStamp === eligible && this.intersects(node, viewport));
    }
    this.selectionBase = { ...viewport, structure: this.structureRevision };
  }

  /** Publishes a complete selection through the tiles, or by a scan when most nodes are candidates. */
  private publishSelection(viewport: TTileRect, eligible: number): void {
    const limit = this.nodes.length * (this.options.fullWalkShare ?? 0.75);
    if (this.index.countCandidates(viewport, limit) > limit) {
      this.publishScan(viewport, eligible);
      return;
    }
    this.allVisibleRevision = -1;
    const stamp = ++TreeCulling.selectionStamp;
    this.index.query(viewport, (node) => {
      node.selectedStamp = stamp;
      if (node.scope === this) this.show(node, node.orderStamp === eligible);
    });
    // Hiding moves the last entry into the freed slot, so the list is read from the end.
    const visible = this.visible;
    for (let i = visible.length - 1; i >= 0; i--) {
      const node = visible[i];
      if (node.selectedStamp !== stamp) this.show(node, false);
    }
    this.selectionBase = { ...viewport, structure: this.structureRevision };
  }

  /**
   * Republishes only nodes that can change visibility since the last exact publication: nodes in the
   * parts of the old and new viewports outside each other, and nodes with new bounds.
   */
  private publishDelta(viewport: TTileRect, eligible: number): boolean {
    const base = this.selectionBase;
    if (!base || base.structure !== this.structureRevision) return false;
    const check = (node: Tree): void => {
      if (node.scope === this) this.show(node, node.orderStamp === eligible && this.intersects(node, viewport));
    };
    if (!sameRect(base, viewport)) {
      this.queryOutside(viewport, base, check);
      this.queryOutside(base, viewport, check);
      base.minX = viewport.minX;
      base.minY = viewport.minY;
      base.maxX = viewport.maxX;
      base.maxY = viewport.maxY;
    }
    const dirty = this.boundsDirty;
    for (let i = 0; i < dirty.length; i++) {
      const node = dirty[i];
      if (node) check(node);
    }
    return true;
  }

  /** Visits indexed nodes intersecting the part of `outer` outside `inner`; edges are inclusive. */
  private queryOutside(outer: TTileRect, inner: TTileRect, visit: (node: Tree) => void): void {
    if (outer.minX > inner.maxX || outer.maxX < inner.minX || outer.minY > inner.maxY || outer.maxY < inner.minY) {
      this.index.query(outer, visit);
      return;
    }
    if (outer.minY < inner.minY) {
      this.index.query({ minX: outer.minX, minY: outer.minY, maxX: outer.maxX, maxY: inner.minY }, visit);
    }
    if (outer.maxY > inner.maxY) {
      this.index.query({ minX: outer.minX, minY: inner.maxY, maxX: outer.maxX, maxY: outer.maxY }, visit);
    }
    const minY = Math.max(outer.minY, inner.minY);
    const maxY = Math.min(outer.maxY, inner.maxY);
    if (outer.minX < inner.minX) this.index.query({ minX: outer.minX, minY, maxX: inner.minX, maxY }, visit);
    if (outer.maxX > inner.maxX) this.index.query({ minX: inner.maxX, minY, maxX: outer.maxX, maxY }, visit);
  }

  /**
   * Local paint order of eligible nodes; rebuilt after structural changes. A child reached from a node that walks its
   * children is eligible if it is in this scope; listed nodes carry the order's stamp.
   */
  private getPaintOrder(): TPaintOrder {
    let order = this.paintOrder;
    if (order?.revision !== this.structureRevision) {
      const stamp = ++TreeCulling.orderStamp;
      const nodes: Tree[] = [];
      const collect = (node: Tree): void => {
        node.orderStamp = stamp;
        nodes.push(node);
        if (!node.childrenWalkAllowed || !node.children.size) return;
        const children = node.getOrderedChildren();
        for (let i = 0; i < children.length; i++) {
          const child = children[i];
          if (child.parent !== node || child.scope !== this) continue;
          if (child.childrenWalkAllowed && child.children.size) {
            collect(child);
          } else {
            // Most nodes are leaves: list them without another call.
            child.orderStamp = stamp;
            nodes.push(child);
          }
        }
      };
      collect(this.owner);
      this.paintOrder = order = { revision: this.structureRevision, stamp, nodes };
    }
    return order;
  }

  /**
   * Paints in local z-order. The first loop picks visible and prepared nodes; clean offscreen nodes are skipped and
   * their visible descendants are still picked. The second loop runs iterate() only for picked nodes. Painting does not
   * change which branches are walked and ignores what iterate() returns: only preparation decides.
   */
  private paint(iterator: TIterator, nodes: Tree[]): void {
    const list = this.visitList;
    const stamp = this.stamp;
    const owner = this.owner;
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      if (node === owner || node.published || node.preparedStamp === stamp) list.push(node);
    }
    for (let k = 0; k < list.length; k++) {
      const node = list[k];
      // Painting can remove or re-register a node; nodes it adds or moves are painted from the next frame.
      if (node !== owner && (node.scope !== this || node.freshSlot >= 0)) continue;
      const prepared = node.preparedStamp === stamp;
      if (prepared) this.preparedPainted++;
      node.preparedStamp = stamp;
      node.paintedStamp = stamp;
      iterator(node, prepared, node.published);
    }
  }

  /**
   * A prepared node moved under a parent that does not walk its children completes its frame without painting; like
   * painting, it ignores what iterate() returns.
   */
  private finishPrepared(iterator: TIterator): void {
    for (const node of this.prepared) {
      if (node.paintedStamp === this.stamp || !node.data.prepareUpdate || node.scope !== this) continue;
      node.paintedStamp = this.stamp;
      iterator(node, true, false);
    }
  }

  public add(node: Tree): void {
    if (node === this.owner || node.scopeSlot >= 0) return;
    node.scopeSlot = this.nodes.length;
    this.nodes.push(node);
    node.observesViewport = typeof node.data.viewportChanged === "function";
    // A node moved here from another scope keeps the membership it was last told; the next publication is
    // compared with it, so a change is delivered once and an unchanged one not at all.
    if (node.observesViewport) this.viewportChanges.push(node);
    node.freshSlot = this.fresh.length;
    this.fresh.push(node);
    this.update(node);
    this.invalidateStructure();
  }

  public invalidateStructure(): void {
    this.structureRevision++;
    this.revision++;
  }

  public update(node: Tree): void {
    if (node.scopeSlot < 0) return;
    if (node.boundsSlot < 0) {
      node.boundsSlot = this.boundsDirty.length;
      this.boundsDirty.push(node);
    }
    this.revision++;
  }

  public delete(node: Tree): void {
    this.paintOrder = undefined;
    this.index.delete(node);
    const slot = node.scopeSlot;
    if (slot >= 0) {
      const last = this.nodes.pop() as Tree;
      if (last !== node) {
        this.nodes[slot] = last;
        last.scopeSlot = slot;
      }
      node.scopeSlot = -1;
    }
    this.unlist(node);
    if (node.freshSlot >= 0) this.fresh[node.freshSlot] = undefined;
    if (node.pendingSlot >= 0) this.pending[node.pendingSlot] = undefined;
    if (node.boundsSlot >= 0) this.boundsDirty[node.boundsSlot] = undefined;
    node.freshSlot = node.pendingSlot = node.boundsSlot = -1;
    this.invalidateStructure();
  }

  public markPending(node: Tree): void {
    if (node.pendingSlot >= 0) return;
    node.pendingSlot = this.pending.length;
    this.pending.push(node);
  }

  public intersects(node: Tree, viewport: TTileRect | undefined): boolean {
    return (
      !viewport ||
      Number.isNaN(node.boundsMinX) ||
      (node.boundsMinX <= viewport.maxX &&
        node.boundsMaxX >= viewport.minX &&
        node.boundsMinY <= viewport.maxY &&
        node.boundsMaxY >= viewport.minY)
    );
  }
}
