import { TTileRect, TileIndex } from "./TileIndex";
import type { TIterator, Tree } from "./Tree";

export type TTreeCullingOptions = {
  /** Edge of a visibility tile in world units. */
  tileSize: number;
  /** Exact world-space viewport; undefined makes every node visible. */
  getViewport: () => TTileRect | undefined;
  /** Disables traversal filtering while retaining the exact viewport paint gate. */
  isEnabled?: () => boolean;
  /** Identifies the current traversal, see {@link Tree.isSkippedByCulling}. */
  getWalkToken?: () => unknown;
  /** Candidate share above which a full selection scans nodes instead of querying tiles. @default 0.75 */
  fullWalkShare?: number;
};

function sameRect(a: TTileRect, b: TTileRect): boolean {
  return a.minX === b.minX && a.minY === b.minY && a.maxX === b.maxX && a.maxY === b.maxY;
}

/**
 * Owns preparation, viewport visibility and painting for one configured Tree root.
 *
 * A frame prepares the owner, new and requested nodes, publishes viewport visibility and then walks
 * the tree once. A visited node that is still clean prepares right before its own paint, so a frame
 * costs the visible nodes plus the work that changed. Visibility is maintained between frames: a
 * camera move rechecks only nodes in the parts of the old and new viewports outside each other.
 */
export class TreeCulling {
  // Moving between scopes must not repeat a node's lifecycle in the same traversal.
  private static walkStamp = 0;
  private static selectionStamp = 0;

  public readonly index: TileIndex<Tree>;

  public readonly nodes = new Set<Tree>();

  private readonly pending = new Set<Tree>();

  private readonly fresh = new Set<Tree>();

  /** Nodes published as visible. */
  private readonly active = new Set<Tree>();

  /** Nodes whose bounds changed since visibility was last published. */
  private readonly boundsDirty = new Set<Tree>();

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

  /** Viewport of the current frame's paint gate; undefined when every eligible node is visible. */
  private frameViewport?: TTileRect;

  /** Culling is disabled: every eligible node is visited while the paint gate stays exact. */
  private visitAll = false;

  /** Nodes prepared ahead of painting in the current frame. */
  private prepared: Tree[] = [];

  private paintOrder?: { revision: number; nodes: Tree[]; ends: number[] };

  private readonly visitList: Tree[] = [];

  private readonly visitPositions: number[] = [];

  private selectionStamp = 0;

  /** Counts update requests and registrations, so publication can tell whether callbacks added work. */
  private requests = 0;

  private walkToken: unknown;

  private didCull = false;

  constructor(
    public readonly owner: Tree,
    public readonly options: TTreeCullingOptions
  ) {
    this.index = new TileIndex({ tileSize: options.tileSize });
  }

  public walk(iterator: TIterator): void {
    const wasWalking = this.walking;
    const wasPainting = this.painting;
    this.walking = true;
    this.painting = false;
    this.stamp = ++TreeCulling.walkStamp;
    // An ancestor outside this scope can change its traversal permission independently.
    if (this.owner.parent) this.invalidateStructure();
    try {
      this.runFrame(iterator);
    } finally {
      this.walking = wasWalking;
      this.painting = wasPainting;
      this.prepared = [];
    }
  }

  private runFrame(iterator: TIterator): void {
    this.prepared = [];
    this.prepare(this.owner);
    this.walkToken = this.options.getWalkToken?.();
    for (let attempt = 0; ; attempt++) {
      let revision: number;
      do {
        revision = this.revision;
        for (const node of this.fresh) this.prepare(node);
        for (const node of this.pending) this.prepare(node);
        // Reconciliation and geometry updates can register or request more nodes in this same frame.
      } while (revision !== this.revision);
      const requests = this.requests;
      this.publish();
      // Visibility callbacks can request updates or register nodes; those are applied before painting too.
      if (requests === this.requests || attempt >= 3) break;
    }
    this.painting = true;
    this.paint(iterator);
    this.finishPrepared(iterator);
  }

  /** Prepares a node after its ancestors, unless an ancestor forbids walking its branch. */
  private prepare(node: Tree): void {
    if (node.preparedStamp === this.stamp || node.scope !== this) return;
    if (node !== this.owner) {
      const parent = node.parent;
      if (!parent || !parent.children.has(node)) return;
      if (parent.preparedStamp !== this.stamp) this.prepare(parent);
      if (parent.preparedStamp !== this.stamp || !parent.childrenWalkAllowed || node.scope !== this) return;
    }
    this.prepared.push(node);
    this.prepareNode(node);
  }

  private prepareNode(node: Tree): void {
    if (this.pending.size) this.pending.delete(node);
    if (this.fresh.size) this.fresh.delete(node);
    node.prepareData(this.stamp);
  }

