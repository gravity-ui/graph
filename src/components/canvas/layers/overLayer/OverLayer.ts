import { Graph } from "../../../../graph";
import { CoreComponent } from "../../../../lib";
import { Layer, LayerContext, LayerProps } from "../../../../services/Layer";
import { ICamera } from "../../../../services/camera/CameraService";
import { NewBlockComponent } from "../../../../services/newBlock/NewBlockComponent";
import { NewBlocksService } from "../../../../services/newBlock/NewBlockService";
import { ConnectionService } from "../../../../services/newConnection/ConnectionService";
import { NewConnection } from "../../../../services/newConnection/NewConnection";
import { SelectionArea } from "../../../../services/selection/SelectionArea";
import { SelectionAreaService } from "../../../../services/selection/SelectionAreaService";

export type TOverLayerProps = LayerProps & {
  camera: ICamera;
};
export type TOverLayerContext = LayerContext & {
  canvas: HTMLCanvasElement;
  graphCanvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  graph: Graph;
};

export class OverLayer extends Layer<TOverLayerProps, TOverLayerContext> {
  protected selectionService = new SelectionAreaService(this.props.graph);

  protected connectionService = new ConnectionService(this.props.graph);

  protected newBlocksService = new NewBlocksService(this.props.graph);

  constructor(props: TOverLayerProps) {
    super(
      {
        canvas: {
          zIndex: 4,
          classNames: ["no-pointer-events"],
        },
        ...props,
      },
    );

    this.setContext({
      canvas: this.getCanvas(),
      graphCanvas: props.graph.getGraphCanvas(),
      ctx: this.getCanvas().getContext("2d"),
      camera: props.camera,
      constants: this.props.graph.graphConstants,
      colors: this.props.graph.graphColors,
      graph: this.props.graph,
    });

    this.performRender = this.performRender.bind(this);
    this.context.graph.on("camera-change", this.performRender);
  }

  protected render() {
    this.context.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.context.ctx.clearRect(0, 0, this.context.canvas.width, this.context.canvas.height);
  }

  protected unmount(): void {
    this.connectionService.unmount();
    this.context.graph.off("camera-change", this.performRender);
  }

  protected updateChildren(): void | object[] {
    return [
      SelectionArea.create({
        selectionService: this.selectionService,
      }),
      NewConnection.create({
        connectionService: this.connectionService,
      }),
      NewBlockComponent.create({
        newBlocksService: this.newBlocksService,
      }),
    ];
  }
}
