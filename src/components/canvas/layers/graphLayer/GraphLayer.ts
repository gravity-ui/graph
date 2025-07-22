import { Graph } from "../../../../graph";
import { GraphPointerEventNames, isNativeGraphEventName } from "../../../../graphEvents";
import { Component } from "../../../../lib/Component";
import { Layer, LayerContext, LayerProps } from "../../../../services/Layer";
import { Camera, TCameraProps } from "../../../../services/camera/Camera";
import { ICamera } from "../../../../services/camera/CameraService";
import { getEventDelta } from "../../../../utils/functions";
import { EventedComponent } from "../../EventedComponent/EventedComponent";
import { Blocks } from "../../blocks/Blocks";
import { BlockConnection } from "../../connections";
import { BlockConnections } from "../../connections/BlockConnections";

import { DrawBelow, DrawOver } from "./helpers";

export type TGraphLayerProps = LayerProps & {
  camera: ICamera;
  root: HTMLDivElement;
};

export type TGraphLayerContext = LayerContext & {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  root: HTMLDivElement;
  ownerDocument: Document;
  graph: Graph;
};

const rootBubblingEventTypes = new Set([
  "pointerdown",
  "pointerup",
  "click",
  "dblclick",
  "contextmenu",
  "pointercancel",
]);
const rootCapturingEventTypes = new Set(["pointerdown", "pointerup"]);

export type GraphPointerEvent = CustomEvent<{
  target: EventedComponent;
  sourceEvent: PointerEvent;
  pointerPressed: boolean;
}>;

export class GraphLayer extends Layer<TGraphLayerProps, TGraphLayerContext> {
  public declare $: Component & { camera: Camera };

  private camera: ICamera;

  private targetComponent: EventedComponent;

  private prevTargetComponent: EventedComponent;

  private canEmulateClick?: boolean;

  private pointerStartTarget?: EventedComponent;

  private pointerStartEvent?: PointerEvent;

  private pointerPressed = false;

  private eventByTargetComponent?: EventedComponent | PointerEvent;

  private capturedTargetComponent?: EventedComponent;

  constructor(props: TGraphLayerProps) {
    super({
      canvas: {
        zIndex: 2,
        classNames: ["no-user-select"],
        transformByCameraPosition: true,
      },
      // HTML element creation is now separated into framework-specific layers
      ...props,
    });

    const canvas = this.getCanvas();

    this.setContext({
      canvas: canvas,
      ctx: canvas.getContext("2d"),
      root: this.props.root,
      camera: this.props.camera,
      ownerDocument: canvas.ownerDocument,
      constants: this.props.graph.graphConstants,
      colors: this.props.graph.graphColors,
      graph: this.props.graph,
    });

    if (this.context.root) {
      this.attachListeners();
    }

    this.camera = this.props.camera;

    this.performRender = this.performRender.bind(this);
  }

  protected afterInit(): void {
    this.setContext({
      root: this.root as HTMLDivElement,
    });
    this.attachListeners();

    // Subscribe to graph events here instead of in the constructor
    this.onGraphEvent("camera-change", this.performRender);
    this.context.graph.rootStore.blocksList.$blocks.subscribe(() => {
      this.performRender();
    });
    this.context.graph.rootStore.connectionsList.$connections.subscribe(() => {
      this.performRender();
    });
    super.afterInit();
  }

  /**
   * Attaches DOM event listeners to the root element.
   * All event listeners are registered with the rootOn wrapper method to ensure they are properly cleaned up
   * when the layer is unmounted. This eliminates the need for manual event listener removal.
   */
  private attachListeners() {
    if (!this.root) return;

    rootBubblingEventTypes.forEach((type) => this.onRootEvent(type as keyof HTMLElementEventMap, this));
    rootCapturingEventTypes.forEach((type) =>
      this.onRootEvent(type as keyof HTMLElementEventMap, this, { capture: true })
    );
    this.onRootEvent("pointermove", this);
  }

  /*
   * Capture element for future events
   * When element is captured, it will be used as target for future events
   * until releaseCapture is called
   * @param component - element to capture
   */
  public captureEvents(component: EventedComponent) {
    this.capturedTargetComponent = component;
  }

  public releaseCapture() {
    this.capturedTargetComponent = undefined;
  }

  public handleEvent(e: Event): void {
    if (e.type === "pointermove") {
      this.updateTargetComponent(e as PointerEvent);
      this.onRootPointerMove(e as PointerEvent);
      return;
    }

    if (e.eventPhase === Event.CAPTURING_PHASE && rootCapturingEventTypes.has(e.type)) {
      this.tryEmulateClick(e as PointerEvent);
      return;
    }

    if (e.eventPhase === Event.BUBBLING_PHASE && rootBubblingEventTypes.has(e.type)) {
      switch (e.type) {
        case "pointerdown": {
          this.updateTargetComponent(e as PointerEvent, true);
          this.handlePointerDownEvent(e as PointerEvent);
          break;
        }
        case "pointercancel":
        case "pointerup": {
          this.onRootPointerEnd(e as PointerEvent);
          break;
        }
        case "click":
        case "dblclick": {
          this.tryEmulateClick(e as PointerEvent);
          break;
        }
      }
    }
  }

