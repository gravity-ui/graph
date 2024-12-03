import { Graph } from "../../../../graph";
import { Layer, LayerContext, LayerProps } from "../../../../services/Layer";
import { ICamera } from "../../../../services/camera/CameraService";

import { Background } from "./Background";

export type TBelowLayerProps = LayerProps & {
  camera: ICamera;
  root: HTMLElement;
};

export type TBelowLayerContext = LayerContext & {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  graph: Graph;
};

export class BelowLayer extends Layer<TBelowLayerProps, TBelowLayerContext> {
  private ctx: CanvasRenderingContext2D;

  private camera: ICamera;

  constructor(props: TBelowLayerProps) {
    super(
      {
        canvas: {
          zIndex: 1,
          classNames: ["no-pointer-events"],
        },
        ...props,
      }
    );

    this.setContext({
      canvas: this.getCanvas(),
      ctx: this.getCanvas().getContext("2d"),
      constants: this.props.graph.graphConstants,
      colors: this.props.graph.graphColors,
      graph: this.props.graph,
    });

    this.camera = this.context.camera;
    this.ctx = this.context.ctx;

    this.performRender = this.performRender.bind(this);
    this.context.graph.on("camera-change", this.performRender);
  }

  protected unmount() {
    super.unmount();

    this.context.graph.off("camera-change", this.performRender);
  }

  public render() {
    const cameraState = this.camera.getCameraState();

    this.ctx.setTransform(1, 0, 0, 1, 0, 0);

    this.ctx.clearRect(0, 0, cameraState.width, cameraState.height);

    this.ctx.setTransform(cameraState.scale, 0, 0, cameraState.scale, cameraState.x, cameraState.y);
  }

  public updateChildren() {
    return [Background.create()];
  }
}
