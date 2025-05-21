import React from "react";

import { createPortal } from "react-dom";

import { TBlock } from "../../components/canvas/blocks/Block";
import { Graph } from "../../graph";
import { Layer, LayerContext, LayerProps } from "../../services/Layer";
import { ICamera } from "../../services/camera/CameraService";
import { BlocksList } from "../BlocksList";

export type TReactLayerProps = LayerProps & {
  camera: ICamera;
  root: HTMLDivElement;
};

export type TReactLayerContext = LayerContext & {
  graph: Graph;
  camera: ICamera;
};

export class ReactLayer extends Layer<TReactLayerProps, TReactLayerContext> {
  constructor(props: TReactLayerProps) {
    super({
      html: {
        zIndex: 3,
        classNames: ["no-user-select"],
        transformByCameraPosition: true,
      },
      ...props,
    });
  }

  /**
   * Renders React components inside the layer's HTML element using React Portal
   * @param renderBlock Function to render a block component
   * @returns React Portal with BlocksList component
   */
  public renderPortal(renderBlock: <T extends TBlock>(graphObject: Graph, block: T) => React.JSX.Element) {
    if (!this.getHTML()) {
      return null;
    }

    return createPortal(
      React.createElement(BlocksList, {
        graphObject: this.context.graph,
        renderBlock: renderBlock,
      }),
      this.getHTML() as HTMLDivElement,
      "graph-blocks-list"
    );
  }
}
