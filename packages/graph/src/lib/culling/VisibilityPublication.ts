import type { Tree } from "../Tree";

import { TTileRect, TileIndex } from "./TileIndex";
import type { TreeCulling } from "./TreeCulling";

/** Whether a node's own bounds intersect the viewport; unknown bounds and a missing viewport always do. */
export function intersects(node: Tree, viewport: TTileRect | undefined): boolean {
  return (
    !viewport ||
    Number.isNaN(node.boundsMinX) ||
    (node.boundsMinX <= viewport.maxX &&
      node.boundsMaxX >= viewport.minX &&
      node.boundsMinY <= viewport.maxY &&
      node.boundsMaxY >= viewport.minY)
  );
}

function sameRect(a: TTileRect, b: TTileRect): boolean {
  return a.minX === b.minX && a.minY === b.minY && a.maxX === b.maxX && a.maxY === b.maxY;
}

/**
 * Publishes which nodes of a scope are in its viewport. Visibility is kept between frames: a camera move rechecks only
 * nodes in the parts of the old and new viewports outside each other, plus nodes with new bounds; a structural change
 * runs one complete selection, through tiles or a scan for dense views. Only publication writes `Tree.published`,
 * except unregistering, which clears it.
 */
export class VisibilityPublication {
  // Stamps are global: a node that moves to another scope must not match stamps of the new one.
  private static selectionStamp = 0;

  public readonly index: TileIndex<Tree>;

  /** @internal Nodes published as visible, at `Tree.visibleSlot`. */
  public readonly visibleNodes: Tree[] = [];

  /** Viewport of the latest publication, a stable copy; undefined when every node is visible. */
  public frameViewport?: TTileRect;

  /** Observing nodes whose published visibility changed since the last notification. */
  private readonly viewportChanges: Tree[] = [];

  /** Viewport and structure of the last exact publication: the base of the next incremental one. */
  private selectionBase?: TTileRect & { structure: number };

  /** Structure revision of the last publication that made every eligible node visible. */
  private allVisibleRevision = -1;

  constructor(private readonly scope: TreeCulling) {
    this.index = new TileIndex({ tileSize: scope.options.tileSize });
  }

  /** Publishes this frame's visibility; `eligible` is the stamp of the current paint order. */
  public publish(eligible: number): void {
    const scope = this.scope;
    // Bounds can change several times per frame, for example while components mount; index them once.
    const dirty = scope.boundsDirty;
    for (let i = 0; i < dirty.length; i++) {
      const node = dirty[i];
      if (node) this.index.set(node, node.boundsMinX, node.boundsMinY, node.boundsMaxX, node.boundsMaxY);
    }
    // Viewport sources may reuse one object; publication works on a stable copy.
    const source = scope.options.getViewport();
    const viewport = source && { ...source };
    this.frameViewport = viewport;
    // New descendants whose preparation an ancestor blocked stay hidden.
    const fresh = scope.fresh;
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
    const owner = scope.owner;
    owner.published = owner.isEligible(scope) && intersects(owner, viewport);
  }

  /**
   * Tells observing nodes about their new membership, once per change. A node that changed back within the frame,
   * or left the scope, is not notified. Handlers run after publication: updates they request apply in a later frame.
   */
  public notifyViewportChanges(): void {
    const changes = this.viewportChanges;
    if (!changes.length) return;
    for (let i = 0; i < changes.length; i++) {
      const node = changes[i];
      const inViewport = node.published;
      if (node.scope !== this.scope || node.notifiedInViewport === inViewport) continue;
      node.notifiedInViewport = inViewport;
      node.data.viewportChanged?.(inViewport);
    }
    changes.length = 0;
  }

  /** Starts tracking a node that joined the scope. */
  public observe(node: Tree): void {
    node.observesViewport = typeof node.data.viewportChanged === "function";
    // A node moved here from another scope keeps the membership it was last told; the next publication is compared
    // with it, so a change is delivered once and an unchanged one not at all.
    if (node.observesViewport) this.viewportChanges.push(node);
  }

  /** Drops a node that left the scope from the index and the visible list, without notifying it. */
  public forget(node: Tree): void {
    this.index.delete(node);
    this.unlist(node);
  }

  private show(node: Tree, visible: boolean): void {
    if (node.published === visible) return;
    if (visible) {
      node.published = true;
      node.visibleSlot = this.visibleNodes.length;
      this.visibleNodes.push(node);
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
    const list = this.visibleNodes;
    const last = list.pop() as Tree;
    if (last !== node) {
      list[slot] = last;
      last.visibleSlot = slot;
    }
    node.visibleSlot = -1;
  }

  /**
   * The viewport contains every indexed node: eligibility alone decides visibility. `eligible` is the
   * stamp of the current paint order, which lists exactly the eligible nodes.
   */
  private publishAll(eligible: number): void {
    this.selectionBase = undefined;
    if (this.allVisibleRevision === this.scope.structureRevision) return;
    const nodes = this.scope.nodes;
    for (let i = 0; i < nodes.length; i++) this.show(nodes[i], nodes[i].orderStamp === eligible);
    this.allVisibleRevision = this.scope.structureRevision;
  }

  /** Publishes a complete selection by checking every node: for dense views. */
  private publishScan(viewport: TTileRect, eligible: number): void {
    this.allVisibleRevision = -1;
    const nodes = this.scope.nodes;
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      this.show(node, node.orderStamp === eligible && intersects(node, viewport));
    }
    this.selectionBase = { ...viewport, structure: this.scope.structureRevision };
  }

  /** Publishes a complete selection through the tiles, or by a scan when most nodes are candidates. */
  private publishSelection(viewport: TTileRect, eligible: number): void {
    const scope = this.scope;
    const limit = scope.nodes.length * (scope.options.fullWalkShare ?? 0.75);
    if (this.index.countCandidates(viewport, limit) > limit) {
      this.publishScan(viewport, eligible);
      return;
    }
    this.allVisibleRevision = -1;
    const stamp = ++VisibilityPublication.selectionStamp;
    this.index.query(viewport, (node) => {
      node.selectedStamp = stamp;
      if (node.scope === scope) this.show(node, node.orderStamp === eligible);
    });
    // Hiding moves the last entry into the freed slot, so the list is read from the end.
    const visible = this.visibleNodes;
    for (let i = visible.length - 1; i >= 0; i--) {
      const node = visible[i];
      if (node.selectedStamp !== stamp) this.show(node, false);
    }
    this.selectionBase = { ...viewport, structure: scope.structureRevision };
  }

  /**
   * Republishes only nodes that can change visibility since the last exact publication: nodes in the
   * parts of the old and new viewports outside each other, and nodes with new bounds.
   */
  private publishDelta(viewport: TTileRect, eligible: number): boolean {
    const scope = this.scope;
    const base = this.selectionBase;
    if (!base || base.structure !== scope.structureRevision) return false;
    const check = (node: Tree): void => {
      if (node.scope === scope) this.show(node, node.orderStamp === eligible && intersects(node, viewport));
    };
    if (!sameRect(base, viewport)) {
      this.queryOutside(viewport, base, check);
      this.queryOutside(base, viewport, check);
      base.minX = viewport.minX;
      base.minY = viewport.minY;
      base.maxX = viewport.maxX;
      base.maxY = viewport.maxY;
    }
    const dirty = scope.boundsDirty;
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
}
