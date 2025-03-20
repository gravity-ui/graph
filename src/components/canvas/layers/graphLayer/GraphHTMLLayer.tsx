import React from "react";

import { createPortal } from "react-dom";

import { Graph } from "../../../../graph";
import { BlocksList, TBlockListProps } from "../../../../react-component/BlocksList";
import { Layer, LayerContext, LayerProps } from "../../../../services/Layer";
import { ICamera } from "../../../../services/camera/CameraService";

export type TGraphHTMLLayerProps = LayerProps & {
  camera: ICamera;
  root: HTMLDivElement;
  renderBlock?: TBlockListProps["renderBlock"];
  onChangePortal?: (portal: React.ReactPortal | null) => void;
};

export type TGraphHTMLLayerContext = LayerContext & {
  htmlCtx: HTMLDivElement;
  root: HTMLDivElement;
  ownerDocument: Document;
  graph: Graph;
};

export class GraphHTMLLayer extends Layer<TGraphHTMLLayerProps, TGraphHTMLLayerContext> {
  public portal: React.ReactPortal | null = null;

  constructor(props: TGraphHTMLLayerProps) {
    super({
      html: {
        zIndex: 3,
        classNames: ["no-user-select"],
        transformByCameraPosition: true,
      },
      ...props,
    });

    const html = this.getHTML();

    this.setContext({
      htmlCtx: html as HTMLDivElement,
      root: this.props.root,
      ownerDocument: html.ownerDocument,
      graph: this.props.graph,
    });
  }

  protected afterInit(): void {
    super.afterInit();
    const html = this.getHTML();

    this.setContext({
      htmlCtx: html as HTMLDivElement,
      ownerDocument: html.ownerDocument,
      graph: this.props.graph,
    });

    this.portal = createPortal(
      <BlocksList graphObject={this.context.graph} renderBlock={this.props.renderBlock} />,
      this.context.htmlCtx,
      "graph-blocks-list"
    );

    this.props.onChangePortal?.(this.portal);

    this.performRender();
  }

  protected render() {
    return this.portal;
  }

  protected unmount() {
    this.portal = null;
    super.unmount();
  }
}
