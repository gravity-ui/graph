import { signal } from "@preact/signals-core";

import { GraphComponent } from "../../components/canvas/GraphComponent";
import type { Graph } from "../../graph";
import { isGraphEvent } from "../../graphEvents";
import type { GraphMouseEvent } from "../../graphEvents";
import { ECanDrag } from "../../store/settings";
import { getXY } from "../../utils/functions";
import { DragEmitter, dragListener, stopDragListening } from "../../utils/functions/dragListener";
import { EVENTS } from "../../utils/types/events";

import type { DragContext, DragDiff, DragOperationCallbacks, DragOperationOptions, DragState } from "./types";
import { findDragTarget } from "./utils/findDragTarget";

/** Complete every cleanup even if a drag callback throws. */
function runEach<T>(items: Iterable<T>, action: (item: T) => void): void {
  let failure: { error: unknown } | undefined;
  for (const item of items) {
    try {
      action(item);
    } catch (error) {
      failure ??= { error };
    }
  }
  if (failure) throw failure.error;
}

/**
 * DragService manages drag operations for all draggable GraphComponents.
 *
 * When a user starts dragging a component:
 * 1. Collects all selected draggable components from SelectionService
 * 2. Manages the drag lifecycle (start, update, end) via dragListener
 * 3. Handles autopanning, cursor locking, and camera-change synchronization
 * 4. Delegates actual movement logic to components via handleDragStart/handleDrag/handleDragEnd
 */
export class DragService {
  /** Components participating in the current drag operation */
  private dragComponents: GraphComponent[] = [];

  /** Starting coordinates in world space */
  private startCoords: [number, number] | null = null;

  /** Previous frame coordinates in world space */
  private prevCoords: [number, number] | null = null;

  /** Current drag listener emitter (null when not dragging) */
  private currentDragEmitter: DragEmitter | null = null;

