import { EventedComponent } from "../../components/canvas/EventedComponent/EventedComponent";
import { TGraphLayerContext } from "../../components/canvas/layers/graphLayer/GraphLayer";
import { Component, ESchedulerPriority } from "../../lib";
import { TComponentProps, TComponentState } from "../../lib/Component";
import { ChildDescriptor } from "../../lib/CoreComponent";
import { getXY } from "../../utils/functions";
import { clamp } from "../../utils/functions/clamp";
import { EWheelIntent, isPinchZoomGesture } from "../../utils/functions/wheelIntent";
import { EVENTS } from "../../utils/types/events";
import { schedule } from "../../utils/utils/schedule";
import type { DragEmitter } from "../input/dragSession";
import { createDragSession, stopDragListening } from "../input/dragSession";

import { ICamera, TCameraState } from "./CameraService";

export type TCameraProps = TComponentProps & {
  root?: HTMLElement;
  children: ChildDescriptor[];
};

export class Camera extends EventedComponent<TCameraProps, TComponentState, TGraphLayerContext> {
  private camera: ICamera;

  private ownerDocument: Document;

  private autoPanPointer?: PointerEvent;

  private dragEmitter?: DragEmitter;

  private removeAutoPanScheduler?: () => void;

  private unsubscribeCamera?: () => void;

  constructor(props: TCameraProps, parent: Component) {
    super(props, parent);

    this.camera = this.context.camera;
    this.ownerDocument = this.context.ownerDocument;

    this.addWheelListener();

    this.unsubscribeCamera = this.context.graph.$camera.subscribe(this.handleCameraStateChange);
  }

  private handleCameraStateChange = (state: TCameraState): void => {
    const isAutoPanningEnabled = state.autoPanningEnabled;

    if (isAutoPanningEnabled) {
      this.startAutoPanning();
    } else {
      this.stopAutoPanning();
    }
  };

  /** @internal Default action of activation on the canvas background. */
  public handleBackgroundClick(): void {
    this.context.graph.api.unsetSelection();
  }

  protected setRoot() {
    this.setContext({
      root: this.props.root,
    });
    this.addWheelListener(this.props.root);
  }

  protected addWheelListener(root = this.props.root) {
    root?.addEventListener("wheel", this.handleWheelEvent, { passive: false });
  }

  protected propsChanged(nextProps: TCameraProps) {
    if (this.props.root !== nextProps.root) {
      this.props.root?.removeEventListener("wheel", this.handleWheelEvent);
      this.addWheelListener(nextProps.root);
    }
    super.propsChanged(nextProps);
  }

  protected unmount() {
    if (this.dragEmitter) stopDragListening(this.dragEmitter);
    super.unmount();

    this.stopAutoPanning();
    this.props.root?.removeEventListener("wheel", this.handleWheelEvent);
    this.unsubscribeCamera?.();
  }

  private startAutoPanning(): void {
    if (this.removeAutoPanScheduler) {
      return; // Already running
    }

    // Start scheduler to check and perform auto-panning at ~60fps
    this.removeAutoPanScheduler = schedule(
      () => {
        this.performAutoPan();
      },
      {
        priority: ESchedulerPriority.HIGH,
        frameInterval: 1, // Execute every frame
      }
    );
  }

  private stopAutoPanning(): void {
    this.autoPanPointer = undefined;
    if (this.removeAutoPanScheduler) {
      this.removeAutoPanScheduler();
      this.removeAutoPanScheduler = undefined;
    }
  }

  /** @internal Auto-pan follows the pointer that owns the drag, including touch and out-of-root moves. */
  public setAutoPanPointer(event: PointerEvent): void {
    this.autoPanPointer = event;
  }

  private performAutoPan(): void {
    const pointer = this.autoPanPointer ?? this.context.graph.input.hover.pointerPosition;
    if (!pointer || !this.props.root) {
      return;
    }

    const rect = this.props.root.getBoundingClientRect();
    const pointerX = pointer.clientX - rect.left;
    const pointerY = pointer.clientY - rect.top;

    const cameraState = this.camera.getCameraState();
    const insets = cameraState.viewportInsets;

    // Get auto-panning constants from graph config
    const AUTO_PAN_THRESHOLD = this.context.constants.camera.AUTO_PAN_THRESHOLD;
    const AUTO_PAN_SPEED = this.context.constants.camera.AUTO_PAN_SPEED;

    // Calculate effective viewport bounds (accounting for insets)
    const viewportLeft = insets.left;
    const viewportRight = cameraState.width - insets.right;
    const viewportTop = insets.top;
    const viewportBottom = cameraState.height - insets.bottom;

    let deltaX = 0;
    let deltaY = 0;

    // Check left edge - move camera right to show more content on the left
    if (pointerX < viewportLeft + AUTO_PAN_THRESHOLD && pointerX >= viewportLeft) {
      const ratio = 1 - (pointerX - viewportLeft) / AUTO_PAN_THRESHOLD;
      deltaX = AUTO_PAN_SPEED * ratio;
    }
    // Check right edge - move camera left to show more content on the right
    else if (pointerX > viewportRight - AUTO_PAN_THRESHOLD && pointerX <= viewportRight) {
      const ratio = 1 - (viewportRight - pointerX) / AUTO_PAN_THRESHOLD;
      deltaX = -AUTO_PAN_SPEED * ratio;
    }

    // Check top edge - move camera down to show more content on the top
    if (pointerY < viewportTop + AUTO_PAN_THRESHOLD && pointerY >= viewportTop) {
      const ratio = 1 - (pointerY - viewportTop) / AUTO_PAN_THRESHOLD;
      deltaY = AUTO_PAN_SPEED * ratio;
    }
    // Check bottom edge - move camera up to show more content on the bottom
    else if (pointerY > viewportBottom - AUTO_PAN_THRESHOLD && pointerY <= viewportBottom) {
      const ratio = 1 - (viewportBottom - pointerY) / AUTO_PAN_THRESHOLD;
      deltaY = -AUTO_PAN_SPEED * ratio;
    }

    // Apply camera movement if needed
    if (deltaX !== 0 || deltaY !== 0) {
      this.camera.move(deltaX, deltaY);
    }
  }