  private dispatchNativeEvent(
    type: GraphPointerEventNames,
    event: PointerEvent | GraphPointerEvent,
    targetComponent?: EventedComponent
  ) {
    const graphEvent = this.props.graph.emit(type, {
      target: targetComponent,
      pointerPressed: this.pointerPressed,
      sourceEvent: event,
    });
    if (graphEvent.defaultPrevented) {
      event.preventDefault();
      return false;
    }
    return true;
  }

  private applyEventToTargetComponent(event: PointerEvent | GraphPointerEvent, target = this.targetComponent) {
    if (isNativeGraphEventName(event.type)) {
      if (!this.dispatchNativeEvent(event.type, event, target)) {
        return;
      }
    }
    if (!target || typeof target.dispatchEvent !== "function") return;

    target.dispatchEvent(event);
  }

  private updateTargetComponent(event: PointerEvent, force = false) {
    // Check is event is too close to previous event
    // In case when previous event is too close to current event, we don't need to update target component
    // This is useful to prevent flickering when user is moving mouse fast
    if (!force && this.eventByTargetComponent && getEventDelta(event, this.eventByTargetComponent) < 3) return;

    this.eventByTargetComponent = event;

    if (this.capturedTargetComponent) {
      this.targetComponent = this.capturedTargetComponent;
      return;
    }

    this.prevTargetComponent = this.targetComponent;

    const point = this.context.graph.getPointInCameraSpace(event);

    this.targetComponent = this.context.graph.getElementOverPoint(point) || this.$.camera;
  }

  private onRootPointerMove(event: PointerEvent) {
    if (this.targetComponent !== this.prevTargetComponent) {
      if (this.targetComponent?.cursor) {
        this.root.style.cursor = this.targetComponent?.cursor;
      } else {
        this.root.style.removeProperty("cursor");
      }
      this.applyEventToTargetComponent(
        new CustomEvent("pointerleave", {
          bubbles: false,
          detail: {
            target: this.prevTargetComponent,
            sourceEvent: event,
            pointerPressed: this.pointerPressed,
          },
        }),
        this.prevTargetComponent
      );
      this.applyEventToTargetComponent(
        new CustomEvent("pointerout", {
          bubbles: true,
          detail: {
            target: this.prevTargetComponent,
            sourceEvent: event,
            pointerPressed: this.pointerPressed,
          },
        }),
        this.prevTargetComponent
      );
      this.applyEventToTargetComponent(
        new CustomEvent("pointerenter", {
          bubbles: false,
          detail: {
            target: this.targetComponent,
            sourceEvent: event,
            pointerPressed: this.pointerPressed,
          },
        }),
        this.targetComponent
      );
      this.applyEventToTargetComponent(
        new CustomEvent("pointerover", {
          bubbles: true,
          detail: {
            target: this.targetComponent,
            sourceEvent: event,
            pointerPressed: this.pointerPressed,
          },
        }),
        this.targetComponent
      );
    }
  }

  private handlePointerDownEvent = (event: PointerEvent) => {
    return this.onRootPointerStart(event);
  };

  private onRootPointerStart(event: PointerEvent) {
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

  private onRootPointerEnd(event: PointerEvent) {
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

  private tryEmulateClick(event: PointerEvent, target = this.targetComponent) {
    if (event.type === "pointerdown" && target !== undefined) {
      this.canEmulateClick = false;
      this.pointerStartTarget = target;
      this.pointerStartEvent = event;
    }

    if (
      event.type === "pointerup" &&
      (this.pointerStartTarget === target ||
        // connections can be very close to each other
        (this.pointerStartTarget instanceof BlockConnection && target instanceof BlockConnection)) &&
      // pointerStartEvent can be undefined if mousedown/touchstart event happened over dialog backdrop
      this.pointerStartEvent &&
      getEventDelta(this.pointerStartEvent, event) < 3
    ) {
      this.canEmulateClick = true;
    }

    if (
      (this.canEmulateClick || event.pointerType === "touch") &&
      (event.type === "click" || event.type === "dblclick")
    ) {
      this.applyEventToTargetComponent(new PointerEvent(event.type, event), target);
    }
  }

  public updateChildren() {
    const cameraProps: TCameraProps = {
      /* Blocks must be initialized before connections as connections need Block instances to access their geometry */
      children: [DrawOver.create(), Blocks.create(), DrawBelow.create(), BlockConnections.create()],
      root: this.root,
    };

    return [Camera.create(cameraProps, { ref: "camera" })];
  }
}
