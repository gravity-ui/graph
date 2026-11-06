import { BatchScene } from "../../../../lib/batch/BatchScene";
import { boundsIntersect } from "../../../../lib/batch/bounds";
import type { IBatchBackend, IBatchItem, TPathBounds } from "../../../../lib/batch/types";
import type { TTileRect } from "../../../../lib/culling/TileIndex";

/** What the label pass needs from a connection. */
export interface IConnectionLabelOwner {
  /** World-space rectangle of everything the label paints; undefined while there is no label to draw. */
  getLabelBounds(): TPathBounds | undefined;
  isPathVisible(): boolean;
  renderLabel(ctx: CanvasRenderingContext2D): void;
}

/** A connection's standard label as an item of the label pass. */
export class ConnectionLabel implements IBatchItem {
  constructor(protected readonly owner: IConnectionLabelOwner) {}

  public getPathBounds(): TPathBounds | undefined {
    return this.owner.getLabelBounds();
  }

  public isPathVisible(): boolean {
    return this.owner.isPathVisible();
  }

  public render(ctx: CanvasRenderingContext2D): void {
    this.owner.renderLabel(ctx);
  }
}

/** Labels are drawn one by one: a drawn chunk still culls each label by its own rectangle. */
const labelBackend: IBatchBackend<ConnectionLabel, readonly ConnectionLabel[], CanvasRenderingContext2D> = {
  build: (labels: readonly ConnectionLabel[]): readonly ConnectionLabel[] => labels,
  draw(ctx, labels, _items, viewport): void {
    for (const label of labels) {
      if (boundsIntersect(label.getPathBounds(), viewport)) label.render(ctx);
    }
  },
};

const LABEL_GROUP = "label";

/**
 * The label pass of a connections layer: draws labels after every line and arrow, by z-level (labels of selected and
 * hovered connections on top), skipping labels whose rectangle is outside the viewport.
 */
export class ConnectionLabelRenderer {
  private readonly scene: BatchScene<ConnectionLabel, readonly ConnectionLabel[], CanvasRenderingContext2D>;

  constructor(onChange: () => void, chunkSize: number, cellSize: number) {
    this.scene = new BatchScene(labelBackend, { onChange, chunkSize, cellSize });
  }

  /** Registers the label or refreshes it after its bounds, visibility or z-level changed. */
  public update(label: ConnectionLabel, zIndex: number): void {
    this.scene.update(label, { zIndex, group: LABEL_GROUP });
  }

  public delete(label: ConnectionLabel): void {
    this.scene.delete(label);
  }

  public has(label: ConnectionLabel): boolean {
    return this.scene.has(label);
  }

  public render(ctx: CanvasRenderingContext2D, viewport?: TTileRect): void {
    this.scene.render(ctx, viewport);
  }
}