  /** @internal Pan by the pointer displacement in CSS pixels, including the threshold-crossing move. */
  public startPan(
    hit: EventedComponent | undefined,
    down: PointerEvent,
    move: PointerEvent,
    signal: AbortSignal
  ): void {
    if (this.dragEmitter) stopDragListening(this.dragEmitter);
    let previous = down;
    const session = createDragSession(this.ownerDocument, {
      graph: this.context.graph,
      initialEvent: down,
      component: hit ?? this,
      autopanning: false,
      cursor: "grabbing",
      signals: [signal],
      onSessionEnd: () => {
        this.dragEmitter = undefined;
      },
    });
    this.dragEmitter = session.on(EVENTS.DRAG_UPDATE, (event) => {
      this.camera.move(event.clientX - previous.clientX, event.clientY - previous.clientY);
      previous = event;
    });
    session.start(move);
  }

  private handlePan(event: WheelEvent): void {
    const hasWrongHorizontalScroll = event.shiftKey && Math.abs(event.deltaY) > 0.001;
    const panSpeed = this.context.constants.camera.PAN_SPEED;

    this.moveWithEdges(
      (hasWrongHorizontalScroll ? -event.deltaY : -event.deltaX) * panSpeed,
      (hasWrongHorizontalScroll ? -event.deltaX : -event.deltaY) * panSpeed
    );
  }

  private handleZoom(event: WheelEvent, acceleration = 1): void {
    if (!event.deltaY) {
      return;
    }

    const xy = getXY(this.context.canvas, event);

    /**
     * Speed of wheel/trackpad pinch
     *
     * The zoom event from the trackpad pass the deltaY as a floating number, which can be less than +1/-1.
     * If the delta is less than 1, it causes the zoom speed to slow down.
     * Therefore, we have to round the value of deltaY to 1 if it is less than or equal to 1.
     */
    const pinchSpeed = Math.sign(event.deltaY) * clamp(Math.abs(event.deltaY), 1, 20);

    const dScale = this.context.constants.camera.STEP * this.context.constants.camera.SPEED * pinchSpeed * acceleration;

    const cameraScale = this.camera.getCameraScale();

    // Apply the delta in log-scale space. This keeps the zoom speed relative to the
    // current scale while making equal zoom-in and zoom-out steps reciprocal.
    const nextScale = cameraScale * Math.exp(-dScale);
    this.camera.zoom(xy[0], xy[1], nextScale);
  }

  /**
   * Routes a native wheel sample using the graph's resolveWheelIntent setting.
   */
  private handleWheelEvent = (event: WheelEvent) => {
    if (!this.context.graph.rootStore.settings.getConfigFlag("canZoomCamera")) {
      return;
    }

    event.stopPropagation();
    event.preventDefault();

    const intent = this.context.graph.rootStore.settings.wheelIntentFromEvent(event, {
      mouseWheelBehavior: this.context.constants.camera.MOUSE_WHEEL_BEHAVIOR,
      wheelInputDevice: this.context.constants.camera.WHEEL_INPUT_DEVICE,
    });

    if (intent === EWheelIntent.Pan) {
      this.handlePan(event);
      return;
    }

    const acceleration = isPinchZoomGesture(event) ? this.context.constants.camera.PINCH_ZOOM_SPEED : 1;
    this.handleZoom(event, acceleration);
  };

  protected moveWithEdges(deltaX: number, deltaY: number) {
    const uR = this.context.graph.api.getUsableRect();
    const cameraState = this.camera.getCameraState();

    const gapX = cameraState.relativeWidth;
    const gapY = cameraState.relativeHeight;

    const moveToRight = deltaX > 0;
    const moveToLeft = deltaX < 0;
    const moveToTop = deltaY > 0;
    const moveToBottop = deltaY < 0;

    if (moveToRight && uR.x - gapX > cameraState.relativeX * -1) {
      deltaX = 0;
    } // left
    if (moveToLeft && uR.x + uR.width + gapX < cameraState.relativeX * -1 + cameraState.relativeWidth) {
      deltaX = 0;
    } // right
    if (moveToTop && uR.y - gapY > cameraState.relativeY * -1) {
      deltaY = 0;
    } // top
    if (moveToBottop && uR.y + uR.height + gapY < cameraState.relativeY * -1 + cameraState.relativeHeight) {
      deltaY = 0;
    } // bottom

    this.camera.move(deltaX, deltaY);
  }

  public render() {
    this.context.layer.resetTransform();
  }

  public updateChildren() {
    return this.props.children;
  }
}
