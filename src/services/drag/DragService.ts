import { signal } from "@preact/signals-core";

import type { GraphComponent } from "../../components/canvas/GraphComponent";
import type { Graph } from "../../graph";
import type { GraphMouseEvent } from "../../graphEvents";
import { getXY } from "../../utils/functions";

import type { DragContext, DragDiff, DragState } from "./types";

/**
 * DragService manages drag operations for all draggable GraphComponents.
 *
 * When a user starts dragging a component:
 * 1. Collects all selected draggable components from SelectionService
 * 2. Manages the drag lifecycle (start, update, end)
 * 3. Handles autopanning, cursor locking, and camera-change synchronization
 * 4. Delegates actual movement logic to components via handleDragStart/handleDrag/handleDragEnd
 */
export class DragService {
  /** Whether a drag operation is currently in progress */
  private dragging = false;

  /** Components participating in the current drag operation */
  private dragComponents: GraphComponent[] = [];

  /** Starting coordinates in world space */
  private startCoords: [number, number] | null = null;

  /** Previous frame coordinates in world space */
  private prevCoords: [number, number] | null = null;

  /** Last mouse event for camera-change re-emission */
  private lastMouseEvent: MouseEvent | null = null;

  /** Reference to document for event listeners */
  private doc: Document | null = null;

  /** Unsubscribe function for graph mousedown event */
  private unsubscribeMouseDown: (() => void) | null = null;

  /**
   * Reactive signal with current drag state.
   * Use this to react to drag state changes, e.g. to disable certain behaviors during multi-component drag.
   *
   * @example
   * ```typescript
   * // Check if drag is happening with multiple heterogeneous components
   * if (graph.dragService.$state.value.isDragging && !graph.dragService.$state.value.isHomogeneous) {
   *   // Disable snap to grid
   * }
   * ```
   */
  public readonly $state = signal<DragState>(this.createIdleState());

  constructor(private graph: Graph) {
    this.unsubscribeMouseDown = graph.on("mousedown", this.handleMouseDown, {
      capture: true,
    });
  }

  /**
   * Create idle (not dragging) state
   */
  private createIdleState(): DragState {
    return {
      isDragging: false,
      components: [],
      componentTypes: new Set(),
      isMultiple: false,
      isHomogeneous: true,
    };
  }

  /**
   * Create active drag state from components
   */
  private createDragState(components: GraphComponent[]): DragState {
    const componentTypes = new Set(components.map((c) => c.constructor.name));
    return {
      isDragging: true,
      components,
      componentTypes,
      isMultiple: components.length > 1,
      isHomogeneous: componentTypes.size <= 1,
    };
  }

  /**
   * Cleanup when service is destroyed
   */
  public destroy(): void {
    this.cleanup();
    if (this.unsubscribeMouseDown) {
      this.unsubscribeMouseDown();
      this.unsubscribeMouseDown = null;
    }
  }

  /**
   * Handle mousedown on graph - determine if drag should start
   */
  private handleMouseDown = (event: GraphMouseEvent): void => {
    // Prevent initiating new drag while one is already in progress or pending
    // this.doc being set indicates we're waiting for first mousemove
    if (this.dragging || this.doc) {
      return;
    }

    const target = event.detail.target as GraphComponent | undefined;

    if (!target || typeof target.isDraggable !== "function" || !target.isDraggable()) {
      return;
    }

    // Prevent camera drag when dragging components
    event.preventDefault();

    // Collect all draggable components that should participate
    this.dragComponents = this.collectDragComponents(target);

    if (this.dragComponents.length === 0) {
      return;
    }

    // Setup document listeners for drag tracking
    this.doc = this.graph.getGraphCanvas().ownerDocument;
    this.doc.addEventListener("mousemove", this.handleFirstMove, { once: true, capture: true });
    this.doc.addEventListener("mouseup", this.handleMouseUp, { once: true, capture: true });
  };

  /**
   * Collect all components that should participate in drag operation.
   * If target is in selection, drag all selected draggable components.
   * If target is not in selection, drag only the target.
   */
  private collectDragComponents(target: GraphComponent): GraphComponent[] {
    const selectedComponents = this.graph.selectionService.$selectedComponents.value;

    // Check if target is among selected components
    const targetInSelection = selectedComponents.some((c) => c === target);

    if (targetInSelection && selectedComponents.length > 0) {
      // Drag all selected draggable components
      return selectedComponents.filter((c) => typeof c.isDraggable === "function" && c.isDraggable());
    }

    // Target is not in selection - drag only target
    return [target];
  }

