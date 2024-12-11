import { ElkExtendedEdge } from "elkjs";

import { Path2DRenderStyleResult } from "../../../components/canvas/connections/BatchPath2D";
import { BlockConnection } from "../../../components/canvas/connections/BlockConnection";
import { TConnection } from "../../../store/connection/ConnectionState";
import { curvePolyline } from "../../../utils/shapes/curvePolyline";
import { trangleArrowForVector } from "../../../utils/shapes/triangle";

export type TElkTConnection = TConnection & {
  elk: ElkExtendedEdge;
};

export class ELKConnection extends BlockConnection<TElkTConnection> {
  protected points: { x: number; y: number }[] = [];

  public createPath() {
    const elk = this.connectedState.$state.value.elk;
    if (!elk.sections || !this.points?.length) {
      return super.createPath();
    }
    return curvePolyline(this.points, 10);
  }

  public createArrowPath(): Path2D {
    if (!this.points.length) {
      return undefined;
    }
    const [start, end] = this.points.slice(this.points.length - 2);
    return trangleArrowForVector(start, end, 16, 10);
  }

  public styleArrow(ctx: CanvasRenderingContext2D): Path2DRenderStyleResult {
    ctx.fillStyle = this.state.selected
      ? this.context.colors.connection.selectedBackground
      : this.context.colors.connection.background;
    ctx.strokeStyle = ctx.fillStyle;
    ctx.lineWidth = this.state.selected || this.state.hovered ? -1 : 1;
    return { type: "both" };
  }

  public getPoints() {
    return this.points || [];
  }

  public afterRender?(_: CanvasRenderingContext2D): void {
    // do not render label;
    return;
  }

  public updatePoints(): void {
    super.updatePoints();
    const elk = this.connectedState.$state.value.elk;
    if (!elk || !elk.sections) {
      return;
    }
    const section = elk.sections[0];

    this.points = [section.startPoint, ...(section.bendPoints?.map((point) => point) || []), section.endPoint];

    return;
  }

  public getBBox() {
    const elk = this.connectedState.$state.value.elk;
    if (!elk || !elk.sections) {
      return super.getBBox();
    }
    const x = [];
    const y = [];
    elk.sections.forEach((c) => {
      x.push(c.startPoint.x);
      y.push(c.startPoint.y);
      c.bendPoints?.forEach((point) => {
        x.push(point.x);
        y.push(point.y);
      });
      x.push(c.endPoint.x);
      y.push(c.endPoint.y);
    });
    return [Math.min(...x), Math.min(...y), Math.max(...x), Math.max(...y)] as const;
  }
}
