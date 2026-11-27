import type { Graph } from "../../../../graph";
import type { Component } from "../../../../lib/Component";
import { Layer, LayerContext, LayerProps } from "../../../../services/Layer";
import { Camera, TCameraProps } from "../../../../services/camera/Camera";
import type { ICamera } from "../../../../services/camera/CameraService";
import { Blocks } from "../../blocks/Blocks";
import { BlockConnections } from "../../connections/BlockConnections";

export type TGraphLayerProps = LayerProps & {
  camera: ICamera;
  root?: HTMLElement;
};

export type TGraphLayerContext = LayerContext & {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  root?: HTMLElement;
  ownerDocument: Document;
  graph: Graph;
};

export class GraphLayer extends Layer<TGraphLayerProps, TGraphLayerContext> {
  public declare $: Component["$"] & { camera?: Camera };

  constructor(props: TGraphLayerProps) {
    super({
      canvas: {
        zIndex: 2,
        classNames: ["no-user-select", "no-pointer-events"],
        transformByCameraPosition: true,
      },
      // HTML element creation is now separated into framework-specific layers
      ...props,
    });

    this.requireCanvas();

    this.performRender = this.performRender.bind(this);
  }

  public override getCanvas(): HTMLCanvasElement {
    return this.requireCanvas();
  }

  protected afterInit(): void {
    this.onSignal(this.context.graph.rootStore.blocksList.$blocks, () => {
      this.performRender();
    });
    this.onSignal(this.context.graph.rootStore.connectionsList.$connections, () => {
      this.performRender();
    });
    super.afterInit();
  }

  public updateChildren() {
    const cameraProps: TCameraProps = {
      children: [BlockConnections.create({}), Blocks.create()],
      root: this.root,
    };

    return [Camera.create(cameraProps, { ref: "camera" })];
  }
}
