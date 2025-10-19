import React from "react";

import { Graph, ICamera, Layer, LayerContext, LayerProps, TBlock, parseClassNames } from "@gravity-ui/graph";
import { createPortal } from "react-dom";

import { BlocksList } from "../BlocksList";

export type TReactLayerProps = LayerProps & {
  camera: ICamera;
  root: HTMLDivElement;
  blockListClassName?: string;
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
        classNames: ["no-user-select", "no-pointer-events"],
        transformByCameraPosition: true,
      },
      ...props,
    });
  }

  protected afterInit(): void {
    super.afterInit();
    this.applyBlockListClassName(undefined, this.props.blockListClassName);
  }

  protected propsChanged(nextProps: TReactLayerProps): void {
    if (this.props.blockListClassName !== nextProps.blockListClassName) {
      this.applyBlockListClassName(this.props.blockListClassName, nextProps.blockListClassName);
    }
    super.propsChanged(nextProps);
  }

  private applyBlockListClassName(oldClassName?: string, newClassName?: string): void {
    const htmlElement = this.getHTML();
    if (!htmlElement) return;

    // Remove previous blockListClassName classes if they exist
    if (oldClassName) {
      const oldClasses = parseClassNames(oldClassName);
      htmlElement.classList.remove(...oldClasses);
    }

    // Add new blockListClassName classes if they exist
    // If newClassName is provided (even if undefined), use it instead of this.props.blockListClassName
    if (newClassName) {
      const newClasses = parseClassNames(newClassName);
      htmlElement.classList.add(...newClasses);
    }
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
