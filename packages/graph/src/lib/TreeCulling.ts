import { TTileRect, TileIndex } from "./TileIndex";
import type { Tree } from "./Tree";

export type TTreeCullingOptions = {
  /** Edge of a visibility tile in world units. */
  tileSize: number;
  /**
   * World rect whose children are walked in the current traversal. Called once per traversal of
   * the owner; `undefined` walks every child, as a tree without culling does.
   */
  getViewport: () => TTileRect | undefined;
  /** Identifies the current traversal, see {@link Tree.isSkippedByCulling}. */
  getWalkToken?: () => unknown;
  /**
   * When the index buckets around the viewport hold more entries than this share of the
   * children, every child is walked: a full walk is then cheaper than querying and ordering.
   *
   * @default 0.75
   */
  fullWalkShare?: number;
};

function byRenderOrder(a: Tree, b: Tree): number {
  return a.renderOrder - b.renderOrder;
}

/**
 * Chooses which children of a tree node are walked in a traversal.
 *
 * A child is walked when its bounds intersect the viewport, when it asked for an update
 * ({@link markPending}), when it was appended since the last traversal, or when it was in the
 * viewport during the previous traversal (so it can notice that it left it). Every other child
 * was already out of view in its last walk and has nothing to process, so skipping it changes
 * nothing. The walk keeps the order of a full walk: zIndex groups, then position in the group.
 */
export class TreeCulling {
  public readonly index: TileIndex<Tree>;

  /** Token of the last traversal that walked the owner's children. */
  public walkToken: unknown = undefined;

  private pending = new Set<Tree>();

  private fresh: Tree[] = [];

  /** Children in the viewport during the last traversal, or every child after a full walk. */
  private active: readonly Tree[] = [];

  private stamp = 0;

  constructor(
    private readonly owner: Tree,
    private readonly options: TTreeCullingOptions
  ) {
    this.index = new TileIndex({ tileSize: options.tileSize });
  }

  /** Indexes a newly appended child; it is walked in the next traversal. */
  public add(node: Tree): void {
    if (this.index.has(node)) return;
    this.index.set(node, node.boundsMinX, node.boundsMinY, node.boundsMaxX, node.boundsMaxY);
    this.fresh.push(node);
  }

  /** Moves an indexed child to its current bounds. */
  public update(node: Tree): void {
    if (!this.index.has(node)) return;
    this.index.set(node, node.boundsMinX, node.boundsMinY, node.boundsMaxX, node.boundsMaxY);
  }

  public delete(node: Tree): void {
    this.index.delete(node);
    this.pending.delete(node);
  }

  /** Walks the child in the next traversal regardless of its bounds. */
  public markPending(node: Tree): void {
    this.pending.add(node);
  }

  /**
   * Returns the children to walk in draw order, or `undefined` when every child should be walked.
   * `ordered` is the full draw order; each child's `renderOrder` is its index in it.
   */
  public select(ordered: readonly Tree[]): readonly Tree[] | undefined {
    this.walkToken = this.options.getWalkToken?.();
    const viewport = this.options.getViewport();
    // Requests made while the children are walked belong to the next traversal.
    const pending = this.pending;
    const fresh = this.fresh;
    if (pending.size) this.pending = new Set();
    if (fresh.length) this.fresh = [];

    const limit = ordered.length * (this.options.fullWalkShare ?? 0.75);
    if (!viewport || this.index.covers(viewport) || this.index.countCandidates(viewport, limit) > limit) {
      this.active = ordered;
      return undefined;
    }

    const owner = this.owner;
    const stamp = ++this.stamp;
    const selected: Tree[] = [];
    const nextActive: Tree[] = [];
    // Pending, new and previously active nodes may have been removed since; the index holds
    // only current children.
    const take = (node: Tree): boolean => {
      if (node.cullingStamp === stamp || node.parent !== owner || !owner.children.has(node)) return false;
      node.cullingStamp = stamp;
      selected.push(node);
      return true;
    };

    this.index.query(viewport, (node) => {
      if (node.cullingStamp === stamp) return;
      node.cullingStamp = stamp;
      selected.push(node);
      nextActive.push(node);
    });
    // A new child renders on its first iterate wherever it is; walking it once more lets it
    // see that it is out of view.
    for (let i = 0; i < fresh.length; i++) {
      if (take(fresh[i])) nextActive.push(fresh[i]);
    }
    pending.forEach(take);
    // Children that were in view: one more walk lets them notice that they left it.
    const previous = this.active;
    for (let i = 0; i < previous.length; i++) {
      take(previous[i]);
    }
    this.active = nextActive;

    if (selected.length * Math.log2(selected.length + 1) < ordered.length) {
      return selected.sort(byRenderOrder);
    }
    return ordered.filter((node) => node.cullingStamp === stamp);
  }
}
