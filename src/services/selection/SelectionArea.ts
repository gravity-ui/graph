import { OverLayer, TOverLayerContext } from "../../components/canvas/layers/overLayer/OverLayer";
import { Component } from "../../lib/Component";
import { getXY } from "../../utils/functions";
import { render } from "../../utils/renderers/render";
import { EVENTS } from "../../utils/types/events";
import { Point } from "../../utils/types/shapes";

import { SelectionAreaService } from "./SelectionAreaService";

export type SelectionAreaProps = {
  selectionService: SelectionAreaService;
};

export class SelectionArea extends Component {
  public declare state: { width: number; height: number };

  public declare context: TOverLayerContext;

  public declare props: SelectionAreaProps;

  protected startPoint = new Point(0, 0);

  constructor(props: SelectionAreaProps, context: OverLayer) {
    super(props, context);

    this.context = context.context;

    this.state = {
      width: 0,
      height: 0,
    };

    this.props.selectionService.on(EVENTS.SELECTION_START, this.startSelectionRender);
    this.props.selectionService.on(EVENTS.SELECTION_UPDATE, this.updateSelectionRender);
    this.props.selectionService.on(EVENTS.SELECTION_END, this.endSelectionRender);
  }

  protected render() {
    if (!this.state.width && !this.state.height) {
      return;
    }
    render(this.context.ctx, (ctx) => {
      ctx.fillStyle = this.context.colors.selection.background;
      ctx.strokeStyle = this.context.colors.selection.border;
      ctx.beginPath();
      ctx.roundRect(
        this.startPoint.x,
        this.startPoint.y,
        this.state.width,
        this.state.height,
        Number(window.devicePixelRatio)
      );
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
      width: xy[0] - this.startPoint.x,
      height: xy[1] - this.startPoint.y,
    });
  };

  private startSelectionRender = (event: MouseEvent) => {
    const [x, y] = getXY(this.context.graphCanvas, event);
    this.startPoint.x = x;
    this.startPoint.y = y;
  };

  private endSelectionRender = () => {
    this.setState({
      width: 0,
      height: 0,
    });
  };
}
