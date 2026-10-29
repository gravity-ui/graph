/** World-space axis-aligned rectangle given by its edges (inclusive). */
export type TTileRect = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

export type TTileIndexOptions = {
  /** Edge of a square tile in world units. */
  tileSize: number;
  /**
   * Items spanning at most this many tiles in both directions are stored in the tile of their
   * top-left corner. Larger items go to a column or row (see `maxStripSpan`) or, if they are
   * large in both directions, to a list that every query checks.
   *
   * @default 2
   */
  maxCellSpan?: number;
  /**
   * A tall item spanning at most this many columns is stored in the column of its left edge;
   * a wide item spanning at most this many rows is stored in the row of its top edge.
   *
   * @default 4
   */
  maxStripSpan?: number;
};

enum EBucket {
  Unbounded,
  Cells,
  Columns,
  Rows,
  Large,
}

type TRecord<T> = TTileRect & {
  item: T;
  bucket: EBucket;
  /** Key of the bucket list in its map (unused for the large and unbounded lists). */
  key: number;
  /** Position in the bucket list, for constant-time removal. */
  slot: number;
};

type TBuckets<T> = Map<number, TRecord<T>[]>;

/**
 * Tile coordinates are clamped to [-TILE_OFFSET, TILE_OFFSET) so cell keys stay small integers
 * (fast Map keys). Items beyond that range share the border tiles, which stays correct.
 */
const TILE_OFFSET = 2 ** 14;
const TILE_STRIDE = 2 ** 15;

function cellKey(tx: number, ty: number): number {
  return (tx + TILE_OFFSET) * TILE_STRIDE + (ty + TILE_OFFSET);
}

function cellX(key: number): number {
  return Math.floor(key / TILE_STRIDE) - TILE_OFFSET;
}

function cellY(key: number): number {
  return (key % TILE_STRIDE) - TILE_OFFSET;
}

function intersects(record: TTileRect, rect: TTileRect): boolean {
  return record.minX <= rect.maxX && record.maxX >= rect.minX && record.minY <= rect.maxY && record.maxY >= rect.minY;
}

function pushTo<T>(list: TRecord<T>[], record: TRecord<T>): void {
  record.slot = list.length;
  list.push(record);
}

/** Swap-remove: the last record takes the freed slot. */
function removeAt<T>(list: TRecord<T>[], record: TRecord<T>): void {
  const last = list.pop();
  if (last && last !== record) {
    list[record.slot] = last;
    last.slot = record.slot;
  }
}

/**
 * Sparse world-space grid used as a visibility index.
 *
 * Every item lives in exactly one bucket, so moving it is a constant-time bucket change and a
 * query reports it at most once. Small items are stored in the tile of their top-left corner and
 * queries widen their tile range to catch items reaching in from the left and top. Long thin items
 * (typical for connections) are stored per column or per row in the same way, and items large in
 * both directions are kept in a list that every query checks.
 */
export class TileIndex<T> {
  public readonly tileSize: number;

  private readonly maxCellSpan: number;

  private readonly maxStripSpan: number;

  private readonly records = new Map<T, TRecord<T>>();

  private readonly cells: TBuckets<T> = new Map();

  private readonly columns: TBuckets<T> = new Map();

  private readonly rows: TBuckets<T> = new Map();

  private readonly large: TRecord<T>[] = [];

  private readonly unbounded: TRecord<T>[] = [];

