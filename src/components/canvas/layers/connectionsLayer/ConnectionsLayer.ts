import { ICamera } from "../../../../services/camera/CameraService";
import { Layer, LayerProps } from "../../../../services/Layer";

import { BlockConnections } from "../../connections/BlockConnections";
import { TGraphLayerContext } from "../graphLayer/GraphLayer";

export type TConnectionsLayerProps = LayerProps & {
  camera: ICamera;
  root: HTMLDivElement;
};

export class ConnectionsLayer extends Layer<TConnectionsLayerProps, TGraphLayerContext> {
  constructor(props: TConnectionsLayerProps) {
    super({
      canvas: {
        zIndex: 2,
        classNames: ["no-user-select", "no-pointer-events", "connections-canvas"],
        transformByCameraPosition: true,
      },
      ...props,
    });

    this.setContext({
      canvas: this.canvas,
      ownerDocument: this.canvas.ownerDocument,
    });
  }

  public updateChildren() {
    const BlockConnectionsComp = this.context.graph.rootStore.settings.$blockConnections?.value ?? BlockConnections;
    return [BlockConnectionsComp.create()];
  }

  protected afterInit(): void {
    this.setContext({
      root: this.root as HTMLDivElement,
    });
    super.afterInit();
  }
}
