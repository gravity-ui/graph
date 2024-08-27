import { OverLayer, TOverLayerContext } from "../../components/canvas/layers/overLayer/OverLayer";
import { Component } from "../../lib/Component";
import { getXY } from "../../utils/functions";
import { render } from "../../utils/renderers/render";
import { EVENTS } from "../../utils/types/events";
import { SelectionAreaService } from "./SelectionAreaService";

export type SelectionAreaProps = {
  selectionService: SelectionAreaService;
};

export class SelectionArea extends Component {
  public declare state: { sx: number; sy: number; width: number; height: number };

  public declare context: TOverLayerContext;

  public declare props: SelectionAreaProps;

  public constructor(props: SelectionAreaProps, context: OverLayer) {
    super(props, context);

    this.context = context.context;

    this.state = {
      sx: 0,
      sy: 0,
      width: 0,
      height: 0,
    };

    this.props.selectionService.on(EVENTS.SELECTION_START, this.startSelectionRender);
    this.props.selectionService.on(EVENTS.SELECTION_UPDATE, this.updateSelectionRender);
    this.props.selectionService.on(EVENTS.SELECTION_END, this.endSelectionRender);
  }

  protected render() {
    return render(this.context.ctx, (ctx) => {
      ctx.fillStyle = this.context.colors.selection.background;
      ctx.strokeStyle = this.context.colors.selection.border;
      ctx.globalAlpha = 1;

      ctx.beginPath();
      ctx.rect(this.state.sx, this.state.sy, this.state.width, this.state.height);
      ctx.closePath();

      ctx.fill();
      ctx.stroke();
    });
  }

  public unmount() {
    super.unmount();

    this.props.selectionService.off(EVENTS.SELECTION_START, this.startSelectionRender);
    this.props.selectionService.off(EVENTS.SELECTION_UPDATE, this.updateSelectionRender);
    this.props.selectionService.off(EVENTS.SELECTION_END, this.endSelectionRender);
    return;
  }

  private updateSelectionRender = (event: MouseEvent) => {
    const xy = getXY(this.context.graphCanvas, event);
    this.setState({
      width: xy[0] - this.state.sx,
      height: xy[1] - this.state.sy,
    });
  };

  private startSelectionRender = (event: MouseEvent) => {
    const xy = getXY(this.context.graphCanvas, event);
    this.setState({
      sx: xy[0],
      sy: xy[1],
    });
  };

  private endSelectionRender = () => {
    this.setState({
      width: 0,
      height: 0,
    });
  };
}
