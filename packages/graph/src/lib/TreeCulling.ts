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
  /** Candidate share above which a linear bounds check is cheaper than a tile query. @default 0.75 */
  fullWalkShare?: number;
};

/** Owns preparation, viewport selection and painting for one configured Tree root. */
export class TreeCulling {
  // Moving between scopes must not repeat a node's lifecycle in the same traversal.
  private static walkStamp = 0;
  private static selectionStamp = 0;

  public readonly index: TileIndex<Tree>;

  public readonly nodes = new Set<Tree>();

  private readonly pending = new Set<Tree>();

  private readonly fresh = new Set<Tree>();

  private readonly active = new Set<Tree>();

  private revision = 0;

  /** Membership, local order and traversal permission; bounds do not change these. */
  public structureRevision = 0;

  public stamp = 0;

  public walking = false;

  public painting = false;

  public fullVisibilityRevision = -1;

  /** Ancestry revision used by the published visibility snapshot. */
  public visibilityRevision = -1;

  public fullPreparation?: { revision: number; nodes: Tree[] };

  private densePreparation?: { revision: number; nodes: Tree[]; parents: number[] };

  private selectionStamp = 0;

  private selectionRevision = -1;

  private selectionViewport?: TTileRect;

  public fullPaint?: { revision: number; nodes: Tree[]; subtreeEnds: number[] };

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
    this.selectionRevision = -1;
    // An ancestor outside this scope can change its traversal permission independently.
    if (this.owner.parent) this.invalidateStructure();
    try {
      this.prepareAndWalk(iterator);
    } finally {
      this.walking = wasWalking;
      this.painting = wasPainting;
    }
  }

  private prepareAndWalk(iterator: TIterator): void {
    let prepared: Tree[] = [];
    const prepareNode = (node: Tree): void => {
      prepared.push(node);
      this.prepareNode(node);
    };
    const prepare = (node: Tree): void => {
      if (node.preparedStamp === this.stamp || node.scope !== this) return;
      if (node !== this.owner) {
        const parent = node.parent;
        if (!parent || !parent.children.has(node)) return;
        if (parent.preparedStamp !== this.stamp) prepare(parent);
        if (parent.preparedStamp !== this.stamp || !parent.childrenWalkAllowed || node.scope !== this) return;
      }
      prepareNode(node);
    };
    prepare(this.owner);
    const viewport = this.options.getViewport();
    this.didCull = Boolean(viewport && (this.options.isEnabled?.() ?? true));
    this.walkToken = this.options.getWalkToken?.();
    const fullWalk = !this.didCull || !viewport || this.index.covers(viewport);
    const preparationRevision = this.structureRevision;
    if (fullWalk) prepared = this.prepareFull(prepared);
    let revision: number;
    do {
      revision = this.revision;
      if (!fullWalk) {
        const candidates = this.select(this.didCull ? viewport : undefined);
        if (
          candidates.length <= this.nodes.size * (this.options.fullWalkShare ?? 0.75) ||
          !this.prepareDense(prepared)
        ) {
          for (const node of candidates) prepare(node);
        }
      }
      for (const node of this.fresh) prepare(node);
      for (const node of this.pending) prepare(node);
      // Reconciliation and geometry updates can expose additional nodes in this same frame.
    } while (revision !== this.revision);
    if (fullWalk) {
      this.fullPreparation =
        preparationRevision === this.structureRevision
          ? { revision: this.structureRevision, nodes: prepared }
          : undefined;
    }

    this.publishVisibility(prepared, viewport);
    this.painting = true;
    this.walkPrepared(iterator, prepared, fullWalk);
  }

  private prepareDense(prepared: Tree[]): boolean {
    let ordered = this.densePreparation;
    if (ordered?.revision !== this.structureRevision) {
      // Preserve partial selection's registration order, including children attached later.
      const nodes = [this.owner, ...this.nodes];
      const positions = new Map(nodes.map((node, index) => [node, index]));
      const parents = nodes.map((node) => (node.parent ? positions.get(node.parent) ?? -1 : -1));
      this.densePreparation = ordered = { revision: this.structureRevision, nodes, parents };
    }
    const { nodes, parents } = ordered;
    const branch: number[] = [];
    for (let i = 1; i < nodes.length; i++) {
      const node = nodes[i];
      if (node.preparedStamp === this.stamp || node.selectedStamp !== this.selectionStamp) continue;
      // Include an offscreen ancestor only when its selected descendant first needs it.
      let index = i;
      while (index > 0 && nodes[index].preparedStamp !== this.stamp) {
        branch.push(index);
        index = parents[index];
      }
      while (branch.length) {
        const next = branch.pop();
        if (next === undefined) break;
        const parent = nodes[parents[next]];
        if (!parent || parent.preparedStamp !== this.stamp || !parent.childrenWalkAllowed) {
          branch.length = 0;
          break;
        }
        prepared.push(nodes[next]);
        this.prepareNode(nodes[next]);
        // Custom preparation may reconcile, reparent or suppress a branch.
        if (ordered.revision !== this.structureRevision) return false;
      }
    }
    return true;
  }

  private prepareFull(prepared: Tree[]): Tree[] {
    const cached = this.fullPreparation;
    if (cached?.revision === this.structureRevision) {
      prepared = cached.nodes;
      for (let i = 1; i < cached.nodes.length; i++) {
        this.prepareNode(cached.nodes[i]);
        if (cached.revision !== this.structureRevision) {
          prepared = cached.nodes.slice(0, i + 1);
          break;
        }
      }
    }
    const prepareBranch = (node: Tree): void => {
      if (node.scope !== this) return;
      if (node.preparedStamp !== this.stamp) {
        prepared.push(node);
        this.prepareNode(node);
      }
      if (!node.childrenWalkAllowed || !node.children.size) return;
      for (const child of node.getChildrenArray()) {
        if (child.parent === node) prepareBranch(child);
      }
    };
    if (cached?.revision !== this.structureRevision) prepareBranch(this.owner);
    return prepared;
  }

  private publishVisibility(prepared: Tree[], viewport: TTileRect | undefined): void {
    const visibilityRevision = this.structureRevision;
    const publishedRevision = this.visibilityRevision;
    this.visibilityRevision = -1;
    // Publish hidden state for new descendants whose preparation an ancestor blocked.
    for (const node of this.fresh) node.setVisible(false);
    const fullyVisible = (!viewport || this.index.covers(viewport)) && this.owner.isTraversalAllowed();
    this.owner.setVisible(this.owner.isEligible(this) && this.intersects(this.owner, viewport));
    // Camera movement cannot change visibility while it still contains the unchanged tree.
    if (!fullyVisible || this.fullVisibilityRevision !== this.structureRevision) {
      this.fullVisibilityRevision = -1;
      const active = this.active;
      for (const node of active) {
        if (node.preparedStamp !== this.stamp) {
          active.delete(node);
          node.activeInViewport = false;
          node.setVisible(false);
        }
      }
      let reuseSelection = this.isSelectionCurrent(viewport);
      const reusePublished = publishedRevision === this.structureRevision;
      for (const node of prepared) {
        // A valid prior snapshot already published this membership and its ancestor permissions.
        if (
          node !== this.owner &&
          reusePublished &&
          reuseSelection &&
          node.activeInViewport === (node.selectedStamp === this.selectionStamp)
        )
          continue;
        const visible =
          node.isEligible(this) &&
          (node !== this.owner && reuseSelection && this.selectionRevision === this.revision
            ? node.selectedStamp === this.selectionStamp
            : this.intersects(node, viewport));
        if (node.setVisible(visible) && reuseSelection) reuseSelection = this.isSelectionCurrent(viewport);
        if (node !== this.owner && node.scope === this && node.activeInViewport !== visible) {
          node.activeInViewport = visible;
          if (visible) active.add(node);
          else active.delete(node);
        }
      }
      if (fullyVisible && this.structureRevision === visibilityRevision)
        this.fullVisibilityRevision = visibilityRevision;
    }
    if (this.structureRevision === visibilityRevision) this.visibilityRevision = visibilityRevision;
  }

  private isSelectionCurrent(viewport: TTileRect | undefined): boolean {
    const selectedViewport = this.selectionViewport;
    return (
      this.selectionRevision === this.revision &&
      (!viewport
        ? !selectedViewport
        : Boolean(
            selectedViewport &&
              viewport.minX === selectedViewport.minX &&
              viewport.minY === selectedViewport.minY &&
              viewport.maxX === selectedViewport.maxX &&
              viewport.maxY === selectedViewport.maxY
          ))
    );
  }

  private prepareNode(node: Tree): void {
    if (this.pending.size) this.pending.delete(node);
    if (this.fresh.size) this.fresh.delete(node);
    node.prepareData(this.stamp);
  }

  private walkPrepared(iterator: TIterator, prepared: Tree[], fullWalk: boolean): void {
    let walked: number;
    if (fullWalk || prepared.length > this.nodes.size * (this.options.fullWalkShare ?? 0.75)) {
      walked = this.paintFull(iterator);
    } else {
      const children = new Map<Tree, Tree[]>();
      for (const node of prepared) {
        if (node === this.owner || !node.isEligible(this)) continue;
        const parent = node.parent;
        if (!parent) continue;
        let selected = children.get(parent);
        if (!selected) {
          parent.getOrderedChildren();
          children.set(parent, (selected = []));
        }
        selected.push(node);
      }
      for (const selected of children.values()) selected.sort((a, b) => a.renderOrder - b.renderOrder);
      walked = this.paintPrepared(this.owner, iterator, children);
    }
    if (walked === prepared.length) return;
    // A parent can suppress children while painting; finish their already prepared lifecycles.
    for (const node of prepared) {
      if (node.cullingStamp === this.stamp || !node.data.prepareUpdate || node.scope !== this) continue;
      this.active.delete(node);
      node.activeInViewport = false;
      node.setVisible(false);
      node.cullingStamp = this.stamp;
      const allowed = iterator(node);
      if (!allowed) node.setChildrenWalkAllowed(false);
    }
  }

  private paintFull(iterator: TIterator): number {
    let ordered = this.fullPaint;
    if (ordered?.revision !== this.structureRevision) {
      const nodes: Tree[] = [];
      const subtreeEnds: number[] = [];
      const collect = (node: Tree): void => {
        if (node !== this.owner && !node.isEligible(this)) return;
        const index = nodes.length;
        nodes.push(node);
        subtreeEnds.push(0);
        if (node.childrenWalkAllowed && node.children.size) {
          for (const child of node.getOrderedChildren()) {
            if (child.parent === node) collect(child);
          }
        }
        subtreeEnds[index] = nodes.length;
      };
      collect(this.owner);
      this.fullPaint = ordered = { revision: this.structureRevision, nodes, subtreeEnds };
    }
    let walked = 0;
    for (let i = 0; i < ordered.nodes.length; i++) {
      const node = ordered.nodes[i];
      if (
        node.preparedStamp !== this.stamp ||
        (this.structureRevision !== ordered.revision &&
          node !== this.owner &&
          (node.cullingStamp === this.stamp || !node.isEligible(this)))
      ) {
        i = ordered.subtreeEnds[i] - 1;
        continue;
      }
      node.cullingStamp = this.stamp;
      const allowed = iterator(node);
      if (!allowed) {
        node.setChildrenWalkAllowed(false);
        i = ordered.subtreeEnds[i] - 1;
      }
      walked++;
    }
    return walked;
  }

  private paintPrepared(node: Tree, iterator: TIterator, children: Map<Tree, Tree[]>): number {
    node.cullingStamp = this.stamp;
    const allowed = iterator(node);
    if (!allowed) node.setChildrenWalkAllowed(false);
    let walked = 1;
    if (node.childrenWalkAllowed && node.children.size) {
      const selected = children.get(node) ?? [];
      for (const child of selected) {
        if (
          child.preparedStamp === this.stamp &&
          child.cullingStamp !== this.stamp &&
          child.scope === this &&
          child.parent === node &&
          child.isTraversalAllowed()
        ) {
          walked += this.paintPrepared(child, iterator, children);
        }
      }
    }
    return walked;
  }

  public add(node: Tree): void {
    if (node === this.owner || this.nodes.has(node)) return;
    this.nodes.add(node);
    this.fresh.add(node);
    this.update(node);
    this.invalidateStructure();
  }

  public invalidateStructure(): void {
    this.structureRevision++;
    this.revision++;
  }

  public update(node: Tree): void {
    if (!this.nodes.has(node)) return;
    this.index.set(node, node.boundsMinX, node.boundsMinY, node.boundsMaxX, node.boundsMaxY);
    this.revision++;
  }

  public delete(node: Tree): void {
    this.fullPreparation = undefined;
    this.densePreparation = undefined;
    this.fullPaint = undefined;
    this.index.delete(node);
    this.nodes.delete(node);
    this.pending.delete(node);
    this.fresh.delete(node);
    this.active.delete(node);
    node.activeInViewport = false;
    this.invalidateStructure();
  }

  public markPending(node: Tree): void {
    this.pending.add(node);
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

  public select(viewport: TTileRect | undefined): Tree[] {
    const selected: Tree[] = [];
    const stamp = (this.selectionStamp = ++TreeCulling.selectionStamp);
    const limit = this.nodes.size * (this.options.fullWalkShare ?? 0.75);
    if (!viewport || this.index.covers(viewport) || this.index.countCandidates(viewport, limit) > limit) {
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
    this.selectionViewport = viewport && { ...viewport };
    this.selectionRevision = this.revision;
    return selected;
  }
}
