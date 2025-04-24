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
    super({
      canvas: {
        zIndex: 1,
        classNames: ["no-pointer-events"],
        transformByCameraPosition: true,
      },
      ...props,
    });

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

    this.props.graph.rootStore.settings.$background.subscribe(this.performRender);
  }

  /**
   * Called after initialization and when the layer is reattached.
   * This is where we set up event subscriptions to ensure they work properly
   * after the layer is unmounted and reattached.
   */
  protected afterInit(): void {
    // Register event listener with the graphOn wrapper method for automatic cleanup when unmounted
    this.graphOn("camera-change", this.performRender);

    // Call parent afterInit to ensure proper initialization
    super.afterInit();
  }

  public render() {
    this.resetTransform();
  }

  public updateChildren() {
    return [(this.props.graph.rootStore.settings.$background.value || Background).create({})];
  }
}
