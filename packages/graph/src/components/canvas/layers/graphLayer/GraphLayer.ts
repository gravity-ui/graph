import { batch, signal } from "@preact/signals-core";
import type { ReadonlySignal } from "@preact/signals-core";

import { Graph } from "../../../../graph";
import { GraphMouseEventNames, isGraphEvent, isNativeGraphEventName } from "../../../../graphEvents";
import { Component } from "../../../../lib/Component";
import type { CoreComponent } from "../../../../lib/CoreComponent";
import { Layer, LayerContext, LayerProps } from "../../../../services/Layer";
import { Camera, TCameraProps } from "../../../../services/camera/Camera";
import { ICamera, TCameraState } from "../../../../services/camera/CameraService";
import type { TSceneLevel } from "../../../../services/scene/types";
import { getEventDelta, getXY } from "../../../../utils/functions";
import { Point } from "../../../../utils/types/shapes";
import { EventedComponent } from "../../EventedComponent/EventedComponent";
import type { TGraphHoverDetail } from "../../EventedComponent/EventedComponent";
import { recordEventTarget } from "../../EventedComponent/eventTarget";
import { GraphComponent } from "../../GraphComponent";
import { Blocks } from "../../blocks/Blocks";
import { BlockConnection } from "../../connections/BlockConnection";
import { BlockConnections } from "../../connections/BlockConnections";

export type TGraphLayerProps = LayerProps & {
  camera: ICamera;
  root?: HTMLElement;
};

export type TGraphLayerContext = LayerContext & {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  root?: HTMLElement;
  ownerDocument: Document;
  graph: Graph;
};

const rootBubblingEventTypes = new Set([
  "mousedown",
  "touchstart",
  "mouseup",
  "touchend",
  "click",
  "dblclick",
  "contextmenu",
]);
// const rootCapturingEventTypes = new Set(["mousedown", "touchstart", "mouseup", "touchend"]);

/**
 * How many graph frames a retarget hold lasts at most (`holdRetarget`): the end of the third frame releases it. An HTML
 * layer asks React for its views in the first graph frame after the level's change (graph-react's `BlocksList`, at the
 * highest priority), and React commits a default update in a task after that frame's callback, normally before the
 * next frame. The second frame is slack for a busy main thread; a commit that misses both (a suspended transition)
 * waits no longer.
 */
const RETARGET_HOLD_FRAMES = 3;

/** One `holdRetarget()`: the frame ends it may still wait through, and what to call when its bound releases it. */
type TRetargetHold = { framesLeft: number; readonly onExpire?: () => void };

export type GraphMouseEvent = CustomEvent<{
  target: EventedComponent | undefined;
  /** On the hover events: the other side of the target change. */
  relatedTarget?: EventedComponent;
  sourceEvent: MouseEvent;
  pointerPressed: boolean;
}>;

/** The nearest graph component above `component` (a block above its anchor or child), if any. */
function graphComponentAbove(component: EventedComponent): GraphComponent | undefined {
  for (let node: CoreComponent | undefined = component.getParent(); node; node = node.getParent()) {
    if (node instanceof GraphComponent) return node;
  }
  return undefined;
}

export class GraphLayer extends Layer<TGraphLayerProps, TGraphLayerContext> {
  public declare $: Component["$"] & { camera?: Camera };

  private camera: ICamera;

  private readonly hoveredComponent = signal<GraphComponent | undefined>(undefined);

  /**
   * The graph component under the pointer (or captured), `undefined` over the camera or empty space.
   * Written only by pointer handling; no tag follows it (components write their own `hoveredTag`, D5).
   */
  public readonly $hoveredComponent: ReadonlySignal<GraphComponent | undefined> = this.hoveredComponent;

  private targetComponent?: EventedComponent;

  private prevTargetComponent?: EventedComponent;

  private canEmulateClick?: boolean;

  private pointerStartTarget?: EventedComponent;

  private pointerStartEvent?: MouseEvent;

  private pointerPressed = false;

  private eventByTargetComponent?: MouseEvent;

  private capturedTargetComponent?: EventedComponent;

