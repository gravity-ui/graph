import { signal } from "@preact/signals-core";

import type { GraphComponent } from "../../components/canvas/GraphComponent";
import type { Graph } from "../../graph";
import { isGraphEvent } from "../../graphEvents";
import type { GraphMouseEvent } from "../../graphEvents";
import { ECanDrag } from "../../store/settings";
import { Emitter } from "../../utils/Emitter";
import { getXY } from "../../utils/functions";
import { dragListener, stopDragListening } from "../../utils/functions/dragListener";
import { EVENTS } from "../../utils/types/events";

import type { DragContext, DragDiff, DragOperationCallbacks, DragOperationOptions, DragState } from "./types";

/**
 * DragService manages drag operations for all draggable GraphComponents.
 *
 * When a user starts dragging a component:
 * 1. Collects all selected draggable components from SelectionService
 * 2. Manages the drag lifecycle (start, update, end) via dragListener
 * 3. Handles autopanning, cursor locking, and camera-change synchronization
 * 4. Delegates actual movement logic to components via handleDragStart/handleDrag/handleDragEnd
 *
 * A drag is cancelled instead of ended by cancel(), window blur, the page becoming hidden,
 * or a new press after a lost mouseup. Participants then get handleDragCancel.
 */
export class DragService {
  /** Components participating in the current drag operation */
  private dragComponents: GraphComponent[] = [];

  /** Starting coordinates in world space */
  private startCoords: [number, number] | null = null;

  /** Previous frame coordinates in world space */
  private prevCoords: [number, number] | null = null;

  /** Current drag listener emitter (null when not dragging) */
  private currentDragEmitter: Emitter | null = null;

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

  constructor(private graph: Graph) {}

  /**
   * Create idle (not dragging) state
   */
  private createIdleState(): DragState {
    return {
      isDragging: false,
      initialEvent: null,
      currentEvent: null,
      components: [],
      componentTypes: new Set(),
      isMultiple: false,
      isHomogeneous: true,
      startCoords: null,
      currentCoords: null,
    };
  }

  /**
   * Create active drag state from components
   */
  private createDragState(event: MouseEvent, components: GraphComponent[], startCoords: [number, number]): DragState {
    const componentTypes = new Set(components.map((c) => c.constructor.name));
    return {
      isDragging: true,
      initialEvent: event,
      currentEvent: event,
      components,
      componentTypes,
      isMultiple: components.length > 1,
      isHomogeneous: componentTypes.size <= 1,
      startCoords,
      currentCoords: startCoords,
    };
  }

  /**
   * Cleanup when service is destroyed
   */
  public destroy(): void {
    this.cleanup();
  }

  /**
   * Handle mousedown on graph - determine if drag should start
   */
  public handleMouseDown = (event: GraphMouseEvent): void => {
    // Prevent initiating new drag while one is already in progress
    // Check actual drag state, not just emitter presence (emitter may exist but drag not started yet)
    if (this.currentDragEmitter && this.$state.value.isDragging) {
      return;
    }

    const canDrag = this.graph.rootStore.settings.$canDrag.value;

    // If drag is disabled, don't start drag operation
    if (canDrag === ECanDrag.NONE) {
      return;
    }

    const target = event.detail.target as GraphComponent | undefined;

    if (!target || typeof target.isDraggable !== "function" || !target.isDraggable()) {
      return;
    }

    // Collect all draggable components that should participate
    this.dragComponents = this.collectDragComponents(target, canDrag);

    if (this.dragComponents.length === 0) {
      return;
    }

    if (isGraphEvent(event)) {
      event.stopGraphEventPropagation();
    }

    // Reset stale emitter from previous mousedown that didn't result in drag
    this.currentDragEmitter = null;

    // Use dragListener for consistent drag behavior
    const doc = this.graph.getGraphCanvas().ownerDocument;
    this.currentDragEmitter = dragListener(doc, {
      graph: this.graph,
      dragCursor: "grabbing",
      autopanning: true,
    })
      .on(EVENTS.DRAG_START, this.handleDragStart)
      .on(EVENTS.DRAG_UPDATE, this.handleDragUpdate)
      .on(EVENTS.DRAG_END, this.handleDragEnd)
      .on(EVENTS.DRAG_CANCEL, this.handleDragCancel);
  };

  /**
   * Cancels the current component drag, e.g. on Escape.
   *
   * Participants get handleDragCancel with the last coordinates the drag reached instead of handleDragEnd.
   * The cursor and auto-panning are released, $state returns to idle, and the rest of the gesture is ignored.
   * Does nothing if no component drag is in progress.
   *
   * Operations started with startDrag() are cancelled through the emitter it returns.
   */
  public cancel(): void {
    const emitter = this.currentDragEmitter;
    if (!emitter) {
      return;
    }
    stopDragListening(emitter);
    // The press has not crossed the drag threshold yet: nobody was notified, just drop it
    if (this.currentDragEmitter === emitter) {
      this.cleanup();
    }
  }

