import { Component } from "ya-nirvana-renderer";
import { OverLayer, TOverLayerContext } from "../../components/canvas/layers/overLayer/OverLayer";
import { getXY } from "../../utils/functions";
import { EVENTS } from "../../utils/types/events";
import { NewBlocksService } from "./NewBlockService";
import { render } from "../../utils/renderers/render";

type NewBlockComponentProps = {
  newBlocksService: NewBlocksService;
};

export class NewBlockComponent extends Component {
  public declare props: NewBlockComponentProps;

  public state: { x: number; y: number; width: number; height: number };

  public declare context: TOverLayerContext;

  public constructor(props: NewBlockComponentProps, context: OverLayer) {
    super(props, context);

    this.state = {
      x: 0,
      y: 0,
      height: 0,
      width: 0,
    };

    this.props.newBlocksService.on(EVENTS.NEW_BLOCK_START, this.startNewBlockRender);
    this.props.newBlocksService.on(EVENTS.NEW_BLOCK_UPDATE, this.updateNewBlockRender);
    this.props.newBlocksService.on(EVENTS.NEW_BLOCK_END, this.endNewBlockRender);
  }

  protected render() {
    return render(this.context.ctx, (ctx) => {
      ctx.beginPath();
      ctx.fillStyle = this.context.colors.block.border;
      ctx.globalAlpha = this.context.constants.block.GHOST_BLOCK_OPACITY;

      ctx.fillRect(this.state.x, this.state.y, this.state.width, this.state.height);

      ctx.closePath();
    });
  }

  private startNewBlockRender = (event: MouseEvent) => {
    const xy = getXY(this.context.graphCanvas, event);
    this.setState({
      width: this.context.constants.block.WIDTH * this.context.camera.getCameraScale(),
      height: this.context.constants.block.HEIGHT * this.context.camera.getCameraScale(),
      x: xy[0],
      y: xy[1],
    });
  };

  private updateNewBlockRender = (event: MouseEvent) => {
    const xy = getXY(this.context.graphCanvas, event);
    this.setState({
      x: xy[0],
      y: xy[1],
    });
  };

  private endNewBlockRender = () => {
    this.setState({
      x: 0,
      y: 0,
      width: 0,
      height: 0,
    });
  };

  protected willIterate() {
    super.willIterate();

    this.shouldRender = !!(this.state.width && this.state.height);
  }

  public unmount() {
    super.unmount();

    this.props.newBlocksService.off(EVENTS.NEW_BLOCK_START, this.startNewBlockRender);
    this.props.newBlocksService.off(EVENTS.NEW_BLOCK_UPDATE, this.updateNewBlockRender);
    this.props.newBlocksService.off(EVENTS.NEW_BLOCK_END, this.endNewBlockRender);
  }
}