  /**
   * Last known canvas-relative mouse coordinates, for camera-change emulation and retargeting: those of the last move
   * that queried the target, unless a later move waits in `pendingPointerEvent` (`readPointerCanvas`).
   */
  private lastMouseCanvasX?: number;

  private lastMouseCanvasY?: number;

  /**
   * The latest move the 3 px throttle kept from a target query, raw: converted to canvas coordinates only when a
   * retarget, a capture's release or the camera emulation needs the position. Converting every short move would read
   * the canvas rect each time (a layout read); a cached rect would go stale on scroll.
   */
  private pendingPointerEvent?: MouseEvent;

  /** Set by `requestRetarget()`; the frame's end finds the target again (`retargetAtPointer`). */
  private retargetRequested = false;

  /** The holds `holdRetarget()` handed out and not released: while there is one, a requested retarget waits. */
  private readonly retargetHolds = new Set<TRetargetHold>();

  /**
   * The scene level of the last completed graph frame (recorded at its end, and at attach). A camera change whose level
   * differs from it crossed a level, whatever changed the level before (the camera or the strategy alone): with the
   * camera emulation on, it leaves the target to the level's retarget at the frame's end (settled item 11).
   */
  private frameLevel?: TSceneLevel;

  /** Whether the pointer is over the graph's root: set by its moves and presses, cleared when it leaves the root. */
  private pointerInside = false;

  /**
   * The nearest graph component above a target that unmounted (`forgetComponent`): the old side of the next target
   * change, so its hover ends when the pointer is not on it any more (round 3, finding 3).
   */
  private lostTargetOwner?: GraphComponent;

  constructor(props: TGraphLayerProps) {
    super({
      canvas: {
        zIndex: 2,
        classNames: ["no-user-select", "no-pointer-events"],
        transformByCameraPosition: true,
      },
      // HTML element creation is now separated into framework-specific layers
      ...props,
    });

    this.requireCanvas();

    this.camera = this.props.camera;

    this.performRender = this.performRender.bind(this);
  }

  public override getCanvas(): HTMLCanvasElement {
    return this.requireCanvas();
  }

  protected afterInit(): void {
    this.attachListeners();

    this.onSignal(this.context.graph.rootStore.blocksList.$blocks, () => {
      this.performRender();
    });
    this.onSignal(this.context.graph.rootStore.connectionsList.$connections, () => {
      this.performRender();
    });
    // A level change changes what is hit under a stationary pointer (`SceneComponent.isHitOnLevel`); a camera move
    // keeps today's rule (`emulateMouseEventsOnCameraChange`). The first call comes from subscribing: no change.
    let levelSubscribed = false;
    this.onSignal(this.context.graph.scene.$level, () => {
      if (levelSubscribed) this.requestRetarget();
      levelSubscribed = true;
    });
    // The target is found again once the frame's hit boxes are in the index: at the frame's end when the hit test has
    // nothing queued, else when it has processed its queue (it runs at the lowest priority, after the frame task).
    const { hitTest } = this.context.graph;
    const onHitTestUpdate = (): void => this.retargetAtPointer();
    this.frameLevel = this.context.graph.scene.$level.peek();
    const stopFrame = this.context.graph.scene.onFrameEnd(() => {
      this.ageRetargetHolds();
      if (!hitTest.hasPendingUpdates()) this.retargetAtPointer();
      this.frameLevel = this.context.graph.scene.$level.peek();
    });
    hitTest.on("update", onHitTestUpdate);
    this.eventAbortController.signal.addEventListener(
      "abort",
      () => {
        stopFrame();
        hitTest.off("update", onHitTestUpdate);
      },
      { once: true }
    );
    super.afterInit();
  }

  protected onCameraChange(camera: TCameraState): void {
    if (this.context.graph.rootStore.settings.getConfigFlag("emulateMouseEventsOnCameraChange")) {
      // Against the last completed frame's level, not against other effects of this change: order-free.
      this.onCameraChangeEmulateMouseEvents(camera, this.context.graph.scene.$level.peek() !== this.frameLevel);
    }
  }