  /**
   * Collect all components that should participate in drag operation.
   * Behavior depends on canDrag setting:
   * - ALL: If target is in selection, drag all selected draggable components. Otherwise drag only target.
   * - ONLY_SELECTED: Only selected components can be dragged. If target is not selected, returns empty array.
   */
  private collectDragComponents(target: GraphComponent, canDrag: ECanDrag): GraphComponent[] {
    const selectedComponents = this.graph.selectionService.$selectedComponents.value;

    // Check if target is among selected components
    const targetInSelection = selectedComponents.some((c) => c === target);

    if (canDrag === ECanDrag.ONLY_SELECTED) {
      // In ONLY_SELECTED mode, target must be in selection to start drag
      if (!targetInSelection) {
        return [];
      }
      // Drag all selected draggable components
      return selectedComponents.filter((c) => typeof c.isDraggable === "function" && c.isDraggable());
    }

    // ALL mode: if target is in selection, drag all selected draggable components
    if (targetInSelection && selectedComponents.length > 0) {
      return selectedComponents.filter((c) => typeof c.isDraggable === "function" && c.isDraggable());
    }

    // Target is not in selection - drag only target
    return [target];
  }

  /**
   * Handle drag start from dragListener
   */
  private handleDragStart = (event: MouseEvent): void => {
    // Calculate starting coordinates in world space
    const coords = this.getWorldCoords(event);
    this.startCoords = coords;
    this.prevCoords = coords;

    // Update reactive state with event and coordinates
    this.$state.value = this.createDragState(event, this.dragComponents, coords);

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
  };

  /**
   * Handle drag update from dragListener
   */
  private handleDragUpdate = (event: MouseEvent): void => {
    if (!this.startCoords || !this.prevCoords) {
      return;
    }

    const currentCoords = this.getWorldCoords(event);

    // Update reactive state with current event and coordinates
    this.$state.value = {
      ...this.$state.value,
      currentEvent: event,
      currentCoords,
    };

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

    this.dragComponents.forEach((component) => {
      component.handleDrag(diff, context);
    });

    this.prevCoords = currentCoords;
  };

  /**
   * Handle drag end from dragListener
   */
  private handleDragEnd = (event: MouseEvent): void => {
    try {
      if (this.startCoords && this.prevCoords) {
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
    } finally {
      this.finishDrag();
    }
  };

  /**
   * Handle drag cancel from dragListener. The last coordinates that participants got stand in for the release point.
   */
  private handleDragCancel = (event: MouseEvent): void => {
    try {
      if (this.startCoords && this.prevCoords) {
        const context: DragContext = {
          sourceEvent: event,
          startCoords: this.startCoords,
          prevCoords: this.prevCoords,
          currentCoords: this.prevCoords,
          components: this.dragComponents,
        };

        this.dragComponents.forEach((component) => {
          component.handleDragCancel(context);
        });
      }
    } finally {
      this.finishDrag();
    }
  };

  /**
   * Emits the last batched block geometry and resets the service, even if a participant hook has thrown
   */
  private finishDrag(): void {
    try {
      this.graph.rootStore.blocksList.flushBatchedBlocksGeometryEmit();
    } finally {
      this.cleanup();
    }
  }

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
    // Reset state
    this.currentDragEmitter = null;
    this.dragComponents = [];
    this.startCoords = null;
    this.prevCoords = null;
    if (this.unsubscribeMouseDown) {
      this.unsubscribeMouseDown();
      this.unsubscribeMouseDown = null;
    }

    // Update reactive state
    this.$state.value = this.createIdleState();
  }

  /**
   * Start a custom drag operation for specialized use cases like creating connections or new blocks.
   * This provides a unified API for drag operations without exposing dragListener directly.
   *
   * The operation is cancelled by window blur, the page becoming hidden, a new press after a lost mouseup,
   * or stopDragListening() on the returned emitter. It then calls onCancel, or onEnd if onCancel is not provided,
   * with the last mouse event and coordinates of the drag.
   *
   * @param callbacks - Lifecycle callbacks (onStart, onUpdate, onEnd, onCancel)
   * @param options - Drag options (document, cursor, autopanning, etc.)
   *
   * @example
   * ```typescript
   * // In ConnectionLayer
   * graph.dragService.startOperation(
   *   {
   *     onStart: (event, coords) => this.onStartConnection(event, coords),
   *     onUpdate: (event, coords) => this.onMoveConnection(event, coords),
   *     onEnd: (event, coords) => this.onEndConnection(coords),
   *   },
   *   { cursor: "crosshair", autopanning: true }
   * );
   * ```
   */
  public startDrag(callbacks: DragOperationCallbacks, options: DragOperationOptions = {}) {
    const {
      document: doc,
      cursor,
      autopanning = true,
      stopOnMouseLeave,
      threshold,
      initialEvent,
      suppressTextSelection,
    } = options;
    const { onStart, onUpdate, onEnd, onCancel = onEnd } = callbacks;

    const targetDocument = doc ?? this.graph.getGraphCanvas().ownerDocument;

    return dragListener(targetDocument, {
      graph: this.graph,
      dragCursor: cursor,
      autopanning,
      stopOnMouseLeave,
      threshold,
      suppressTextSelection,
    })
      .on(EVENTS.DRAG_START, (event: MouseEvent) => {
        onStart?.(event, initialEvent ? this.getWorldCoords(initialEvent) : this.getWorldCoords(event));
      })
      .on(EVENTS.DRAG_UPDATE, (event: MouseEvent) => {
        const coords = this.getWorldCoords(event);
        onUpdate?.(event, coords);
      })
      .on(EVENTS.DRAG_END, (event: MouseEvent) => {
        const coords = this.getWorldCoords(event);
        onEnd?.(event, coords);
      })
      .on(EVENTS.DRAG_CANCEL, (event: MouseEvent) => {
        const coords = this.getWorldCoords(event);
        onCancel?.(event, coords);
      });
  }
}
