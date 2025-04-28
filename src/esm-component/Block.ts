import { TBlock } from "../components/canvas/blocks/Block";
import { Graph } from "../graph";
import { BlockState } from "../store/block/Block";
import { setCssProps } from "../utils/functions/cssProp";

/**
 * EsmBlock - Manages an HTML representation of a block
 * Similar to React Block component but without React dependencies
 */
export class EsmBlock {
  private container: HTMLElement;
  private wrapper: HTMLElement;
  private contentElement: HTMLElement | null = null;
  private graph: Graph;
  private blockState: BlockState<TBlock>;
  private viewState: any;
  private unsubscribers: Array<() => void> = [];

  constructor(graph: Graph, blockState: BlockState<TBlock>) {
    this.graph = graph;
    this.blockState = blockState;
    this.viewState = blockState.getViewComponent();

    // Create container element
    this.container = document.createElement("div");
    this.container.className = "esm-block-container";

    // Create wrapper element
    this.wrapper = document.createElement("div");
    this.wrapper.className = "esm-block-wrapper";

    // Add wrapper to container
    this.container.appendChild(this.wrapper);

    // Initialize block
    this.initialize();
  }

  /**
   * Initializes the block with position and state
   */
  private initialize() {
    const block = this.blockState.$state.value;

    // Set initial position and size
    this.updatePosition(block);

    // Set initial selection state
    if (block.selected) {
      this.wrapper.classList.add("selected");
    }

    // Hide the canvas block
    if (this.viewState) {
      this.viewState.setHiddenBlock(true);
    }

    // Subscribe to block state changes
    this.subscribeToStateChanges();
  }

  /**
   * Updates the position and size of the block
   */
  private updatePosition(block: TBlock) {
    setCssProps(this.container, {
      "--graph-block-geometry-x": `${block.x}px`,
      "--graph-block-geometry-y": `${block.y}px`,
      "--graph-block-geometry-width": `${block.width}px`,
      "--graph-block-geometry-height": `${block.height}px`,
    });

    // Apply position and size directly as well for browsers that don't support CSS variables
    this.container.style.transform = `translate3d(${block.x}px, ${block.y}px, 0)`;
    this.container.style.width = `${block.width}px`;
    this.container.style.height = `${block.height}px`;
  }

  /**
   * Subscribes to block state changes
   */
  private subscribeToStateChanges() {
    // Subscribe to block state changes
    const stateUnsubscribe = this.blockState.$state.subscribe((state) => {
      // Update position and size
      this.updatePosition(state);

      // Update selection state
      if (state.selected) {
        this.wrapper.classList.add("selected");
      } else {
        this.wrapper.classList.remove("selected");
      }
    });

    // Subscribe to view state changes
    if (this.viewState) {
      const viewStateUnsubscribe = this.viewState.$viewState.subscribe(({ zIndex, order }) => {
        setCssProps(this.container, {
          "--graph-block-z-index": `${zIndex}`,
          "--graph-block-order": `${order}`,
        });

        // Apply z-index directly as well
        this.container.style.zIndex = String(zIndex + order);
      });

      this.unsubscribers.push(viewStateUnsubscribe);
    }

    this.unsubscribers.push(stateUnsubscribe);
  }

  /**
   * Sets the content of the block
   */
  public setContent(content: HTMLElement) {
    // Remove existing content
    if (this.contentElement) {
      this.wrapper.removeChild(this.contentElement);
    }

    // Add new content
    this.contentElement = content;
    this.wrapper.appendChild(content);
  }

  /**
   * Gets the container element
   */
  public getElement(): HTMLElement {
    return this.container;
  }

  /**
   * Cleans up resources
   */
  public destroy() {
    // Unsubscribe from all subscriptions
    this.unsubscribers.forEach((unsubscribe) => unsubscribe());
    this.unsubscribers = [];

    // Show the canvas block again
    if (this.viewState) {
      this.viewState.setHiddenBlock(false);
    }
  }
}