  /**
   * Attaches DOM event listeners to the root element.
   * All event listeners are registered with the rootOn wrapper method to ensure they are properly cleaned up
   * when the layer is unmounted. This eliminates the need for manual event listener removal.
   */
  private attachListeners() {
    if (!this.root) return;

    rootBubblingEventTypes.forEach((type) => this.onRootEvent(type as keyof HTMLElementEventMap, this));
    // rootCapturingEventTypes.forEach((type) =>
    //   this.onRootEvent(type as keyof HTMLElementEventMap, this, { capture: true })
    // );
    this.onRootEvent("mousemove", this);
    this.onRootEvent("mouseleave", this);
  }

  /*
   * Capture element for future events
   * When element is captured, it will be used as target for future events
   * until releaseCapture is called
   * A graph component transparent to pointer events (`GraphComponent.transparentToEvents`) is not captured: the
   * pointer keeps its normal target.
   * @param component - element to capture
   */
  public captureEvents(component: EventedComponent) {
    if (component instanceof GraphComponent && component.isTransparentToEvents()) return;
    this.capturedTargetComponent = component;
  }

  public releaseCapture(): void {
    this.capturedTargetComponent = undefined;
    this.publishHovered();
    // What a still pointer hits may have changed during the gesture (a hold, the level, a move): find it again.
    if (this.pointerInside) this.requestRetarget();
    else this.changeTargetTo(undefined, new MouseEvent("mouseleave"));
  }

  /**
   * @internal Sets the hovered component outside pointer handling: a component that unmounts while hovered clears it,
   * and tests drive it.
   */
  public setHoveredComponent(component: GraphComponent | undefined): void {
    this.hoveredComponent.value = component;
  }

  /** @internal Drops an unmounted component from the pointer state, so no later event targets or re-publishes it. */
  public forgetComponent(component: EventedComponent): void {
    const wasTarget = this.targetComponent === component;
    // The nearest graph component above an unmounted target takes its place as the old side of the next change. A
    // parent's unmount() runs after its children's (`CoreComponent.__unmount`), so a parent forgotten next passes the
    // place on up.
    if (wasTarget || this.lostTargetOwner === component) this.lostTargetOwner = graphComponentAbove(component);
    if (wasTarget) this.targetComponent = undefined;
    if (this.prevTargetComponent === component) this.prevTargetComponent = undefined;
    if (this.pointerStartTarget === component) this.pointerStartTarget = undefined;
    if (this.capturedTargetComponent === component) this.capturedTargetComponent = undefined;
    if (this.hoveredComponent.peek() === component) this.hoveredComponent.value = undefined;
    if (wasTarget) this.requestRetarget();
  }

  /**
   * @internal What a still pointer may hit changed (settled item 11): a component hidden or unmounted, a hit box that
   * was set before changed (`GraphComponent.setHitBox`, `removeHitBox`), a child's hit levels, an HTML hold, the
   * level. The target is found again at the last pointer position at the end of the frame, or at the release of a
   * capture.
   */
  public requestRetarget(): void {
    this.retargetRequested = true;
  }

  /**
   * @internal Makes a requested retarget wait, until the returned release runs (once; later calls do nothing) or at
   * most `RETARGET_HOLD_FRAMES` graph frames: the end of the last of them releases the hold and calls `onExpire`. An
   * HTML layer holds it while the views of the detailed level mount (graph-react's `BlocksList`): until their holds
   * (`Block.delegateRender`) exist, a still pointer would lose what they show and take it back once they mount. The
   * request is kept meanwhile: the first frame's end after the last release finds the target again (a capture's
   * release waits as well). A commit that comes after the bound (a suspended transition) can still move the target
   * once more when its views mount: one late leave and enter.
   */
  public holdRetarget(onExpire?: () => void): () => void {
    const hold: TRetargetHold = { framesLeft: RETARGET_HOLD_FRAMES, onExpire };
    this.retargetHolds.add(hold);
    return (): void => {
      this.retargetHolds.delete(hold);
    };
  }

