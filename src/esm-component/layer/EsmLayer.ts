import { TBlock } from "../../components/canvas/blocks/Block";
import { Graph } from "../../graph";
import { Layer, LayerContext, LayerProps } from "../../services/Layer";
import { ICamera } from "../../services/camera/CameraService";
import { EsmBlocksList } from "../BlocksList";

export type TEsmLayerProps = LayerProps & {
  camera: ICamera;
  root: HTMLDivElement;
};

export type TEsmLayerContext = LayerContext & {
  graph: Graph;
  camera: ICamera;
};

/**
 * EsmLayer - A layer for rendering HTML elements in the graph
 * Similar to ReactLayer but without React dependencies
 */
export class EsmLayer extends Layer<TEsmLayerProps, TEsmLayerContext> {
  private static readonly ESM_BLOCK_STYLES = `
    .esm-block-container {
      display: flex;
      position: absolute;
      top: 0;
      left: 0;
      box-sizing: content-box;
      will-change: transform, width, height;
    }
    
    .esm-block-wrapper {
      flex: 1;
      min-width: 0;
      cursor: pointer;
      box-sizing: border-box;
      background: var(--graph-block-bg, #ffffff);
      border: 1px solid var(--graph-block-border, #cccccc);
    }
    
    .esm-block-wrapper.selected {
      border-color: var(--graph-block-border-selected, #0066ff);
    }
  `;

  private blocksList: EsmBlocksList | null = null;

  constructor(props: TEsmLayerProps) {
    super({
      html: {
        zIndex: 3,
        classNames: ["no-user-select"],
        transformByCameraPosition: true,
      },
      ...props,
    });
  }

  protected afterInit() {
    super.afterInit();

    // Inject styles
    this.injectEsmStyles();
  }

  private injectEsmStyles() {
    if (!this.getHTML()) return;

    const styleElement = document.createElement("style");
    styleElement.textContent = EsmLayer.ESM_BLOCK_STYLES;
    this.getHTML()?.appendChild(styleElement);
  }

  /**
   * Renders HTML elements inside the layer's HTML element
   * @param renderBlock Function to render a block element
   * @returns EsmBlocksList instance
   */
  public renderBlocks(renderBlock: (graphObject: Graph, block: TBlock) => HTMLElement) {
    if (!this.getHTML()) {
      return null;
    }

    // Create BlocksList if it doesn't exist
    if (!this.blocksList) {
      this.blocksList = new EsmBlocksList(this.context.graph, this.getHTML() as HTMLDivElement);
    }

    // Set render function
    this.blocksList.setRenderFunction(renderBlock);

    return this.blocksList;
  }
}
