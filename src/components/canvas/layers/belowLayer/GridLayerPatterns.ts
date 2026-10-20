export type TGridLayerPatternRequest = {
  /** Layer step in world units; identifies the layer in the cache */
  stepWorld: number;
  /** Tile side in device px (one grid cell) */
  tilePx: number;
  /** Dot diameter in device px */
  dotSizePx: number;
  /** Dot color */
  color: string;
};

type TPatternEntry = {
  key: string;
  pattern: CanvasPattern | null;
};

type TScratchFactory = () => CanvasRenderingContext2D | null;

function createScratchContext(): CanvasRenderingContext2D | null {
  return document.createElement("canvas").getContext("2d");
}

/**
 * Keeps one dot-tile pattern per grid layer.
 * A tile is redrawn only when its size, dot size or color changes, so panning never rebuilds patterns.
 */
export class GridLayerPatterns {
  private readonly entries = new Map<number, TPatternEntry>();

  private scratch: CanvasRenderingContext2D | null | undefined;

  constructor(private readonly createScratch: TScratchFactory = createScratchContext) {}

  public get(ctx: CanvasRenderingContext2D, request: TGridLayerPatternRequest): CanvasPattern | undefined {
    const key = `${request.tilePx}|${request.dotSizePx}|${request.color}`;
    const cached = this.entries.get(request.stepWorld);
    if (cached && cached.key === key) {
      return cached.pattern ?? undefined;
    }

    const pattern = this.createPattern(ctx, request);
    this.entries.set(request.stepWorld, { key, pattern });
    return pattern ?? undefined;
  }

  /** Drops cached patterns of layers that are not in `stepWorlds` */
  public retain(stepWorlds: readonly number[]): void {
    for (const stepWorld of Array.from(this.entries.keys())) {
      if (!stepWorlds.includes(stepWorld)) {
        this.entries.delete(stepWorld);
      }
    }
  }

  public clear(): void {
    this.entries.clear();
    this.scratch = undefined;
  }

  private createPattern(ctx: CanvasRenderingContext2D, request: TGridLayerPatternRequest): CanvasPattern | null {
    if (this.scratch === undefined) {
      this.scratch = this.createScratch();
    }
    const scratch = this.scratch;
    if (!scratch) {
      return null;
    }

    const { stepWorld, tilePx, dotSizePx, color } = request;
    // Resizing the canvas also clears it
    scratch.canvas.width = tilePx;
    scratch.canvas.height = tilePx;
    scratch.fillStyle = color;
    scratch.beginPath();
    scratch.arc(tilePx / 2, tilePx / 2, dotSizePx / 2, 0, Math.PI * 2);
    scratch.fill();

    // createPattern snapshots the canvas, so the scratch canvas can be reused for the next tile
    const pattern = ctx.createPattern(scratch.canvas, "repeat");
    if (!pattern) {
      return null;
    }

    // One tile covers exactly one world step; the tile center lands on grid nodes
    const tileToWorld = stepWorld / tilePx;
    pattern.setTransform({
      a: tileToWorld,
      b: 0,
      c: 0,
      d: tileToWorld,
      e: -stepWorld / 2,
      f: -stepWorld / 2,
    });
    return pattern;
  }
}
