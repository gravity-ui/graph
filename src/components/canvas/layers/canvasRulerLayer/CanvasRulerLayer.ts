import { Graph } from "../../../../graph";
import { Layer, LayerContext, LayerProps } from "../../../../services/Layer";
import { ICamera } from "../../../../services/camera/CameraService";

import { CanvasRuler } from "./CanvasRuler";

export type TCanvasRulerLayerProps = LayerProps & {
  camera: ICamera;
  root: HTMLElement;
  // Customization options
  rulerTextColor?: string;
  rulerTickColor?: string;
  rulerBackgroundColor?: string;
};

export type TCanvasRulerLayerContext = LayerContext & {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  graph: Graph;
};

export class CanvasRulerLayer extends Layer<TCanvasRulerLayerProps, TCanvasRulerLayerContext> {
  private ctx: CanvasRenderingContext2D;
  private camera: ICamera;

  constructor(props: TCanvasRulerLayerProps) {
    super({
      canvas: {
        zIndex: 10, // High zIndex to be above other layers
        classNames: ["no-pointer-events"],
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
    this.context.graph.on("camera-change", this.performRender);
  }

  protected unmount() {
    super.unmount();

    this.context.graph.off("camera-change", this.performRender);
  }

  protected propsChanged(_nextProps: TCanvasRulerLayerProps): void {
    this.shouldUpdateChildren = true;
    super.propsChanged(_nextProps);
  }

  public updateChildren() {
    return [
      CanvasRuler.create({
        rulerTextColor: this.props.rulerTextColor,
        rulerTickColor: this.props.rulerTickColor,
        rulerBackgroundColor: this.props.rulerBackgroundColor,
      }),
    ];
  }
}
