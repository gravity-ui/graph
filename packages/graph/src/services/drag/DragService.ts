import { signal } from "@preact/signals-core";

import { GraphComponent } from "../../components/canvas/GraphComponent";
import type { Graph } from "../../graph";
import { ECanDrag } from "../../store/settings";
import { isMetaKeyEvent } from "../../utils/functions";
import { EVENTS } from "../../utils/types/events";
import type { CameraPoint } from "../camera/CameraPoint";
import type { DragSessionOptions } from "../input/dragSession";
import { DragEmitter, createDragSession, stopDragListening } from "../input/dragSession";
import type { GraphDragOperation } from "../input/press";

import { runEach } from "./runEach";
import type { DragContext, DragDiff, DragOperationCallbacks, DragOperationOptions, DragState } from "./types";
import { findDragTarget } from "./utils/findDragTarget";

/**
 * DragService manages drag operations for all draggable GraphComponents.
 *
 * When a user starts dragging a component:
 * 1. Collects all selected draggable components from SelectionService
 * 2. Runs the drag session for the initiating pointer
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
  private createIdleState(cancelled = false): DragState {
    return {
      isDragging: false,
      cancelled,
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
  private createDragState(event: PointerEvent, components: GraphComponent[], startCoords: [number, number]): DragState {
    const componentTypes = new Set(components.map((c) => c.constructor.name));
    return {
      isDragging: true,
      cancelled: false,
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
   * Started drags receive their cancellation callbacks with the last pointer position.
   */
  public cancel(): void {
    this.graph.input.suppressPendingDrags();
    this.cancelDrags(true);
  }

  private cancelDrags(fallbackToEnd: boolean): void {
    const emitters = [...this.operationEmitters];
    if (this.currentDragEmitter) emitters.unshift(this.currentDragEmitter);
    runEach(emitters, (emitter) => stopDragListening(emitter, fallbackToEnd));
  }

  /** @internal The recognizer calls this after the drag threshold and claim arbitration. */
  public startDefaultDrag(
    hit: GraphComponent | undefined,
    down: PointerEvent,
    move: PointerEvent,
    start: CameraPoint,
    signal: AbortSignal
  ): "camera" | "component" | undefined {
    if (signal.aborted || this.currentDragEmitter) return undefined;
    const settings = this.graph.rootStore.settings;
    const target = findDragTarget(hit);
    if (down.button === 1 || !target) {
      if (settings.getConfigFlag("canDragCamera") && !isMetaKeyEvent(down)) {
        this.graph.getGraphLayer().$.camera?.startPan(hit, down, move, signal);
        return "camera";
      }
      return undefined;
    }

    const canDrag = settings.$canDrag.peek();
    if (canDrag === ECanDrag.NONE || !target.isEntityAvailable()) return undefined;
    const components = this.collectDragComponents(target, canDrag);
    if (!components.length) return undefined;

    this.dragComponents = components;
    const session = createDragSession(this.graph.getGraphCanvas().ownerDocument, {
      graph: this.graph,
      initialEvent: down,
      component: hit,
      cursor: "grabbing",
      autopanning: true,
      signals: [signal],
      onSessionEnd: (cancelled) => this.cleanup(cancelled),
    });
    this.currentDragEmitter = session
      .on(EVENTS.DRAG_START, () => this.handleDragStart(down, [start.world.x, start.world.y]))
      .on(EVENTS.DRAG_UPDATE, this.handleDragUpdate)
      .on(EVENTS.DRAG_END, (event) => this.finishComponentDrag(event, false))
      .on(EVENTS.DRAG_CANCEL, (event) => this.finishComponentDrag(event, true));
    session.start(move);
    return "component";
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
      return selectedComponents.filter((c) => c.isEntityAvailable() && c.isDraggable());
    }

    // ALL mode: if target is in selection, drag all selected draggable components
    if (targetInSelection && selectedComponents.length > 0) {
      return selectedComponents.filter((c) => c.isEntityAvailable() && c.isDraggable());
    }

    // Target is not in selection - drag only target
    return [target];
  }

  private handleDragStart = (event: PointerEvent, coords: [number, number]): void => {
    const emitter = this.currentDragEmitter;
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
    // Raise the participants in scene order.
    this.graph.scene.batchRaises(() => {
      for (const component of this.dragComponents) {
        if (this.currentDragEmitter !== emitter) break;
        if (component.isEntityAvailable()) component.handleDragStart(context);
      }
    });
  };

  private handleDragUpdate = (event: PointerEvent): void => {
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
  private finishComponentDrag(event: PointerEvent, cancelled: boolean): void {
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
  private getWorldCoords(event: PointerEvent): [number, number] {
    const { x, y } = this.graph.getPointInCameraSpace(event).world;
    return [x, y];
  }

  /**
   * Cleanup after drag operation ends
   */
  private cleanup(cancelled: boolean): void {
    // Reset state
    this.currentDragEmitter = null;
    this.dragComponents = [];
    this.startCoords = null;
    this.prevCoords = null;
    // Update reactive state
    if (this.$state.peek().isDragging) this.$state.value = this.createIdleState(cancelled);
  }

  /**
   * Start a drag on a separately operated surface, such as a minimap. Scene tools claim `dragstart`.
   *
   * @param callbacks - Lifecycle callbacks (onStart, onUpdate, onEnd, onCancel)
   * @param options - Drag options (document, cursor, autopanning, etc.)
   *
   * @returns The drag handle. Call `handle.emit("cancel")` to stop only this operation and call
   * its optional `onCancel` callback. Use `cancel()` to stop all operations.
   *
   * @example
   * ```typescript
   * // In a minimap's native pointerdown handler, after reserving the event for the minimap
   * const handle = graph.dragService.startDrag(
   *   {
   *     onStart: (event, coords) => this.beginNavigation(event, coords),
   *     onUpdate: (event, coords) => this.updateNavigation(event, coords),
   *     onEnd: (event, coords) => this.endNavigation(coords),
   *   },
   *   { initialEvent: pointerDown, cursor: "move", autopanning: false }
   * );
   * // On Escape
   * handle.emit("cancel");
   * ```
   */
  public startDrag(callbacks: DragOperationCallbacks, options: DragOperationOptions = {}): DragEmitter {
    let origin = options.initialEvent;
    const threshold = options.threshold ?? this.graph.rootStore.settings.$dragThreshold.peek();
    return this.createOperation(callbacks, {
      ...options,
      startOnMove(event) {
        origin ??= event;
        return Math.hypot(event.clientX - origin.clientX, event.clientY - origin.clientY) >= threshold;
      },
    });
  }

  /** @internal The winner receives the threshold-crossing move after every dragstart listener has returned. */
  public startClaimedDrag(
    operation: GraphDragOperation,
    initialEvent: PointerEvent,
    move: PointerEvent,
    start: CameraPoint,
    ...signals: (AbortSignal | undefined)[]
  ): void {
    if (signals.some((signal) => signal?.aborted)) return;
    const session = this.createOperation(
      { onStart: operation.start, onUpdate: operation.move, onEnd: operation.end, onCancel: operation.cancel },
      { ...operation, initialEvent, signals },
      start
    );
    session.start(move);
  }

  private createOperation(
    callbacks: DragOperationCallbacks,
    options: DragOperationOptions & Pick<DragSessionOptions, "startOnMove" | "signals">,
    start?: CameraPoint
  ) {
    const { document: doc, initialEvent } = options;
    const { onStart, onUpdate, onEnd, onCancel } = callbacks;
    const emitter = createDragSession(doc ?? this.graph.getGraphCanvas().ownerDocument, {
      ...options,
      graph: this.graph,
      onSessionEnd: () => this.operationEmitters.delete(emitter),
    });
    this.operationEmitters.add(emitter);

    emitter
      .on(EVENTS.DRAG_START, (event) => {
        onStart?.(event, start ? [start.world.x, start.world.y] : this.getWorldCoords(initialEvent ?? event));
      })
      .on(EVENTS.DRAG_UPDATE, (event, cause) => {
        onUpdate?.(event, this.getWorldCoords(event), cause);
      })
      .on(EVENTS.DRAG_END, (event) => {
        onEnd?.(event, this.getWorldCoords(event));
      })
      .on(EVENTS.DRAG_CANCEL, (event, fallbackToEnd) => {
        const callback = onCancel ?? (fallbackToEnd ? onEnd : undefined);
        return callback?.(event, this.getWorldCoords(event));
      });
    return emitter;
  }
}
