import { EventedComponent } from "../../components/canvas/EventedComponent/EventedComponent";
import { TGraphLayerContext } from "../../components/canvas/layers/graphLayer/GraphLayer";
import { Component } from "../../lib";
import { TComponentProps, TComponentState } from "../../lib/Component";
import { ComponentDescriptor } from "../../lib/CoreComponent";
import { getXY, isMetaKeyEvent, isTrackpadWheelEvent, isWindows } from "../../utils/functions";
import { clamp } from "../../utils/functions/clamp";
import { dragListener } from "../../utils/functions/dragListener";
import {
  getEventPageCoordinates,
  getTouchCenter,
  getTouchDistance,
  isTouchDevice,
} from "../../utils/functions/touchUtils";
import { EVENTS } from "../../utils/types/events";

import { ICamera } from "./CameraService";

export type TCameraProps = TComponentProps & {
  root?: HTMLDivElement;
  children: ComponentDescriptor[];
};

export class Camera extends EventedComponent<TCameraProps, TComponentState, TGraphLayerContext> {
  private static readonly PINCH_THRESHOLD = 0.01;
  private static readonly PINCH_DELTA_MULTIPLIER = 100;

  private camera: ICamera;
  private ownerDocument: Document;
  private lastDragEvent?: MouseEvent | TouchEvent;

  // Touch gesture state
  private isTouch: boolean;
  private lastPinchDistance?: number;
  private isPinching = false;

  constructor(props: TCameraProps, parent: Component) {
    super(props, parent);

    this.camera = this.context.camera;
    this.ownerDocument = this.context.ownerDocument;
    this.isTouch = isTouchDevice();

    this.addWheelListener();
    this.addEventListener("click", this.handleClick);
    this.addEventListener("mousedown", this.handleMouseDownEvent);

    this.addTouchEventListeners();
  }

  protected handleClick = () => {
    this.context.graph.api.unsetSelection();
  };

  protected setRoot() {
    this.setContext({
      root: this.props.root,
    });
    this.addWheelListener(this.props.root);
  }

  protected addWheelListener(root = this.props.root) {
    root?.addEventListener("wheel", this.handleWheelEvent, { passive: false });
  }

  /**
   * Adds touch event listeners for pinch gestures on touch devices
   * @returns {void}
   */
  private addTouchEventListeners() {
    if (this.isTouch) {
      document.addEventListener("touchstart", this.handleTouchStartEvent, { passive: false });
      document.addEventListener("touchmove", this.handleTouchMoveEvent, { passive: false });
      document.addEventListener("touchend", this.handleTouchEndEvent, { passive: false });
    }
  }

  /**
   * Removes touch event listeners
   * @returns {void}
   */
  private removeTouchEventListeners() {
    if (this.isTouch) {
      document.removeEventListener("touchstart", this.handleTouchStartEvent);
      document.removeEventListener("touchmove", this.handleTouchMoveEvent);
      document.removeEventListener("touchend", this.handleTouchEndEvent);
    }
  }

  protected propsChanged(nextProps: TCameraProps) {
    if (this.props.root !== nextProps.root) {
      this.props.root?.removeEventListener("wheel", this.handleWheelEvent);
      this.addWheelListener(nextProps.root);
    }
    super.propsChanged(nextProps);
  }

  protected unmount() {
    super.unmount();

    this.props.root?.removeEventListener("wheel", this.handleWheelEvent);
    this.removeEventListener("mousedown", this.handleMouseDownEvent);
    this.removeTouchEventListeners();
  }

  private handleMouseDownEvent = (event: MouseEvent) => {
    if (!this.context.graph.rootStore.settings.getConfigFlag("canDragCamera") || !(event instanceof MouseEvent)) {
      return;
    }
    if (!isMetaKeyEvent(event)) {
      this.startDragListening();
    }
  };

  private handleTouchStartEvent = (event: TouchEvent) => {
    // Prevent default browser pinch/zoom behavior for multi-touch events
    if (event.touches.length >= 2) {
      event.preventDefault();
    }

    if (!this.context.graph.rootStore.settings.getConfigFlag("canDragCamera")) {
      return;
    }

    if (!this.handlePinchStart(event)) {
      this.handleSingleTouchStart(event);
    }
  };

  /**
   * Handles the start of a pinch gesture
   * @param {TouchEvent} event - Touch event
   * @returns {boolean} True if pinch was started
   */
  private handlePinchStart(event: TouchEvent): boolean {
    if (event.touches.length === 2 && this.context.graph.rootStore.settings.getConfigFlag("canZoomCamera")) {
      this.isPinching = true;
      this.lastPinchDistance = getTouchDistance(event);
      return true;
    }
    return false;
  }

  /**
   * Handles the start of a single touch drag
   * @param {TouchEvent} event - Touch event
   * @returns {boolean} True if drag was started
   */
  private handleSingleTouchStart(event: TouchEvent): boolean {
    if (event.touches.length === 1 && !this.isPinching) {
      this.startDragListening();
      return true;
    }
    return false;
  }

  private handleTouchMoveEvent = (event: TouchEvent) => {
    // Prevent default browser behavior for multi-touch to avoid browser zoom
    if (event.touches.length >= 2) {
      event.preventDefault();
    }

    if (this.isPinching && event.touches.length === 2) {
      this.processPinchZoom(event);
    }
  };

