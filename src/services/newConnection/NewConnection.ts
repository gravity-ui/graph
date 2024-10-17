import { Anchor } from "../../components/canvas/anchors";
import { Block } from "../../components/canvas/blocks/Block";
import { OverLayer, TOverLayerContext } from "../../components/canvas/layers/overLayer/OverLayer";
import { Component } from "../../lib/Component";
import { getXY } from "../../utils/functions";
import { render } from "../../utils/renderers/render";
import { renderSVG } from "../../utils/renderers/svgPath";
import { EVENTS } from "../../utils/types/events";
import { ConnectionService } from "./ConnectionService";

export type NewConnectionProps = {
  connectionService: ConnectionService;
};

export class NewConnection extends Component {
  public declare props: NewConnectionProps;

  public declare state: { sx: number; sy: number; tx: number; ty: number };

  public declare context: TOverLayerContext;

  public constructor(props: NewConnectionProps, context: OverLayer) {
    super(props, context);

    this.state = {
      sx: 0,
      sy: 0,
      tx: 0,
      ty: 0,
    };

    this.props.connectionService.on(EVENTS.NEW_CONNECTION_START, this.startNewConnectionRender);
    this.props.connectionService.on(EVENTS.NEW_CONNECTION_UPDATE, this.updateNewConnectionRender);
    this.props.connectionService.on(EVENTS.NEW_CONNECTION_END, this.endNewConnectionRender);
  }

  protected render() {
    render(this.context.ctx, (ctx) => {
      ctx.beginPath();
      ctx.strokeStyle = this.context.colors.connection.selectedBackground;
      ctx.setLineDash([4, 4]);
      ctx.moveTo(this.state.sx, this.state.sy);
      ctx.lineTo(this.state.tx, this.state.ty);
      ctx.stroke();
      ctx.closePath();
    });
    render(this.context.ctx, (ctx) => {
      ctx.beginPath();
      ctx.fillStyle = "rgba(254, 190, 92, 1)";
      ctx.roundRect(this.state.tx, this.state.ty - 12, 24, 24, 8);
      ctx.fill();
      ctx.fillStyle = this.context.colors.canvas.belowLayerBackground;
      if(!this.target) {
        renderSVG({
          path: `M7 0.75C7.41421 0.75 7.75 1.08579 7.75 1.5V6.25H12.5C12.9142 6.25 13.25 6.58579 13.25 7C13.25 7.41421 12.9142 7.75 12.5 7.75H7.75V12.5C7.75 12.9142 7.41421 13.25 7 13.25C6.58579 13.25 6.25 12.9142 6.25 12.5V7.75H1.5C1.08579 7.75 0.75 7.41421 0.75 7C0.75 6.58579 1.08579 6.25 1.5 6.25H6.25V1.5C6.25 1.08579 6.58579 0.75 7 0.75Z`,
          width: 14,
          height: 14,
          iniatialWidth: 14,
          initialHeight: 14
        }, ctx, { x: this.state.tx, y: this.state.ty - 12, width: 24, height: 24 });
      } else {
        renderSVG({
          path: `M15.53 1.53A.75.75 0 0 0 14.47.47l-1.29 1.29a4.24 4.24 0 0 0-5.423.483l-.58.58a.96.96 0 0 0 0 1.354l4.646 4.646a.96.96 0 0 0 1.354 0l.58-.58a4.24 4.24 0 0 0 .484-5.423zm-8.5 4.94a.75.75 0 0 1 0 1.06L5.78 8.78l1.44 1.44 1.25-1.25a.75.75 0 0 1 1.06 1.06l-1.25 1.25.543.543a.96.96 0 0 1 0 1.354l-.58.58a4.24 4.24 0 0 1-5.423.484l-1.29 1.29A.75.75 0 0 1 .47 14.47l1.29-1.29a4.24 4.24 0 0 1 .483-5.423l.58-.58a.96.96 0 0 1 1.354 0l.543.543 1.25-1.25a.75.75 0 0 1 1.06 0M3.5 8.62l-.197.197a2.743 2.743 0 0 0 3.879 3.879l.197-.197zm9.197-1.439-.197.197L8.621 3.5l.197-.197a2.743 2.743 0 0 1 3.879 3.879`,
          width: 14,
          height: 14,
          iniatialWidth: 16,
          initialHeight: 16
        }, ctx, { x: this.state.tx, y: this.state.ty - 12, width: 24, height: 24 });
      }

      ctx.closePath();
    })
  }

  private startNewConnectionRender = (event: MouseEvent) => {
    const xy = getXY(this.context.graphCanvas, event);

    this.setState({
      sx: xy[0],
      sy: xy[1],
    });
  };

  protected target?: Block | Anchor;

  private updateNewConnectionRender = ({target, event}: { target?: Block | Anchor, event: MouseEvent }) => {
    this.target = target;
    const xy = getXY(this.context.graphCanvas, event);
    this.setState({
      tx: xy[0],
      ty: xy[1],
    });
  };

  private endNewConnectionRender = () => {
    this.setState({
      sx: 0,
      sy: 0,
      tx: 0,
      ty: 0,
    });
  };

  public unmount() {
    super.unmount();

    this.props.connectionService.off(EVENTS.NEW_CONNECTION_START, this.startNewConnectionRender);
    this.props.connectionService.off(EVENTS.NEW_CONNECTION_UPDATE, this.updateNewConnectionRender);
    this.props.connectionService.off(EVENTS.NEW_CONNECTION_END, this.endNewConnectionRender);
  }

  protected willIterate() {
    super.willIterate();

    this.shouldRender = !!(this.state.sx && this.state.sy && this.state.tx && this.state.ty);
  }
}