  /**
   * Publishes visibility for the current viewport before painting. Visibility callbacks can move nodes,
   * change the structure or the viewport itself; publication repeats until it is stable.
   */
  private publish(): void {
    for (let attempt = 0; ; attempt++) {
      // Viewport sources may reuse one object; callbacks must not change the rect being published.
      const source = this.options.getViewport();
      const viewport = source && { ...source };
      const structure = this.structureRevision;
      this.publishFor(viewport);
      this.settleBounds();
      const current = this.options.getViewport();
      const stable =
        structure === this.structureRevision &&
        (current && viewport ? sameRect(current, viewport) : !current && !viewport);
      if (stable || attempt >= 3) {
        if (structure === this.structureRevision) this.visibilityRevision = structure;
        return;
      }
    }
  }

  /** Rechecks nodes whose bounds changed during publication, for example from visibility callbacks. */
  private settleBounds(): void {
    const viewport = this.frameViewport;
    if (viewport) {
      // Set iteration also reaches nodes that callbacks add while it runs.
      for (const node of this.boundsDirty) {
        if (node.scope === this) this.show(node, node.isEligible(this) && this.intersects(node, viewport));
      }
    }
    this.boundsDirty.clear();
  }

  private publishFor(viewport: TTileRect | undefined): void {
    this.visibilityRevision = -1;
    this.visitAll = false;
    this.didCull = Boolean(viewport && (this.options.isEnabled?.() ?? true));
    // New descendants whose preparation an ancestor blocked stay hidden.
    for (const node of this.fresh) node.setVisible(false);
    if (!viewport || this.index.covers(viewport)) {
      this.frameViewport = undefined;
      this.publishAll();
    } else {
      this.frameViewport = viewport;
      if (!this.didCull) {
        this.visitAll = true;
        this.publishExact(this.select(viewport, true), viewport);
      } else if (!this.publishDelta(viewport)) {
        this.publishExact(this.select(viewport), viewport);
      }
    }
    // The owner is not indexed: its own bounds are always checked against the real viewport.
    this.owner.setVisible(this.owner.isEligible(this) && this.intersects(this.owner, viewport));
  }

  private show(node: Tree, visible: boolean): void {
    node.setVisible(visible);
    if (node.activeInViewport !== visible && node.scope === this) {
      node.activeInViewport = visible;
      if (visible) this.active.add(node);
      else this.active.delete(node);
    }
  }

  /** The viewport contains every indexed node: eligibility alone decides visibility. */
  private publishAll(): void {
    this.selectionBase = undefined;
    this.boundsDirty.clear();
    const structure = this.structureRevision;
    if (this.allVisibleRevision === structure) return;
    for (const node of this.nodes) this.show(node, node.isEligible(this));
    this.allVisibleRevision = this.structureRevision === structure ? structure : -1;
  }

  /** Publishes a complete selection: candidates become visible, every other published node hides. */
  private publishExact(candidates: Tree[], viewport: TTileRect): void {
    this.allVisibleRevision = -1;
    // The selection already used current bounds; later changes are settled after publication.
    this.boundsDirty.clear();
    const selection = this.selectionStamp;
    for (const node of this.active) {
      if (node.selectedStamp !== selection) this.show(node, false);
    }
    // Prepared nodes outside the selection publish their exit or their initial hidden state.
    for (const node of this.prepared) {
      if (node !== this.owner && node.scope === this && node.selectedStamp !== selection) this.show(node, false);
    }
    for (const node of candidates) {
      if (node.scope === this) this.show(node, node.isEligible(this));
    }
    this.selectionBase = this.didCull ? { ...viewport, structure: this.structureRevision } : undefined;
  }