  /**
   * Processes pinch zoom gesture
   * @param {TouchEvent} event - Touch event
   * @returns {void}
   */
  private processPinchZoom(event: TouchEvent): void {
    if (!this.context.graph.rootStore.settings.getConfigFlag("canZoomCamera") || !this.lastPinchDistance) {
      return;
    }

    const currentDistance = getTouchDistance(event);
    if (currentDistance <= 0) return;

    const scaleDelta = currentDistance / this.lastPinchDistance;

    // Only apply zoom if there's a meaningful change to avoid jitter
    if (Math.abs(scaleDelta - 1) > Camera.PINCH_THRESHOLD) {
      this.applyPinchZoom(event, scaleDelta);
    }

    this.lastPinchDistance = currentDistance;
  }

  /**
   * Applies pinch zoom using the same logic as wheel events for consistency
   * @param {TouchEvent} event - Touch event
   * @param {number} scaleDelta - Scale delta from pinch gesture
   * @returns {void}
   */
  private applyPinchZoom(event: TouchEvent, scaleDelta: number): void {
    const center = getTouchCenter(event);

    // Convert client coordinates to canvas coordinates
    const rect = this.context.canvas.getBoundingClientRect();
    const canvasX = center.x - rect.left;
    const canvasY = center.y - rect.top;

    // Use the same logic as handleWheelEvent for consistent zoom behavior
    const deltaDirection = scaleDelta > 1 ? -1 : 1; // Invert direction like wheel events
    const deltaAmount = Math.abs(scaleDelta - 1) * Camera.PINCH_DELTA_MULTIPLIER;

    // Apply the same speed calculation as in handleWheelEvent
    const pinchSpeed = Math.sign(deltaDirection) * clamp(deltaAmount, 1, 20);
    const dScale = this.context.constants.camera.STEP * this.context.constants.camera.SPEED * pinchSpeed;

    const cameraScale = this.camera.getCameraScale();
    const smoothDScale = dScale * cameraScale;

    this.camera.zoom(canvasX, canvasY, cameraScale - smoothDScale);
  }

  private handleTouchEndEvent = (event: TouchEvent) => {
    // Prevent default browser behavior when ending multi-touch gestures
    if (this.isPinching || event.changedTouches.length > 1) {
      event.preventDefault();
    }

    this.resetPinchState(event);
  };

  /**
   * Resets pinch gesture state when appropriate
   * @param {TouchEvent} event - Touch event
   * @returns {void}
   */
  private resetPinchState(event: TouchEvent): void {
    if (this.isPinching && event.touches.length < 2) {
      this.isPinching = false;
      this.lastPinchDistance = undefined;
    }
  }

  private startDragListening() {
    dragListener(this.ownerDocument)
      .on(EVENTS.DRAG_START, (event: MouseEvent | TouchEvent) => this.onDragStart(event))
      .on(EVENTS.DRAG_UPDATE, (event: MouseEvent | TouchEvent) => this.onDragUpdate(event))
      .on(EVENTS.DRAG_END, () => this.onDragEnd());
  }

  private onDragStart(event: MouseEvent | TouchEvent) {
    // Don't start drag if we're in the middle of a pinch gesture
    if (this.isPinching) {
      return;
    }
    this.lastDragEvent = event;
  }

  private onDragUpdate(event: MouseEvent | TouchEvent) {
    if (!this.lastDragEvent || this.isPinching) {
      return;
    }

    const currentCoords = getEventPageCoordinates(event);
    const lastCoords = getEventPageCoordinates(this.lastDragEvent);

    this.camera.move(currentCoords.pageX - lastCoords.pageX, currentCoords.pageY - lastCoords.pageY);
    this.lastDragEvent = event;
  }

  private onDragEnd() {
    this.lastDragEvent = undefined;
  }

  private handleWheelEvent = (event: WheelEvent) => {
    if (!this.context.graph.rootStore.settings.getConfigFlag("canZoomCamera")) {
      return;
    }

    event.stopPropagation();
    event.preventDefault();

    const isMoveEvent = isTrackpadWheelEvent(event) && !isMetaKeyEvent(event);

    if (isMoveEvent) {
      const windows = isWindows();

      this.moveWithEdges(
        windows && event.shiftKey ? -event.deltaY : -event.deltaX,
        windows && event.shiftKey ? -event.deltaX : -event.deltaY
      );
      return;
    }

    const xy = getXY(this.context.canvas, event);

    if (!event.deltaY) return;

    /**
     * Speed of wheel/trackpad pinch
     *
     * The zoom event from the trackpad pass the deltaY as a floating number, which can be less than +1/-1.
     * If the delta is less than 1, it causes the zoom speed to slow down.
     * Therefore, we have to round the value of deltaY to 1 if it is less than or equal to 1.
     */
    const pinchSpeed = Math.sign(event.deltaY) * clamp(Math.abs(event.deltaY), 1, 20);
    const dScale = this.context.constants.camera.STEP * this.context.constants.camera.SPEED * pinchSpeed;

    const cameraScale = this.camera.getCameraScale();

    // Smooth scale. The closer you get, the higher the speed
    const smoothDScale = dScale * cameraScale;
    this.camera.zoom(xy[0], xy[1], cameraScale - smoothDScale);
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
