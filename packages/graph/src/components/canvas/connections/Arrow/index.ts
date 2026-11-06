import { TConnection } from "../../../../store/connection/ConnectionState";
import { Path2DRenderInstance, Path2DRenderStyleResult } from "../BatchPath2D";
import { BlockConnection } from "../BlockConnection";
import type { TConnectionAppearance } from "../appearance";

export class ConnectionArrow<T extends TConnection> implements Path2DRenderInstance {
  constructor(protected connection: BlockConnection<T>) {}

  public isPathVisible(): boolean {
    return this.connection.isPathVisible();
  }

  public getPathBounds() {
    return this.connection.getPathBounds();
  }

  public getPath() {
    return this.connection.getArrowPath();
  }

  public style(ctx: CanvasRenderingContext2D): Path2DRenderStyleResult | undefined {
    return this.connection.styleArrow(ctx);
  }

  public getAppearance(): TConnectionAppearance | undefined {
    return this.connection.getArrowAppearance();
  }

  public isAnimated(): boolean {
    return false;
  }
}
