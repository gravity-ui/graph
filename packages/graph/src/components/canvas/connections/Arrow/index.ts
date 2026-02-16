import { TConnection } from "../../../../store/connection/ConnectionState";
import { Path2DRenderInstance, Path2DRenderStyleResult } from "../BatchPath2D";
import { BlockConnection } from "../BlockConnection";

export class ConnectionArrow<T extends TConnection> implements Path2DRenderInstance {
  constructor(protected connection: BlockConnection<T>) {}

  public getPath() {
    return this.connection.createArrowPath();
  }

  public style(ctx: CanvasRenderingContext2D): Path2DRenderStyleResult | undefined {
    return this.connection.styleArrow(ctx);
  }
}
