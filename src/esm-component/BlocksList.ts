import { Block, TBlock } from "../components/canvas/blocks/Block";
import { Graph, GraphState } from "../graph";
import { ECameraScaleLevel } from "../services/camera/CameraService";
import { EsmBlock } from "./Block";

/**
 * EsmBlocksList - Manages a list of HTML blocks in the ESM layer
 * Similar to ReactBlocksList but without React dependencies
 */
export class EsmBlocksList {
  private container: HTMLElement;
  private blocks: Map<string, EsmBlock> = new Map();
  private renderFunction: ((graphObject: Graph, block: TBlock) => HTMLElement) | null = null;
  private graph: Graph;

  constructor(graph: Graph, container: HTMLElement) {
    this.graph = graph;
    this.container = container;

    // Subscribe to camera changes
    this.graph.on("camera-change", () => {
      this.updateBlocksList();
    });

    // Subscribe to hit test updates (when blocks are added/removed/moved)
    this.graph.hitTest.on("update", () => {
      this.updateBlocksList();
    });

    // Subscribe to graph state changes
    this.graph.on("state-change", () => {
      if (this.graph.state === GraphState.READY) {
        this.updateBlocksList();
      } else {
        this.clearBlocks();
      }
    });

    // Initialize blocks list
    if (this.graph.state === GraphState.READY) {
      this.updateBlocksList();
    }
  }

  /**
   * Sets the function used to render block content
   */
  public setRenderFunction(renderFunction: (graphObject: Graph, block: TBlock) => HTMLElement) {
    this.renderFunction = renderFunction;
    // Update existing blocks with the new render function
    this.updateBlocksList();
  }

  /**
   * Updates the list of blocks based on camera viewport
   */
  private updateBlocksList() {
    // Only show blocks when in detailed view
    if (this.graph.cameraService.getCameraBlockScaleLevel() !== ECameraScaleLevel.Detailed) {
      this.clearBlocks();
      return;
    }

    // Calculate viewport with threshold
    const CAMERA_VIEWPORT_TRESHOLD = this.graph.graphConstants.system.CAMERA_VIEWPORT_TRESHOLD;
    const cameraSize = this.graph.cameraService.getCameraState();

    const x = -cameraSize.relativeX - cameraSize.relativeWidth * CAMERA_VIEWPORT_TRESHOLD;
    const y = -cameraSize.relativeY - cameraSize.relativeHeight * CAMERA_VIEWPORT_TRESHOLD;
    const width = -cameraSize.relativeX + cameraSize.relativeWidth * (1 + CAMERA_VIEWPORT_TRESHOLD) - x;
    const height = -cameraSize.relativeY + cameraSize.relativeHeight * (1 + CAMERA_VIEWPORT_TRESHOLD) - y;

    // Get blocks in viewport
    const componentsInRect = this.graph.getElementsOverRect({ x, y, width, height }, [Block]) as Block[];

    // Update blocks
    this.updateBlocks(componentsInRect);
  }

  /**
   * Updates the blocks based on the components in the viewport
   */
  private updateBlocks(components: Block[]) {
    // Create a set of visible block IDs
    const visibleBlockIds = new Set(components.map((component) => component.connectedState.id));

    // Remove blocks that are no longer visible
    for (const [blockId, block] of this.blocks.entries()) {
      if (!visibleBlockIds.has(blockId)) {
        this.container.removeChild(block.getElement());
        this.blocks.delete(blockId);
      }
    }

    // Add or update visible blocks
    for (const component of components) {
      const blockId = component.connectedState.id;
      const blockState = component.connectedState;

      if (!this.blocks.has(String(blockId))) {
        // Create new block
        const block = new EsmBlock(this.graph, blockState);

        // Add custom content if render function is available
        if (this.renderFunction) {
          const content = this.renderFunction(this.graph, blockState.$state.value);
          block.setContent(content);
        }

        this.container.appendChild(block.getElement());
        this.blocks.set(String(blockId), block);
      }
    }
  }

  /**
   * Clears all blocks from the container
   */
  private clearBlocks() {
    for (const block of this.blocks.values()) {
      this.container.removeChild(block.getElement());
    }
    this.blocks.clear();
  }
}