  /** Union of every bounds ever stored. It never shrinks, so it is a safe outer bound. */
  private readonly extent: TTileRect = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };

  constructor({ tileSize, maxCellSpan = 2, maxStripSpan = 4 }: TTileIndexOptions) {
    if (!(tileSize > 0)) {
      throw new Error(`TileIndex tile size must be positive, got ${tileSize}`);
    }
    this.tileSize = tileSize;
    this.maxCellSpan = Math.max(1, maxCellSpan);
    this.maxStripSpan = Math.max(this.maxCellSpan, maxStripSpan);
  }

  public get size(): number {
    return this.records.size;
  }

  public has(item: T): boolean {
    return this.records.has(item);
  }

  /** Stores or moves an item. Non-finite or inverted bounds make the item match every query. */
  public set(item: T, minX: number, minY: number, maxX: number, maxY: number): void {
    let bucket: EBucket;
    let key = 0;
    if (!Number.isFinite(minX + minY + maxX + maxY) || maxX < minX || maxY < minY) {
      bucket = EBucket.Unbounded;
    } else {
      const tx0 = this.toTile(minX);
      const ty0 = this.toTile(minY);
      const spanX = this.toTile(maxX) - tx0 + 1;
      const spanY = this.toTile(maxY) - ty0 + 1;
      if (spanX <= this.maxCellSpan && spanY <= this.maxCellSpan) {
        bucket = EBucket.Cells;
        key = cellKey(tx0, ty0);
      } else if (spanX <= this.maxStripSpan) {
        bucket = EBucket.Columns;
        key = tx0;
      } else if (spanY <= this.maxStripSpan) {
        bucket = EBucket.Rows;
        key = ty0;
      } else {
        bucket = EBucket.Large;
      }
    }

    let record = this.records.get(item);
    if (!record) {
      record = { item, minX, minY, maxX, maxY, bucket, key, slot: 0 };
      this.records.set(item, record);
      this.link(record);
    } else if (record.bucket !== bucket || record.key !== key) {
      this.unlink(record);
      record.bucket = bucket;
      record.key = key;
      this.link(record);
    }
    record.minX = minX;
    record.minY = minY;
    record.maxX = maxX;
    record.maxY = maxY;
    if (bucket !== EBucket.Unbounded) this.growExtent(record);
  }

  public delete(item: T): boolean {
    const record = this.records.get(item);
    if (!record) return false;
    this.unlink(record);
    this.records.delete(item);
    return true;
  }

  public clear(): void {
    this.records.clear();
    this.cells.clear();
    this.columns.clear();
    this.rows.clear();
    this.large.length = 0;
    this.unbounded.length = 0;
    this.extent.minX = Infinity;
    this.extent.minY = Infinity;
    this.extent.maxX = -Infinity;
    this.extent.maxY = -Infinity;
  }

  /** Whether the rect contains every stored item (items without bounds aside). */
  public covers(rect: TTileRect): boolean {
    const extent = this.extent;
    return rect.minX <= extent.minX && rect.minY <= extent.minY && rect.maxX >= extent.maxX && rect.maxY >= extent.maxY;
  }

  /**
   * Counts the items a query of the rect would test, stopping once the count exceeds `limit`.
   * It is an upper bound of the query result and a measure of its cost.
   */
  public countCandidates(rect: TTileRect, limit: number): number {
    let count = this.unbounded.length;
    const visit = (list: TRecord<T>[]): boolean => {
      count += list.length;
      return count > limit;
    };
    if (count > limit) return count;
    this.scan(rect, visit);
    return count;
  }

  /**
   * Calls `visit` once for every item whose bounds intersect the rect (edges inclusive) and for
   * every item without bounds.
   */
  public query(rect: TTileRect, visit: (item: T) => void): void {
    const unbounded = this.unbounded;
    for (let i = 0; i < unbounded.length; i++) visit(unbounded[i].item);
    this.scan(rect, (list) => {
      for (let i = 0; i < list.length; i++) {
        const record = list[i];
        if (intersects(record, rect)) visit(record.item);
      }
      return false;
    });
  }

  /** Calls `visit` with every bucket list a query of the rect has to test; stops when it returns true. */
  private scan(rect: TTileRect, visit: (list: TRecord<T>[]) => boolean): void {
    if (this.large.length && visit(this.large)) return;

    const tx0 = this.toTile(rect.minX);
    const ty0 = this.toTile(rect.minY);
    const tx1 = this.toTile(rect.maxX);
    const ty1 = this.toTile(rect.maxY);

    // Items are stored at their top-left tile, so items starting up to span - 1 tiles to the left
    // or above can still reach into the rect.
    const cellReach = this.maxCellSpan - 1;
    if (this.scanCells(tx0 - cellReach, ty0 - cellReach, tx1, ty1, visit)) return;
    const stripReach = this.maxStripSpan - 1;
    if (this.scanStrips(this.columns, tx0 - stripReach, tx1, visit)) return;
    this.scanStrips(this.rows, ty0 - stripReach, ty1, visit);
  }

  private scanCells(
    tx0: number,
    ty0: number,
    tx1: number,
    ty1: number,
    visit: (list: TRecord<T>[]) => boolean
  ): boolean {
    const cells = this.cells;
    if ((tx1 - tx0 + 1) * (ty1 - ty0 + 1) <= cells.size) {
      for (let tx = tx0; tx <= tx1; tx++) {
        for (let ty = ty0; ty <= ty1; ty++) {
          const list = cells.get(cellKey(tx, ty));
          if (list && visit(list)) return true;
        }
      }
      return false;
    }
    // The range covers more tiles than are occupied: walk the occupied ones instead.
    for (const [key, list] of cells) {
      const tx = cellX(key);
      const ty = cellY(key);
      if (tx >= tx0 && tx <= tx1 && ty >= ty0 && ty <= ty1 && visit(list)) return true;
    }
    return false;
  }

  private scanStrips(strips: TBuckets<T>, from: number, to: number, visit: (list: TRecord<T>[]) => boolean): boolean {
    if (to - from + 1 <= strips.size) {
      for (let i = from; i <= to; i++) {
        const list = strips.get(i);
        if (list && visit(list)) return true;
      }
      return false;
    }
    for (const [index, list] of strips) {
      if (index >= from && index <= to && visit(list)) return true;
    }
    return false;
  }

  private toTile(value: number): number {
    const tile = Math.floor(value / this.tileSize);
    return Math.max(-TILE_OFFSET, Math.min(TILE_OFFSET - 1, tile));
  }

  private growExtent(record: TTileRect): void {
    const extent = this.extent;
    if (record.minX < extent.minX) extent.minX = record.minX;
    if (record.minY < extent.minY) extent.minY = record.minY;
    if (record.maxX > extent.maxX) extent.maxX = record.maxX;
    if (record.maxY > extent.maxY) extent.maxY = record.maxY;
  }

  private bucketsOf(bucket: EBucket): TBuckets<T> | undefined {
    switch (bucket) {
      case EBucket.Cells:
        return this.cells;
      case EBucket.Columns:
        return this.columns;
      case EBucket.Rows:
        return this.rows;
      default:
        return undefined;
    }
  }

  private link(record: TRecord<T>): void {
    if (record.bucket === EBucket.Large) {
      pushTo(this.large, record);
      return;
    }
    if (record.bucket === EBucket.Unbounded) {
      pushTo(this.unbounded, record);
      return;
    }
    const buckets = this.bucketsOf(record.bucket);
    if (!buckets) return;
    let list = buckets.get(record.key);
    if (!list) {
      list = [];
      buckets.set(record.key, list);
    }
    pushTo(list, record);
  }

  private unlink(record: TRecord<T>): void {
    if (record.bucket === EBucket.Large) {
      removeAt(this.large, record);
      return;
    }
    if (record.bucket === EBucket.Unbounded) {
      removeAt(this.unbounded, record);
      return;
    }
    const buckets = this.bucketsOf(record.bucket);
    const list = buckets?.get(record.key);
    if (!buckets || !list) return;
    removeAt(list, record);
    if (!list.length) buckets.delete(record.key);
  }
}