  /** At a frame's end: each hold has one frame less; those at their bound are released. */
  private ageRetargetHolds(): void {
    for (const hold of this.retargetHolds) {
      hold.framesLeft -= 1;
      if (hold.framesLeft > 0) continue;
      this.retargetHolds.delete(hold);
      hold.onExpire?.();
    }
  }

  private publishHovered(): void {
    const target = this.capturedTargetComponent ?? this.targetComponent;
    this.hoveredComponent.value = target instanceof GraphComponent ? target : undefined;
  }

  public handleEvent(e: Event): void {
    if (e.type === "mouseleave") {
      this.onRootLeave(e as MouseEvent);
      return;
    }
    if (e.type === "mousemove") {
      this.pointerInside = true;
      this.updateTargetComponent(e as MouseEvent);
      this.onRootPointerMove(e as MouseEvent);
      return;
    }
    switch (e.type) {
      case "mousedown":
      case "touchstart": {
        // A press on the root sets the pointer's position: the pointer is inside, also without a move before it (a
        // graph that appears under a still pointer). Touch does not set it.
        if (e.type === "mousedown") this.pointerInside = true;
        this.updateTargetComponent(e as MouseEvent, true);
        this.tryEmulateClick(e as MouseEvent);
        this.handleMouseDownEvent(e as MouseEvent);
        break;
      }
      case "mouseup":
      case "touchend": {
        this.tryEmulateClick(e as MouseEvent);
        this.onRootPointerEnd(e as MouseEvent);
        break;
      }
      case "click":
      case "dblclick": {
        this.tryEmulateClick(e as MouseEvent);
        break;
      }
    }

    return;
  }

  private dispatchNativeEvent(
    type: GraphMouseEventNames,
    event: MouseEvent | GraphMouseEvent,
    targetComponent?: EventedComponent,
    relatedTarget?: EventedComponent
  ): boolean {
    const hover = type === "mouseenter" || type === "mouseleave";
    const graphEvent = this.props.graph.emit(type, {
      target: targetComponent,
      ...(hover ? { relatedTarget } : {}),
      pointerPressed: this.pointerPressed,
      sourceEvent: event,
    });
    if (graphEvent.defaultPrevented) {
      event.preventDefault();
      return false;
    }
    if (isGraphEvent(graphEvent) && graphEvent.graphEventPropagationStopped) {
      return false;
    }
    return true;
  }

  /**
   * The dispatch boundary of a press, a release, a click and a dblclick: the event's target is recorded for this event
   * object first (`getEventTarget`), then the graph's event goes out, then the component's, which walks the parent
   * chain. The event itself is passed on unchanged.
   */
  private applyEventToTargetComponent(event: MouseEvent | GraphMouseEvent, target = this.targetComponent) {
    recordEventTarget(event, target);
    if (isNativeGraphEventName(event.type)) {
      if (!this.dispatchNativeEvent(event.type, event, target)) {
        return;
      }
    }
    if (!target || typeof target.dispatchEvent !== "function") return;

    target.dispatchEvent(event);
  }

  /**
   * One hover event of a target change (D5) at its side: its target is recorded (`getEventTarget`), then the graph's
   * event goes out (`mouseenter` and `mouseleave`, as before), then the component's, which walks the parent chain. A
   * side that does not exist gets no event at all: the first entry has nothing to leave, a root exit nothing to enter.
   */
  private dispatchHoverEvent(
    type: "mouseenter" | "mouseleave" | "mouseover" | "mouseout",
    target: EventedComponent | undefined,
    relatedTarget: EventedComponent | undefined,
    sourceEvent: MouseEvent
  ): void {
    if (!target) return;
    const detail: TGraphHoverDetail = { target, relatedTarget, sourceEvent, pointerPressed: this.pointerPressed };
    const event = new CustomEvent(type, { bubbles: type === "mouseover" || type === "mouseout", detail });
    recordEventTarget(event, target);
    if (isNativeGraphEventName(type) && !this.dispatchNativeEvent(type, event, target, relatedTarget)) return;
    target.dispatchEvent(event);
  }

