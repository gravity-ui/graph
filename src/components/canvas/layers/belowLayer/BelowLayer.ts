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
  constructor(props: TBelowLayerProps) {
    super({
      canvas: {
        zIndex: 1,
        classNames: ["no-pointer-events"],
        transformByCameraPosition: true,
      },
      ...props,
    });

    this.onSignal(this.props.graph.rootStore.settings.$background, () => {
      this.shouldUpdateChildren = true;
      this.performRender();
    });
  }

  protected afterInit(): void {
    super.afterInit();
    this.onGraphEvent("camera-change", this.performRender);
  }

  public render() {
    this.resetTransform();
  }

  public updateChildren() {
    return [(this.props.graph.rootStore.settings.$background.value || Background).create({})];
  }
}
