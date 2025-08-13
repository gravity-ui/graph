import { Graph } from "../../graph";
import { ESchedulerPriority, scheduler } from "../../lib/Scheduler";
import { dragListener } from "../../utils/functions/dragListener";
import { EVENTS } from "../../utils/types/events";

import { DragInfo, DragModifier, PositionModifier } from "./DragInfo";

/**
 * Interface for components that can be dragged
 */
export interface DragHandler {
  /**
   * Called before position update to select a modifier
   * @param dragInfo - Stateful model with drag information
   */
  beforeUpdate?(dragInfo: DragInfo): void;

  /**
   * Called when dragging starts
   * @param event - Mouse event
   * @param dragInfo - Stateful model with drag information
   */
  onDragStart(event: MouseEvent, dragInfo: DragInfo): void;

  /**
   * Called when position is updated during dragging
   * @param event - Mouse event
   * @param dragInfo - Stateful model with drag information
   */
  onDragUpdate(event: MouseEvent, dragInfo: DragInfo): void;

  /**
   * Called when dragging ends
   * @param event - Mouse event
   * @param dragInfo - Stateful model with drag information
   */
  onDragEnd(event: MouseEvent, dragInfo: DragInfo): void;
}

/**
 * Configuration for DragController
 */
export interface DragControllerConfig {
  /** Enable automatic camera movement when approaching edges */
  enableEdgePanning?: boolean;
  /** Position modifiers for coordinate correction during dragging */
  positionModifiers?: (PositionModifier | DragModifier)[];
  /** Additional context to pass to modifiers */
  context?: Record<string, unknown>;
  /** Initial position of the dragged entity in camera space */
  initialEntityPosition?: { x: number; y: number };
}

/**
 * Centralized controller for managing component dragging
 */
export class DragController {
  private graph: Graph;

  private currentDragHandler?: DragHandler;

  private isDragging = false;

  private lastMouseEvent?: MouseEvent;

  private dragInfo: DragInfo;

  private updateScheduler?: () => void;

  constructor(graph: Graph) {
    this.graph = graph;
  }

  /**
   * Starts the dragging process for the specified component
   * @param component - Component that will be dragged
   * @param event - Initial mouse event
   * @param config - Drag configuration
   * @returns void
   */
  public start(component: DragHandler, event: MouseEvent, config: DragControllerConfig = {}): void {
    if (this.isDragging) {
      // eslint-disable-next-line no-console
      console.warn("DragController: attempt to start dragging while already dragging");
      return;
    }

    this.currentDragHandler = component;
    this.isDragging = true;
    this.lastMouseEvent = event;

    // Create DragInfo with modifiers, context and initialize
    this.dragInfo = new DragInfo(
      this.graph,
      config.positionModifiers || [],
      config.context,
      config.initialEntityPosition
    );
    this.dragInfo.init(event);

    if (config.enableEdgePanning ?? true) {
      const defaultConfig = this.graph.graphConstants.camera.EDGE_PANNING;

      this.graph.getGraphLayer().enableEdgePanning({
        speed: defaultConfig.SPEED,
        edgeSize: defaultConfig.EDGE_SIZE,
      });

      // Start periodic component updates for synchronization with camera movement
      this.startContinuousUpdate();
    }

    component.onDragStart(event, this.dragInfo);

    // Emit drag-start event
    this.graph.emit("drag-start", { dragInfo: this.dragInfo });

    this.startDragListener(event);
  }

  /**
   * Updates the dragging state
   * @param event - Mouse event
   * @returns void
   */
  public update(event: MouseEvent): void {
    if (!this.isDragging || !this.currentDragHandler) {
      return;
    }

    this.lastMouseEvent = event;

    // Update DragInfo state
    this.dragInfo.update(event);

    // Analyze position modifiers
    this.dragInfo.analyzeSuggestions();

    // Give opportunity to select modifier in beforeUpdate
    if (this.currentDragHandler.beforeUpdate) {
      this.currentDragHandler.beforeUpdate(this.dragInfo);
    } else {
      // Default strategy - by distance
      this.dragInfo.selectDefault();
    }

    this.currentDragHandler.onDragUpdate(event, this.dragInfo);

    // Emit drag-update event
    this.graph.emit("drag-update", { dragInfo: this.dragInfo });
  }

