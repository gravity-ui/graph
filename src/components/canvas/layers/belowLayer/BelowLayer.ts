import { Graph } from "../../../../graph";
import { Component } from "../../../../lib";
import { ComponentDescriptor, CoreComponentContext, CoreComponentProps } from "../../../../lib/CoreComponent";
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
  protected background: typeof Component;

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
      this.background = this.props.graph.rootStore.settings.$background.value || (Background as typeof Component);
      this.shouldUpdateChildren = true;
      this.performRender();
    });
  }

  protected afterInit(): void {
    this.onGraphEvent("camera-change", this.performRender);
    super.afterInit();
  }

  public render() {
    this.resetTransform();
  }

  public updateChildren(): ComponentDescriptor<CoreComponentProps, CoreComponentContext>[] {
    return [this.background.create({})];
  }
}
