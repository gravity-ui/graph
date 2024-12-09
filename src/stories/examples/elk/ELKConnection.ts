import { ElkExtendedEdge } from "elkjs";

import { BlockConnection } from "../../../components/canvas/connections/BlockConnection";
import { TConnection } from "../../../store/connection/ConnectionState";

import { curve, getElkArrowCoords } from "./helpers";

export type TElkTConnection = TConnection & {
    elk: ElkExtendedEdge
}



export class ELKConnection extends BlockConnection<TElkTConnection> {
    public createPath() {
        const elk = this.connectedState.$state.value.elk;
        if(!elk || !elk.sections) {
            return super.createPath();
        }
        const path = new Path2D();
        path.addPath(curve(this.points, 50));
        const pointA = this.points[this.points.length - 1];
        const pointB = this.points[this.points.length - 2];

        path.addPath(getElkArrowCoords(pointB.x, pointB.y, pointA.x, pointA.y, 8));
        this.path2d = path;
        return path;
    }

    public style(ctx: CanvasRenderingContext2D): { type: "stroke"; } | { type: "fill"; fillRule?: CanvasFillRule; } | undefined {
        ctx.lineCap = "round";
        return super.style(ctx);
    }

    public afterRender?(_: CanvasRenderingContext2D): void {
        // noop;
        return;
    }

    protected points: {x:number, y: number}[]

    public updatePoints(): void {
        super.updatePoints();
        const elk = this.connectedState.$state.value.elk;
        if(!elk || !elk.sections) {
            return;
        }
        const section = elk.sections[0];

        this.points = [
            section.startPoint,
            ...section.bendPoints?.map((point) => point) || [],
            section.endPoint,
        ];
        
        return;
    }

    public getBBox() {
        const elk = this.connectedState.$state.value.elk;
        if(!elk || !elk.sections) {
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