  /** Custom operations, including presses that have not crossed the threshold. */
  private readonly operationEmitters = new Set<DragEmitter>();

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
    this.cancelDrags(false);
  }

  /**
   * Cancels the component drag and custom operations that are running or awaiting movement.
   * Started drags receive their cancellation callbacks with the last mouse position.
   */
  public cancel(): void {
    this.cancelDrags(true);
  }

  private cancelDrags(fallbackToEnd: boolean): void {
    const emitters = [...this.operationEmitters];
    if (this.currentDragEmitter) emitters.unshift(this.currentDragEmitter);
    runEach(emitters, (emitter) => stopDragListening(emitter, fallbackToEnd));
  }

  /**
   * Handle mousedown on graph - determine if drag should start.
   *
   * The press drags its drag target (`findDragTarget`, D8, as in the DOM): the pressed component when it is draggable,
   * else its nearest draggable ancestor, so a press on a child button inside a block drags the block. Without a drag
   * target, or when it is not available, nothing happens. Otherwise the drag target goes on to `collectDragComponents`
   * (the selection rules of `ALL` and `ONLY_SELECTED`). A press that has components to drag is taken: it stops the
   * graph event's propagation, so GraphLayer gives it to no component, the pressed one and the drag target included.
   * The release and the click are dispatched separately and still reach the pressed component.
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

    const target = findDragTarget(event.detail.target);

    if (!target || !target.isEntityAvailable()) {
      return;
    }

    // Collect all draggable components that should participate
    const dragComponents = this.collectDragComponents(target, canDrag);

    if (dragComponents.length === 0) {
      return;
    }

    if (isGraphEvent(event)) {
      event.stopGraphEventPropagation();
    }

    // A synthetic graph press may replace a pending gesture without a native mousedown.
    if (this.currentDragEmitter) stopDragListening(this.currentDragEmitter);
    this.dragComponents = dragComponents;

    // Use dragListener for consistent drag behavior
    const doc = this.graph.getGraphCanvas().ownerDocument;
    this.currentDragEmitter = dragListener(doc, {
      graph: this.graph,
      dragCursor: "grabbing",
      autopanning: true,
      onSessionEnd: () => this.cleanup(),
    })
      .on(EVENTS.DRAG_START, this.handleDragStart)
      .on(EVENTS.DRAG_UPDATE, this.handleDragUpdate)
      .on(EVENTS.DRAG_END, (event) => this.finishComponentDrag(event, false))
      .on(EVENTS.DRAG_CANCEL, (event) => this.finishComponentDrag(event, true));
  };

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
      return selectedComponents.filter((c) => c.isEntityAvailable() && c.isDraggable());
    }

    // ALL mode: if target is in selection, drag all selected draggable components
    if (targetInSelection && selectedComponents.length > 0) {
      return selectedComponents.filter((c) => c.isEntityAvailable() && c.isDraggable());
    }

    // Target is not in selection - drag only target
    return [target];
  }

  /**
   * Handle drag start from dragListener
   */
  private handleDragStart = (event: MouseEvent): void => {
    const emitter = this.currentDragEmitter;
    // Calculate starting coordinates in world space
    const coords = this.getWorldCoords(event);
    this.startCoords = coords;
    this.prevCoords = coords;

    // Update reactive state with event and coordinates
    this.$state.value = this.createDragState(event, this.dragComponents, coords);
    if (this.currentDragEmitter !== emitter) return;

    // Create context for drag start
    const context: DragContext = {
      sourceEvent: event,
      startCoords: coords,
      prevCoords: coords,
      currentCoords: coords,
      components: this.dragComponents,
    };

    // Notify all components about drag start
    // One raise of all the participants, in their scene order (decision 6).
    this.graph.scene.batchRaises(() => {
      for (const component of this.dragComponents) {
        if (this.currentDragEmitter !== emitter) break;
        if (component.isEntityAvailable()) component.handleDragStart(context);
      }
    });
  };

  /**
   * Handle drag update from dragListener
   */
  private handleDragUpdate = (event: MouseEvent): void => {
    if (!this.startCoords || !this.prevCoords) {
      return;
    }

    const emitter = this.currentDragEmitter;
    const currentCoords = this.getWorldCoords(event);

    // Update reactive state with current event and coordinates
    this.$state.value = {
      ...this.$state.value,
      currentEvent: event,
      currentCoords,
    };
    if (this.currentDragEmitter !== emitter) return;

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

    this.prevCoords = currentCoords;
    for (const component of this.dragComponents) {
      if (this.currentDragEmitter !== emitter) break;
      if (component.isEntityAvailable()) component.handleDrag(diff, context);
    }
  };

  /**
   * Complete the component gesture and flush the final batched block positions.
   */
  private finishComponentDrag(event: MouseEvent, cancelled: boolean): void {
    if (!this.startCoords || !this.prevCoords) return;

    const context: DragContext = {
      sourceEvent: event,
      startCoords: this.startCoords,
      prevCoords: this.prevCoords,
      currentCoords: cancelled ? this.prevCoords : this.getWorldCoords(event),
      components: this.dragComponents,
    };

    try {
      const hook = cancelled ? "handleDragCancel" : "handleDragEnd";
      runEach(this.dragComponents, (component) => {
        if (component.isEntityAvailable()) component[hook](context);
      });
    } finally {
      this.graph.rootStore.blocksList.flushBatchedBlocksGeometryEmit();
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
    // Update reactive state
    if (this.$state.peek().isDragging) this.$state.value = this.createIdleState();
  }

  /**
   * Start a custom drag operation for specialized use cases like creating connections or new blocks.
   * This provides a unified API for drag operations without exposing dragListener directly.
   *
   * @param callbacks - Lifecycle callbacks (onStart, onUpdate, onEnd, onCancel)
   * @param options - Drag options (document, cursor, autopanning, etc.)
   *
   * @returns The drag handle. Call `handle.emit("cancel")` to stop only this operation and call
   * its optional `onCancel` callback. Use `cancel()` to stop all operations.
   *
   * @example
   * ```typescript
   * // In a connection creation layer
   * const handle = graph.dragService.startDrag(
   *   {
   *     onStart: (event, coords) => this.onStartConnection(event, coords),
   *     onUpdate: (event, coords) => this.onMoveConnection(event, coords),
   *     onEnd: (event, coords) => this.onEndConnection(coords),
   *   },
   *   { cursor: "crosshair", autopanning: true }
   * );
   * // On Escape
   * handle.emit("cancel");
   * ```
   */
  public startDrag(callbacks: DragOperationCallbacks, options: DragOperationOptions = {}) {
    const {
      document: doc,
      cursor,
      component,
      autopanning = true,
      stopOnMouseLeave,
      threshold,
      initialEvent,
      suppressTextSelection,
    } = options;
    const { onStart, onUpdate, onEnd, onCancel } = callbacks;

    const targetDocument = doc ?? this.graph.getGraphCanvas().ownerDocument;

    const emitter = dragListener(targetDocument, {
      graph: this.graph,
      dragCursor: cursor,
      component,
      autopanning,
      stopOnMouseLeave,
      threshold,
      suppressTextSelection,
      onSessionEnd: () => this.operationEmitters.delete(emitter),
    });
    this.operationEmitters.add(emitter);

    return emitter
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
      .on(EVENTS.DRAG_CANCEL, (event, fallbackToEnd) => {
        const callback = onCancel ?? (fallbackToEnd ? onEnd : undefined);
        return callback?.(event, this.getWorldCoords(event));
      });
  }
}
