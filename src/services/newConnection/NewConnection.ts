import { Component } from "ya-nirvana-renderer";
import { EVENTS } from "../../utils/types/events";
import { OverLayer, TOverLayerContext } from "../../components/canvas/layers/overLayer/OverLayer";
import { getXY } from "../../utils/functions";
import { ConnectionService } from "./ConnectionService";
import { render } from "../../utils/renderers/render";

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
    return render(this.context.ctx, (ctx) => {
      ctx.strokeStyle = this.context.colors.connection.selectedBackground;
      ctx.globalAlpha = 1;

      ctx.beginPath();
      ctx.moveTo(this.state.sx, this.state.sy);
      ctx.lineTo(this.state.tx, this.state.ty);
      ctx.stroke();
      ctx.closePath();
    });
  }

  private startNewConnectionRender = (event: MouseEvent) => {
    const xy = getXY(this.context.graphCanvas, event);

    this.setState({
      sx: xy[0],
      sy: xy[1],
    });
  };

  private updateNewConnectionRender = (event: MouseEvent) => {
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