  private updateTargetComponent(event: MouseEvent, force = false): void {
    // Check is event is too close to previous event
    // In case when previous event is too close to current event, we don't need to update target component
    // This is useful to prevent flickering when user is moving mouse fast
    if (!force && this.eventByTargetComponent && getEventDelta(event, this.eventByTargetComponent) < 3) {
      // Still the latest position, during a capture too: kept raw for a later retarget or release.
      this.pendingPointerEvent = event;
      return;
    }

    this.eventByTargetComponent = event;
    this.pendingPointerEvent = undefined;
    const point = this.context.graph.getPointInCameraSpace(event);
    // Canvas-relative coordinates for camera-change emulation and retargeting; kept during a capture too: the
    // retarget at its release uses the latest position.
    this.lastMouseCanvasX = point.canvas.x;
    this.lastMouseCanvasY = point.canvas.y;

    if (this.capturedTargetComponent) {
      this.targetComponent = this.capturedTargetComponent;
      this.publishHovered();
      return;
    }

    this.prevTargetComponent = this.targetComponent;
    this.targetComponent = this.context.graph.getElementOverPoint(point) || this.$.camera;
    this.publishHovered();
  }

  /** A target change without a new pointer move: the normal leave and enter of D5 (`onRootPointerMove`). */
  private changeTargetTo(next: EventedComponent | undefined, event: MouseEvent): void {
    // A forgotten target's owner still hears the change, also when the target stays none (a release outside).
    if (next === this.targetComponent && this.lostTargetOwner === undefined) return;
    this.prevTargetComponent = this.targetComponent;
    this.targetComponent = next;
    this.publishHovered();
    this.onRootPointerMove(event);
  }

  /**
   * The pointer's latest position in canvas coordinates: a move the throttle kept raw is converted first, once
   * (`pendingPointerEvent`). Undefined before any move or press.
   */
  private readPointerCanvas(): { x: number; y: number } | undefined {
    const pending = this.pendingPointerEvent;
    if (pending) {
      this.pendingPointerEvent = undefined;
      const [x, y] = getXY(this.getCanvas(), pending);
      this.lastMouseCanvasX = x;
      this.lastMouseCanvasY = y;
    }
    if (this.lastMouseCanvasX === undefined || this.lastMouseCanvasY === undefined) return undefined;
    return { x: this.lastMouseCanvasX, y: this.lastMouseCanvasY };
  }

  private retargetAtPointer(): void {
    if (!this.retargetRequested) return;
    // During a gesture the request waits: releaseCapture() finds the target again with the latest position.
    if (this.capturedTargetComponent) return;
    // While HTML views mount (`holdRetarget`): the frame's end after the last release finds it.
    if (this.retargetHolds.size > 0) return;
    this.retargetRequested = false;
    if (!this.pointerInside) return;
    const canvasPoint = this.readPointerCanvas();
    if (!canvasPoint) return;
    const point = this.context.camera.createCameraPoint(Point(canvasPoint.x, canvasPoint.y), "canvas");
    const next = this.context.graph.getElementOverPoint(point) || this.$.camera;
    this.changeTargetTo(next, new MouseEvent("mousemove", { bubbles: false, cancelable: false }));
  }

  /** The pointer left the graph's root: the target changes to none, unless a gesture holds the capture. */
  private onRootLeave(event: MouseEvent): void {
    this.pointerInside = false;
    this.eventByTargetComponent = undefined;
    this.pendingPointerEvent = undefined;
    // A captured gesture keeps its target; its release ends it outside (`releaseCapture`).
    if (this.capturedTargetComponent) return;
    this.changeTargetTo(undefined, event);
  }