  /**
   * Ends the dragging process
   * @param event - Mouse event
   * @returns void
   */
  public end(event: MouseEvent): void {
    if (!this.isDragging || !this.currentDragHandler) {
      return;
    }

    // TODO: Need to pass EventedComponent instead of DragController
    // this.graph.getGraphLayer().releaseCapture();

    // Stop continuous updates
    this.stopContinuousUpdate();

    // Disable edge panning
    this.graph.getGraphLayer().disableEdgePanning();

    // Complete the process in DragInfo (sets stage to 'drop')
    this.dragInfo.end(event);

    // Analyze modifiers at 'drop' stage
    this.dragInfo.analyzeSuggestions();

    // Give opportunity to select modifier at drop stage
    if (this.currentDragHandler.beforeUpdate) {
      this.currentDragHandler.beforeUpdate(this.dragInfo);
    } else {
      // Default strategy - by distance
      this.dragInfo.selectDefault();
    }

    // Call onDragUpdate with final positions (at 'drop' stage)
    this.currentDragHandler.onDragUpdate(event, this.dragInfo);

    // Then call the drag end handler
    this.currentDragHandler.onDragEnd(event, this.dragInfo);

    // Emit drag-end event
    this.graph.emit("drag-end", { dragInfo: this.dragInfo });

    // Reset state
    this.currentDragHandler = undefined;
    this.isDragging = false;
    this.lastMouseEvent = undefined;
    this.dragInfo.reset();
  }

  /**
   * Checks if dragging is currently in progress
   * @returns true if dragging is in progress
   */
  public isDragInProgress(): boolean {
    return this.isDragging;
  }

  /**
   * Gets the current dragged component
   * @returns current DragHandler or undefined
   */
  public getCurrentDragHandler(): DragHandler | undefined {
    return this.currentDragHandler;
  }

  /**
   * Gets current drag information
   * @returns DragInfo instance (always available)
   */
  public getCurrentDragInfo(): DragInfo {
    return this.dragInfo;
  }

  /**
   * Starts continuous component updates for synchronization with camera movement
   * @returns void
   */
  private startContinuousUpdate(): void {
    if (this.updateScheduler) {
      return;
    }

    const update = () => {
      if (!this.isDragging || !this.currentDragHandler || !this.lastMouseEvent) {
        return;
      }

      // Create synthetic mouse event with current coordinates
      // This allows components to update their position during camera movement
      // even when physical mouse movement doesn't occur
      const syntheticEvent = new MouseEvent("mousemove", {
        clientX: this.lastMouseEvent.clientX,
        clientY: this.lastMouseEvent.clientY,
        bubbles: false,
        cancelable: false,
      });

      // Copy pageX/pageY manually since they're not in MouseEventInit
      Object.defineProperty(syntheticEvent, "pageX", { value: this.lastMouseEvent.pageX });
      Object.defineProperty(syntheticEvent, "pageY", { value: this.lastMouseEvent.pageY });

      // Update DragInfo state for synthetic event
      this.dragInfo.update(this.lastMouseEvent);

      this.currentDragHandler.onDragUpdate(syntheticEvent, this.dragInfo);
    };

    // Use medium priority for updates to synchronize with camera movement
    this.updateScheduler = scheduler.addScheduler({ performUpdate: update }, ESchedulerPriority.MEDIUM);
  }

  /**
   * Stops continuous updates
   * @returns void
   */
  private stopContinuousUpdate(): void {
    if (this.updateScheduler) {
      this.updateScheduler();
      this.updateScheduler = undefined;
    }
  }

  /**
   * Starts dragListener to track mouse events
   * @param _initialEvent - Initial mouse event (unused)
   * @returns void
   */
  private startDragListener(_initialEvent: MouseEvent): void {
    const ownerDocument = this.graph.getGraphCanvas().ownerDocument;

    dragListener(ownerDocument)
      .on(EVENTS.DRAG_START, (event: MouseEvent) => {
        this.lastMouseEvent = event;
      })
      .on(EVENTS.DRAG_UPDATE, (event: MouseEvent) => {
        this.update(event);
      })
      .on(EVENTS.DRAG_END, (event: MouseEvent) => {
        this.end(event);
      });
  }

  /**
   * Forcibly ends current dragging (e.g., during unmounting)
   * @returns void
   */
  public forceEnd(): void {
    if (this.isDragging && this.lastMouseEvent) {
      this.end(this.lastMouseEvent);
    }
  }
}
