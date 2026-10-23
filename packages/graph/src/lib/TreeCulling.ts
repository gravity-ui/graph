import { TTileRect, TileIndex } from "./TileIndex";
import type { Tree } from "./Tree";

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

/** One spatial index and update queue for every descendant of a configured Tree root. */
export class TreeCulling {
  public readonly index: TileIndex<Tree>;

  public readonly nodes = new Set<Tree>();

  public readonly pending = new Set<Tree>();

  public readonly fresh = new Set<Tree>();

  public readonly active = new Set<Tree>();

  public revision = 0;

  public stamp = 0;

  public walking = false;

  public fullVisibilityRevision = -1;

  public fullPreparation?: { revision: number; nodes: Tree[] };

  public fullPaint?: { revision: number; nodes: Tree[]; subtreeEnds: number[] };

  public walkToken: unknown;

  public didCull = false;

  constructor(
    public readonly owner: Tree,
    public readonly options: TTreeCullingOptions
  ) {
    this.index = new TileIndex({ tileSize: options.tileSize });
  }

  public add(node: Tree): void {
    if (node === this.owner || this.nodes.has(node)) return;
    this.nodes.add(node);
    this.fresh.add(node);
    this.update(node);
  }

  public update(node: Tree): void {
    if (!this.nodes.has(node)) return;
    this.index.set(node, node.boundsMinX, node.boundsMinY, node.boundsMaxX, node.boundsMaxY);
    this.revision++;
  }

  public delete(node: Tree): void {
    this.fullPreparation = undefined;
    this.fullPaint = undefined;
    this.index.delete(node);
    this.nodes.delete(node);
    this.pending.delete(node);
    this.fresh.delete(node);
    this.active.delete(node);
    this.revision++;
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
    const limit = this.nodes.size * (this.options.fullWalkShare ?? 0.75);
    if (!viewport || this.index.covers(viewport) || this.index.countCandidates(viewport, limit) > limit) {
      for (const node of this.nodes) {
        if (this.intersects(node, viewport)) selected.push(node);
      }
    } else {
      this.index.query(viewport, (node) => selected.push(node));
    }
    return selected;
  }
}
