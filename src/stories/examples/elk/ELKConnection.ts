import { ElkExtendedEdge } from "elkjs";

import { BlockConnection, TConnectionProps } from "../../../components/canvas/connections/BlockConnection";
import { BlockConnections } from "../../../components/canvas/connections/BlockConnections";
import { TConnection } from "../../../store/connection/ConnectionState";

import { ELKArrow } from "./Arrow";
import { curvePolyline } from "./helpers/curvePolyline";
import { trangleArrowForVector } from "./helpers/triangle";

export type TElkTConnection = TConnection & {
  elk: ElkExtendedEdge;
};

export class ELKConnection extends BlockConnection<TElkTConnection> {
  protected arrow: ELKArrow;

  protected static ArrowCtor: typeof ELKArrow;

  protected points: { x: number; y: number }[] = [];

  constructor(props: TConnectionProps, parent: BlockConnections) {
    super(props, parent);
    if (!ELKConnection.ArrowCtor) {
      ELKConnection.ArrowCtor = ELKArrow.define({
        color: this.context.colors.connection.background,
        selectedColor: this.context.colors.connection.selectedBackground,
        height: 16,
      });
    }
    this.arrow = new ELKConnection.ArrowCtor(this);
  }

  public createPath() {
    const elk = this.connectedState.$state.value.elk;
    const points = this.getPoints();
    if (!elk.sections || !points?.length) {
      return super.createPath();
    }
    // const [start, end] = points.slice(points.length - 2);
    this.path2d = curvePolyline(points, 10);
    // this.path2d.addPath(trangleArrowForVector(start, end, 16, 8));
    return this.path2d;
  }

  public getPoints() {
    return this.points || [];
  }

  public style(
    ctx: CanvasRenderingContext2D
  ): { type: "stroke" } | { type: "fill"; fillRule?: CanvasFillRule } | undefined {
    ctx.lineCap = "round";
    return super.style(ctx);
  }

  public afterRender?(_: CanvasRenderingContext2D): void {
    // noop;
    return;
  }

  protected applyShape(state = this.state): void {
    super.applyShape(state);
    this.context.batch.update(this.arrow, { zIndex: this.zIndex, group: `arrow/${this.getClassName(state)}` });
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