  /**
   * Handle first mousemove - this initiates the actual drag
   */
  private handleFirstMove = (event: MouseEvent): void => {
    this.dragging = true;
    this.lastMouseEvent = event;

    // Update reactive state
    this.$state.value = this.createDragState(this.dragComponents);

    // Enable autopanning
    this.graph.cameraService.enableAutoPanning();

    // Lock cursor to grabbing
    this.graph.lockCursor("grabbing");

    // Subscribe to camera-change for autopanning synchronization
    this.graph.on("camera-change", this.handleCameraChange);

    // Calculate starting coordinates in world space
    const coords = this.getWorldCoords(event);
    this.startCoords = coords;
    this.prevCoords = coords;

    // Create context for drag start
    const context: DragContext = {
      sourceEvent: event,
      startCoords: coords,
      prevCoords: coords,
      currentCoords: coords,
      components: this.dragComponents,
    };

    // Notify all components about drag start
    this.dragComponents.forEach((component) => {
      component.handleDragStart(context);
    });

    // Continue listening for mousemove
    if (this.doc) {
      this.doc.addEventListener("mousemove", this.handleMouseMove, { capture: true });
    }
  };

  /**
   * Handle mousemove during drag
   */
  private handleMouseMove = (event: MouseEvent): void => {
    if (!this.dragging || !this.startCoords || !this.prevCoords) {
      return;
    }

    this.lastMouseEvent = event;
    this.emitDragUpdate(event);
  };

  /**
   * Emit drag update to all components
   */
  private emitDragUpdate(event: MouseEvent): void {
    if (!this.startCoords || !this.prevCoords) {
      return;
    }

    const currentCoords = this.getWorldCoords(event);

    const diff: DragDiff = {
      startCoords: this.startCoords,
      prevCoords: this.prevCoords,
      currentCoords,
      diffX: currentCoords[0] - this.startCoords[0],
      diffY: currentCoords[1] - this.startCoords[1],
      deltaX: currentCoords[0] - this.prevCoords[0],
      deltaY: currentCoords[1] - this.prevCoords[1],
    };

    const context: DragContext = {
      sourceEvent: event,
      startCoords: this.startCoords,
      prevCoords: this.prevCoords,
      currentCoords,
      components: this.dragComponents,
    };

    // Notify all components about drag update
    this.dragComponents.forEach((component) => {
      component.handleDrag(diff, context);
    });

    this.prevCoords = currentCoords;
  }

  /**
   * Handle mouseup - end drag operation
   */
  private handleMouseUp = (event: MouseEvent): void => {
    if (this.dragging && this.startCoords && this.prevCoords) {
      const currentCoords = this.getWorldCoords(event);

      const context: DragContext = {
        sourceEvent: event,
        startCoords: this.startCoords,
        prevCoords: this.prevCoords,
        currentCoords,
        components: this.dragComponents,
      };

      // Notify all components about drag end
      this.dragComponents.forEach((component) => {
        component.handleDragEnd(context);
      });
    }

    this.cleanup();
  };

  /**
   * Handle camera-change during drag for autopanning synchronization
   */
  private handleCameraChange = (): void => {
    if (this.dragging && this.lastMouseEvent) {
      // Re-emit drag update with last known mouse position
      // This ensures components update their positions when camera moves during autopanning
      this.emitDragUpdate(this.lastMouseEvent);
    }
  };

  /**
   * Convert screen coordinates to world coordinates
   */
  private getWorldCoords(event: MouseEvent): [number, number] {
    const canvas = this.graph.getGraphCanvas();
    const [screenX, screenY] = getXY(canvas, event);
    return this.graph.cameraService.applyToPoint(screenX, screenY) as [number, number];
  }

  /**
   * Cleanup after drag operation ends
   */
  private cleanup(): void {
    // Remove event listeners
    if (this.doc) {
      this.doc.removeEventListener("mousemove", this.handleFirstMove, { capture: true });
      this.doc.removeEventListener("mousemove", this.handleMouseMove, { capture: true });
      this.doc.removeEventListener("mouseup", this.handleMouseUp, { capture: true });
    }

    // Unsubscribe from camera-change
    this.graph.off("camera-change", this.handleCameraChange);

    // Disable autopanning
    if (this.dragging) {
      this.graph.cameraService.disableAutoPanning();
      this.graph.unlockCursor();
    }

    // Reset state
    this.dragging = false;
    this.dragComponents = [];
    this.startCoords = null;
    this.prevCoords = null;
    this.lastMouseEvent = null;
    this.doc = null;

    // Update reactive state
    this.$state.value = this.createIdleState();
  }
}
