import { Path2DRenderInstance } from "../../../components/canvas/connections/BatchPath2D";

import { ELKConnection } from "./ELKConnection";
import { trangleArrowForVector } from "./helpers/triangle";

export type ELKArrowDefinition = {
  color: string;
  selectedColor: string;
  height: number;
  selectedHeight: number;
  width: number;
  selectedWidth: number;
};

export class ELKArrow implements Path2DRenderInstance {
  public static define(params: Partial<ELKArrowDefinition>) {
    return class extends ELKArrow {
      protected static definition: ELKArrowDefinition = {
        ...ELKArrow.definition,
        ...params,
      };
    };
  }

  protected static definition: ELKArrowDefinition = {
    color: "red",
    selectedColor: "blue",
    height: 16,
    selectedHeight: 16,
    width: 12,
    selectedWidth: 18,
  };

  constructor(protected connection: ELKConnection) {}

  protected getDefinition() {
    return (this.constructor as typeof ELKArrow).definition;
  }

  public createPath() {
    const points = this.connection.getPoints();
    if (!points.length) {
      return undefined;
    }
    const definition = this.getDefinition();
    const [start, end] = points.slice(points.length - 2);
    const height =
      this.connection.state.selected || this.connection.state.hovered ? definition.selectedHeight : definition.height;
    const width =
      this.connection.state.selected || this.connection.state.hovered ? definition.selectedWidth : definition.width;
    return trangleArrowForVector(start, end, height, width);
  }

  public style(
    ctx: CanvasRenderingContext2D
  ): { type: "stroke" } | { type: "fill"; fillRule?: CanvasFillRule } | undefined {
    const definition = this.getDefinition();
    ctx.fillStyle = this.connection.state.selected ? definition.selectedColor : definition.color;
    ctx.strokeStyle = this.connection.state.selected ? definition.selectedColor : definition.color;
    ctx.lineWidth = 4;
    return { type: "both" };
  }
}