  /**
   * Republishes only nodes that can change visibility since the last exact publication: nodes in the
   * parts of the old and new viewports outside each other, nodes with new bounds and prepared nodes.
   */
  private publishDelta(viewport: TTileRect): boolean {
    const base = this.selectionBase;
    if (!base || base.structure !== this.structureRevision) return false;
    const check = (node: Tree): void => {
      if (node.scope === this) this.show(node, node.isEligible(this) && this.intersects(node, viewport));
    };
    if (!sameRect(base, viewport)) {
      this.queryOutside(viewport, base, check);
      this.queryOutside(base, viewport, check);
      base.minX = viewport.minX;
      base.minY = viewport.minY;
      base.maxX = viewport.maxX;
      base.maxY = viewport.maxY;
    }
    for (const node of this.prepared) {
      if (node !== this.owner) check(node);
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

  /** Local paint order of eligible nodes with the end of each subtree; rebuilt after structural changes. */
  private getPaintOrder(): { revision: number; nodes: Tree[]; ends: number[] } {
    let order = this.paintOrder;
    if (order?.revision !== this.structureRevision) {
      const nodes: Tree[] = [];
      const ends: number[] = [];
      const collect = (node: Tree): void => {
        if (node !== this.owner && !node.isEligible(this)) return;
        const index = nodes.length;
        nodes.push(node);
        ends.push(0);
        if (node.childrenWalkAllowed && node.children.size) {
          for (const child of node.getOrderedChildren()) {
            if (child.parent === node) collect(child);
          }
        }
        ends[index] = nodes.length;
      };
      collect(this.owner);
      this.paintOrder = order = { revision: this.structureRevision, nodes, ends };
    }
    return order;
  }

  /**
   * Paints in local z-order. The first loop picks published, prepared or (with culling disabled) all
   * eligible nodes; clean offscreen nodes pass through to their descendants. The second loop runs
   * iterate() only for picked nodes, so the per-node path never sees a culled node.
   */
  private paint(iterator: TIterator): void {
    const { nodes, ends } = this.getPaintOrder();
    const list = this.visitList;
    const positions = this.visitPositions;
    list.length = 0;
    positions.length = 0;
    const stamp = this.stamp;
    const owner = this.owner;
    const visitAll = this.visitAll;
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      if (node !== owner && !visitAll && node.preparedStamp !== stamp && !node.publishedVisible) {
        if (!node.childrenWalkAllowed) i = ends[i] - 1;
        continue;
      }
      list.push(node);
      positions.push(i);
    }
    for (let k = 0; k < list.length; k++) {
      const node = list[k];
      // Painting can remove a node; nodes it adds are painted from the next frame.
      if (node !== owner && node.scope !== this) continue;
      if (node.preparedStamp !== stamp) {
        // A component applies its own pending work inside iterate(); other nodes prepare here.
        if (node.preparesOnIterate) node.preparedStamp = stamp;
        else this.prepareLate(node);
      }
      node.cullingStamp = stamp;
      let allowed = iterator(node);
      if (allowed && !node.childrenWalkAllowed) {
        // A component's own update can resume its children; another node's preparation suppressed them.
        if (node.preparesOnIterate) node.setChildrenWalkAllowed(true);
        else allowed = false;
      }
      if (!allowed) {
        // A paint-time veto of a node that does not prepare itself is decided again by its next preparation,
        // before the next publication.
        if (node.childrenWalkAllowed && !node.preparesOnIterate) this.markPending(node);
        node.setChildrenWalkAllowed(false);
        const end = ends[positions[k]];
        while (k + 1 < list.length && positions[k + 1] < end) k++;
      }
    }
  }

  /** Node whose update hooks run inside painting; it reads live visibility like any update hook. */
  public preparingNode?: Tree;

  /** Prepares a clean node that does not prepare itself, right before its own paint. */
  private prepareLate(node: Tree): void {
    const revision = this.revision;
    this.preparingNode = node;
    try {
      this.prepareNode(node);
    } finally {
      this.preparingNode = undefined;
    }
    // New bounds decide this node's own paint gate.
    if (revision !== this.revision) this.show(node, node.isEligible(this) && this.intersects(node, this.frameViewport));
  }

  /** A parent can suppress children while painting; finish their already prepared lifecycles. */
  private finishPrepared(iterator: TIterator): void {
    for (const node of this.prepared) {
      if (node.cullingStamp === this.stamp || !node.data.prepareUpdate || node.scope !== this) continue;
      this.show(node, false);
      node.cullingStamp = this.stamp;
      if (!iterator(node)) node.setChildrenWalkAllowed(false);
    }
  }

  public add(node: Tree): void {
    if (node === this.owner || this.nodes.has(node)) return;
    this.nodes.add(node);
    this.fresh.add(node);
    this.requests++;
    this.update(node);
    this.invalidateStructure();
  }

  public invalidateStructure(): void {
    this.structureRevision++;
    this.revision++;
  }

  public update(node: Tree): void {
    if (!this.nodes.has(node)) return;
    this.boundsDirty.add(node);
    this.index.set(node, node.boundsMinX, node.boundsMinY, node.boundsMaxX, node.boundsMaxY);
    this.revision++;
  }

  public delete(node: Tree): void {
    this.paintOrder = undefined;
    this.index.delete(node);
    this.nodes.delete(node);
    this.pending.delete(node);
    this.fresh.delete(node);
    this.active.delete(node);
    this.boundsDirty.delete(node);
    node.activeInViewport = false;
    this.invalidateStructure();
  }

  public markPending(node: Tree): void {
    this.pending.add(node);
    this.requests++;
  }

  public isSkipped(node: Tree, token: unknown): boolean {
    return this.didCull && this.walkToken === token && this.nodes.has(node) && node.cullingStamp !== this.stamp;
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

  /** Marks and returns every node whose bounds intersect the viewport. */
  public select(viewport: TTileRect | undefined, linear = false): Tree[] {
    const selected: Tree[] = [];
    const stamp = (this.selectionStamp = ++TreeCulling.selectionStamp);
    const limit = this.nodes.size * (this.options.fullWalkShare ?? 0.75);
    if (linear || !viewport || this.index.covers(viewport) || this.index.countCandidates(viewport, limit) > limit) {
      for (const node of this.nodes) {
        if (this.intersects(node, viewport)) {
          node.selectedStamp = stamp;
          selected.push(node);
        }
      }
    } else {
      this.index.query(viewport, (node) => {
        node.selectedStamp = stamp;
        selected.push(node);
      });
    }
    return selected;
  }
}