  private onCameraChangeEmulateMouseEvents(camera: TCameraState, crossedLevel: boolean): void {
    // After the pointer left the root, a camera move finds no target at its last position.
    if (!this.pointerInside) return;
    if (this.capturedTargetComponent) return;
    if (crossedLevel || this.retargetHolds.size > 0) {
      // A level crossing is the level's retarget, at the frame's end: by then every effect of this change has run, an
      // HTML layer's hold (`holdRetarget`) included, whatever their order. While HTML views mount, a move within the
      // level waits for them as well. A move within one level otherwise emulates at once, as before.
      this.requestRetarget();
      return;
    }
    const canvasPoint = this.readPointerCanvas();
    if (!canvasPoint) return;

    const point = this.context.camera.createCameraPoint(Point(canvasPoint.x, canvasPoint.y), "canvas");
    const newTarget = this.context.graph.getElementOverPoint(point) || this.$.camera;

    if (newTarget === this.targetComponent) return;

    const fakeEvent = new MouseEvent("mousemove", {
      clientX: camera.x,
      clientY: camera.y,
      bubbles: false,
      cancelable: false,
    });

    this.prevTargetComponent = this.targetComponent;
    this.targetComponent = newTarget;
    this.publishHovered();
    this.onRootPointerMove(fakeEvent);
  }

  /**
   * The hover events of a target change (D5): `mouseleave` and `mouseout` at the old target, then `mouseenter` and
   * `mouseover` at the new one, each walking the parent chain, with `relatedTarget` naming the other side (none for
   * the camera). A target that unmounted got no event (`forgetComponent`): the nearest graph component above it is
   * the old side in its place, unless the pointer is on that one now, so a block whose removed child stuck out of it
   * hears the pointer leave. One batch, so the components' `hoveredTag` writes of the change reach the frame together:
   * a block whose pointer moves onto its anchor is never drawn un-hovered.
   */
  private onRootPointerMove(event: MouseEvent): void {
    const lost = this.lostTargetOwner;
    if (this.targetComponent === this.prevTargetComponent && lost === undefined) return;
    this.lostTargetOwner = undefined;
    const next = this.targetComponent;
    const prev = this.prevTargetComponent ?? (lost === next ? undefined : lost);
    const camera = this.$.camera;
    const other = (component: EventedComponent | undefined): EventedComponent | undefined =>
      component === camera ? undefined : component;
    batch(() => {
      this.dispatchHoverEvent("mouseleave", prev, other(next), event);
      this.dispatchHoverEvent("mouseout", prev, other(next), event);
      this.dispatchHoverEvent("mouseenter", next, other(prev), event);
      this.dispatchHoverEvent("mouseover", next, other(prev), event);
    });
  }

  private handleMouseDownEvent = (event: MouseEvent) => {
    return this.onRootPointerStart(event);
  };

  private onRootPointerStart(event: MouseEvent) {
    if (event.button === 2 /* Mouse right button */) {
      /*
       * used contextmenu event to prevent native menu
       * see .onContextMenuEvent method
       *  */
      return;
    }

    this.pointerPressed = true;

    // Proxy event for components
    this.applyEventToTargetComponent(event);
  }

  private onRootPointerEnd(event: MouseEvent) {
    if (event.button === 2 /* Mouse right button */) {
      /*
       * used contextmenu event to prevent native menu
       * see .onContextMenuEvent method
       *  */
      return;
    }

    this.pointerPressed = false;

    // Proxy event for components
    this.applyEventToTargetComponent(event);
  }

  private tryEmulateClick(event: MouseEvent, target = this.targetComponent) {
    if ((event.type === "mousedown" || event.type === "touchstart") && target !== undefined) {
      this.canEmulateClick = false;
      this.pointerStartTarget = target;
      this.pointerStartEvent = event;
    }

    if (
      (event.type === "mouseup" || event.type === "touchend") &&
      (this.pointerStartTarget === target ||
        // connections can be very close to each other
        (this.pointerStartTarget instanceof BlockConnection && target instanceof BlockConnection)) &&
      // pointerStartEvent can be undefined if mousedown/touchstart event happened over dialog backdrop
      this.pointerStartEvent &&
      getEventDelta(this.pointerStartEvent, event) < 3
    ) {
      this.canEmulateClick = true;
    }

    if (this.canEmulateClick && (event.type === "click" || event.type === "dblclick")) {
      this.applyEventToTargetComponent(new MouseEvent(event.type, event), this.pointerStartTarget);
    }
  }

  public updateChildren() {
    const cameraProps: TCameraProps = {
      children: [BlockConnections.create({}), Blocks.create()],
      root: this.root,
    };

    return [Camera.create(cameraProps, { ref: "camera" })];
  }
}
