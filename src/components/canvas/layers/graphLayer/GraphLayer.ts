import { Graph } from "../../../../graph";
import { GraphMouseEventNames, isNativeGraphEventName } from "../../../../graphEvents";
import { Component } from "../../../../lib/Component";
import { Layer, LayerContext, LayerProps } from "../../../../services/Layer";
import { Camera, TCameraProps } from "../../../../services/camera/Camera";
import { ICamera } from "../../../../services/camera/CameraService";
import { getEventDelta } from "../../../../utils/functions";
import { EventedComponent } from "../../EventedComponent/EventedComponent";
import { Blocks } from "../../blocks/Blocks";
import { BlockConnection } from "../../connections/BlockConnection";
import { BlockConnections } from "../../connections/BlockConnections";

import { DrawBelow, DrawOver } from "./helpers";

export type TGraphLayerProps = LayerProps & {
  camera: ICamera;
  root: HTMLDivElement;
};

export type TGraphLayerContext = LayerContext & {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  htmlCtx: HTMLDivElement;
  root: HTMLDivElement;
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
const rootCapturingEventTypes = new Set(["mousedown", "touchstart", "mouseup", "touchend"]);

export type GraphMouseEvent = CustomEvent<{
  target: EventedComponent;
  sourceEvent: MouseEvent;
  pointerPressed: boolean;
}>;

export class GraphLayer extends Layer<TGraphLayerProps, TGraphLayerContext> {
  public declare $: Component & { camera: Camera };

  private camera: ICamera;

  private targetComponent: EventedComponent;

  private prevTargetComponent: EventedComponent;

  private canEmulateClick?: boolean;

  private pointerStartTarget?: EventedComponent;

  private pointerStartEvent?: MouseEvent;

  private pointerPressed = false;

  private eventByTargetComponent?: EventedComponent | MouseEvent;

  private fixedTargetComponent?: EventedComponent | Camera;

  constructor(props: TGraphLayerProps) {
    super({
      canvas: {
        zIndex: 2,
        classNames: ["no-user-select"],
        transformByCameraPosition: true,
      },
      html: {
        zIndex: 3,
        classNames: ["no-user-select"],
        transformByCameraPosition: true,
      },
      ...props,
    });

    const canvas = this.getCanvas();
    const html = this.getHTML();

    this.setContext({
      canvas: canvas,
      ctx: canvas.getContext("2d"),
      htmlCtx: html as HTMLDivElement,
      root: this.props.root,
      camera: this.props.camera,
      ownerDocument: html.ownerDocument,
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
    this.onRootEvent("mousemove", this);
  }

  public handleEvent(e: Event): void {
    if (e.type === "mousemove") {
      this.updateTargetComponent(e as MouseEvent);
      this.onRootPointerMove(e as MouseEvent);
      return;
    }

    if (e.eventPhase === Event.CAPTURING_PHASE && rootCapturingEventTypes.has(e.type)) {
      this.tryEmulateClick(e as MouseEvent);
      return;
    }

    if (e.eventPhase === Event.BUBBLING_PHASE && rootBubblingEventTypes.has(e.type)) {
      switch (e.type) {
        case "mousedown":
        case "touchstart": {
          this.updateTargetComponent(e as MouseEvent, true);
          this.handleMouseDownEvent(e as MouseEvent);
          break;
        }
        case "mouseup":
        case "touchend": {
          this.onRootPointerEnd(e as MouseEvent);
          break;
        }
        case "click":
        case "dblclick": {
          this.tryEmulateClick(e as MouseEvent);
          break;
        }
      }
    }
  }

  private dispatchNativeEvent(
    type: GraphMouseEventNames,
    event: MouseEvent | GraphMouseEvent,
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

  private applyEventToTargetComponent(event: MouseEvent | GraphMouseEvent, target = this.targetComponent) {
    if (isNativeGraphEventName(event.type)) {
      if (!this.dispatchNativeEvent(event.type, event, target)) {
        return;
      }
    }
    if (!target || typeof target.dispatchEvent !== "function") return;

    target.dispatchEvent(event);
  }

  private updateTargetComponent(event: MouseEvent, force = false) {
    if (this.camera.isUnstable()) {
      return;
    }
    if (this.fixedTargetComponent !== undefined) {
      return;
    }

    this.prevTargetComponent = this.targetComponent;

    if (!force && this.eventByTargetComponent && getEventDelta(event, this.eventByTargetComponent) < 3) return;

    this.eventByTargetComponent = event;

    const point = this.context.graph.getPointInCameraSpace(event);

    this.targetComponent = this.context.graph.getElementOverPoint(point) || this.$.camera;
  }

  private onRootPointerMove(event: MouseEvent) {
    if (this.targetComponent !== this.prevTargetComponent) {
      if (this.targetComponent?.cursor) {
        this.root.style.cursor = this.targetComponent?.cursor;
      } else {
        this.root.style.removeProperty("cursor");
      }
      this.applyEventToTargetComponent(
        new CustomEvent("mouseleave", {
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
        new CustomEvent("mouseout", {
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
        new CustomEvent("mouseenter", {
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
        new CustomEvent("mouseover", {
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
      /* Blocks must be initialized before connections as connections need Block instances to access their geometry */
      children: [DrawOver.create(), Blocks.create(), DrawBelow.create(), BlockConnections.create()],
      root: this.root,
    };

    return [Camera.create(cameraProps, { ref: "camera" })];
  }
}
