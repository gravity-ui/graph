import type { TIterator, Tree } from "../Tree";

import type { TTileRect, TileIndex } from "./TileIndex";
import { VisibilityPublication } from "./VisibilityPublication";
import { TPaintOrder, buildPaintOrder } from "./paintOrder";

export type TTreeCullingOptions = {
  /** Edge of a visibility tile in world units. */
  tileSize: number;
  /** Exact world-space viewport; undefined makes every node visible. */
  getViewport: () => TTileRect | undefined;
  /** Candidate share above which a complete selection scans nodes instead of querying tiles. @default 0.75 */
  fullWalkShare?: number;
};

/** A work list in insertion order; nodes that leave it leave a hole until the list is compacted. */
type TWorkList = Array<Tree | undefined>;

/**
 * Owns preparation, viewport visibility and painting for one Tree root.
 *
 * A frame has three steps:
 * 1. Prepare. The owner, new nodes and nodes that requested an update prepare, ancestors first. Preparation is the
 *    only step that changes which branches are walked.
 * 2. Publish (VisibilityPublication). Visibility is kept between frames and rechecked incrementally.
 * 3. Paint. One pass over the cached paint order (paintOrder.ts) runs `iterate()` for visible and prepared nodes. A
 *    clean visible node applies its own pending work there; clean offscreen nodes get no call.
 *
 * Invariants, checked after every walk in the package tests (cullingInvariants.ts):
 * 1. Only publication writes `Tree.published`; unregistering a node clears it.
 * 2. After publication a node is published exactly when it is registered, listed in the current paint order and its
 *    bounds intersect the viewport (unknown bounds intersect everything).
 * 3. The visible list holds exactly the published nodes, each at its `visibleSlot`.
 * 4. Only preparation changes `childrenWalkAllowed`; a node whose iterate() disagrees is prepared in the next frame.
 * 5. A node is iterated at most once per walk; a node prepared in a walk is iterated in it unless it left the scope.
 * 6. A node that requested an update is prepared in the next walk unless an ancestor forbids walking its branch.
 *
 * Node sets are arrays indexed by slots stored on the nodes, so registering, publishing and preparing a node costs no
 * hashing.
 */
export class TreeCulling {
  // Stamps are global: a node that moves to another scope must not match stamps of the new one.
  private static walkStamp = 0;
  private static orderStamp = 0;

  public readonly publication: VisibilityPublication;

  /** Registered nodes except the owner, at `Tree.scopeSlot`. */
  public readonly nodes: Tree[] = [];

  /** @internal Nodes not prepared since they were registered, at `Tree.freshSlot`. */
  public readonly fresh: TWorkList = [];

  /** Nodes that requested preparation, at `Tree.pendingSlot`. */
  private readonly pending: TWorkList = [];

  /** @internal Nodes whose bounds changed since visibility was last published, at `Tree.boundsSlot`. */
  public readonly boundsDirty: TWorkList = [];

  /** Any change that can affect this frame's preparation: membership, order, permission or bounds. */
  private revision = 0;

  /** Membership, local order and traversal permission; bounds do not change these. */
  public structureRevision = 0;

  /** Structure revision the published visibility belongs to; -1 while it is being rebuilt. */
  public visibilityRevision = -1;

  public stamp = 0;

  public walking = false;

  public painting = false;

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
    this.publication = new VisibilityPublication(this);
  }

  public get index(): TileIndex<Tree> {
    return this.publication.index;
  }

  /** Viewport of the latest publication, a stable copy; undefined when every node is visible. */
  public get frameViewport(): TTileRect | undefined {
    return this.publication.frameViewport;
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
      this.visibilityRevision = -1;
      this.publication.publish(order.stamp);
      this.visibilityRevision = this.structureRevision;
      // Observers learn about the published visibility before painting; changes they make apply in a later frame.
      this.publication.notifyViewportChanges();
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

  /** Local paint order of eligible nodes; rebuilt after structural changes. */
  private getPaintOrder(): TPaintOrder {
    if (this.paintOrder?.revision !== this.structureRevision) {
      this.paintOrder = buildPaintOrder(this.owner, ++TreeCulling.orderStamp, this.structureRevision);
    }
    return this.paintOrder;
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
    this.publication.observe(node);
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
    this.publication.forget(node);
    const slot = node.scopeSlot;
    if (slot >= 0) {
      const last = this.nodes.pop() as Tree;
      if (last !== node) {
        this.nodes[slot] = last;
        last.scopeSlot = slot;
      }
      node.scopeSlot = -1;
    }
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
}
