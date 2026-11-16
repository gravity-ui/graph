import React from "react";

import { Graph, ICamera, Layer, LayerContext, LayerProps } from "@gravity-ui/graph";
import { createPortal } from "react-dom";

import { BlocksList, TRenderBlockFn } from "../BlocksList";
import { parseClassNames } from "../utils/classNames";

const DEFAULT_REACT_LAYER_Z_INDEX = 3;

export type TReactLayerProps = LayerProps & {
  camera: ICamera;
  root?: HTMLElement;
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
        zIndex: DEFAULT_REACT_LAYER_Z_INDEX,
        classNames: ["no-user-select", "no-pointer-events"],
        transformByCameraPosition: true,
      },
      ...props,
    });
  }

  protected afterInit(): void {
    // Settle the activity before the first camera transform, so a hidden layer is not left in the "moving" state.
    this.setHtmlActive(this.props.graph.scene.$level.value === "detailed");
    super.afterInit();
    // The HTML layer is active exactly at the "detailed" scene level. It switches at the end of the graph frame, after
    // every layer and the scene updated, so the frame that hides the HTML is the one that draws the blocks it held
    // (spec §10), whatever the layer order and whatever changed the camera. A stopped graph does not switch it.
    const stop = this.props.graph.scene.onFrameEnd(() => {
      this.setHtmlActive(this.props.graph.scene.$level.peek() === "detailed");
    });
    this.eventAbortController.signal.addEventListener("abort", stop, { once: true });
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
  public renderPortal(renderBlock?: TRenderBlockFn) {
    const html = this.getHTML();
    if (!html || !renderBlock) {
      return null;
    }

    return createPortal(
      React.createElement(BlocksList, {
        graphObject: this.context.graph,
        renderBlock: renderBlock,
      }),
      html,
      "graph-blocks-list"
    );
  }
}
