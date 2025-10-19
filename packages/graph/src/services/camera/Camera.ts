import { EventedComponent } from "../../components/canvas/EventedComponent/EventedComponent";
import { TGraphLayerContext } from "../../components/canvas/layers/graphLayer/GraphLayer";
import { Component, ESchedulerPriority } from "../../lib";
import { TComponentProps, TComponentState } from "../../lib/Component";
import { ComponentDescriptor } from "../../lib/CoreComponent";
import { getXY, isMetaKeyEvent, isTrackpadWheelEvent } from "../../utils/functions";
import { clamp } from "../../utils/functions/clamp";
import { dragListener } from "../../utils/functions/dragListener";
import { EVENTS } from "../../utils/types/events";
import { schedule } from "../../utils/utils/schedule";

import { ICamera, TCameraState } from "./CameraService";

export type TCameraProps = TComponentProps & {
  root?: HTMLDivElement;
  children: ComponentDescriptor[];
};

export class Camera extends EventedComponent<TCameraProps, TComponentState, TGraphLayerContext> {
  private camera: ICamera;

  private ownerDocument: Document;

  private lastDragEvent?: MouseEvent;

  private removeAutoPanScheduler?: () => void;

  private lastMouseEvent?: MouseEvent;

  constructor(props: TCameraProps, parent: Component) {
    super(props, parent);

    this.camera = this.context.camera;
    this.ownerDocument = this.context.ownerDocument;

    this.addWheelListener();
    this.addEventListener("click", this.handleClick);
    this.addEventListener("mousedown", this.handleMouseDownEvent);

    // Subscribe to auto-panning state changes
    this.context.graph.on("camera-change", this.handleCameraStateChange);
  }

  private handleCameraStateChange = (event: CustomEvent<TCameraState>) => {
    const state = event.detail;
    const isAutoPanningEnabled = state.autoPanningEnabled;

    if (isAutoPanningEnabled) {
      this.startAutoPanning();
    } else {
      this.stopAutoPanning();
    }
  };

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

  protected propsChanged(nextProps: TCameraProps) {
    if (this.props.root !== nextProps.root) {
      this.props.root?.removeEventListener("wheel", this.handleWheelEvent);
      this.addWheelListener(nextProps.root);
    }
    super.propsChanged(nextProps);
  }

  protected unmount() {
    super.unmount();

    this.stopAutoPanning();
    this.props.root?.removeEventListener("wheel", this.handleWheelEvent);
    this.removeEventListener("mousedown", this.handleMouseDownEvent);
    this.context.graph.off("camera-change", this.handleCameraStateChange);
  }

  private startAutoPanning(): void {
    if (this.removeAutoPanScheduler) {
      return; // Already running
    }

    // Add mousemove listener to track cursor position
    this.props.root?.addEventListener("mousemove", this.handleMouseMoveForAutoPan);

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
    if (this.removeAutoPanScheduler) {
      this.removeAutoPanScheduler();
      this.removeAutoPanScheduler = undefined;
    }

    this.props.root?.removeEventListener("mousemove", this.handleMouseMoveForAutoPan);
    this.lastMouseEvent = undefined;
  }

  private handleMouseMoveForAutoPan = (event: MouseEvent): void => {
    this.lastMouseEvent = event;
  };

  private performAutoPan(): void {
    if (!this.lastMouseEvent || !this.props.root) {
      return;
    }

    const rect = this.props.root.getBoundingClientRect();
    const mouseX = this.lastMouseEvent.clientX - rect.left;
    const mouseY = this.lastMouseEvent.clientY - rect.top;

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
    if (mouseX < viewportLeft + AUTO_PAN_THRESHOLD && mouseX >= viewportLeft) {
      const ratio = 1 - (mouseX - viewportLeft) / AUTO_PAN_THRESHOLD;
      deltaX = AUTO_PAN_SPEED * ratio;
    }
    // Check right edge - move camera left to show more content on the right
    else if (mouseX > viewportRight - AUTO_PAN_THRESHOLD && mouseX <= viewportRight) {
      const ratio = 1 - (viewportRight - mouseX) / AUTO_PAN_THRESHOLD;
      deltaX = -AUTO_PAN_SPEED * ratio;
    }

    // Check top edge - move camera down to show more content on the top
    if (mouseY < viewportTop + AUTO_PAN_THRESHOLD && mouseY >= viewportTop) {
      const ratio = 1 - (mouseY - viewportTop) / AUTO_PAN_THRESHOLD;
      deltaY = AUTO_PAN_SPEED * ratio;
    }
    // Check bottom edge - move camera up to show more content on the bottom
    else if (mouseY > viewportBottom - AUTO_PAN_THRESHOLD && mouseY <= viewportBottom) {
      const ratio = 1 - (viewportBottom - mouseY) / AUTO_PAN_THRESHOLD;
      deltaY = -AUTO_PAN_SPEED * ratio;
    }

    // Apply camera movement if needed
    if (deltaX !== 0 || deltaY !== 0) {
      this.camera.move(deltaX, deltaY);
    }
  }

  private handleMouseDownEvent = (event: MouseEvent) => {
    if (!this.context.graph.rootStore.settings.getConfigFlag("canDragCamera") || !(event instanceof MouseEvent)) {
      return;
    }
    if (!isMetaKeyEvent(event)) {
      // Camera drag doesn't need graph sync since it IS the camera
      dragListener(this.ownerDocument, { graph: this.context.graph, autopanning: false, dragCursor: "grabbing" })
        .on(EVENTS.DRAG_START, (event: MouseEvent) => this.onDragStart(event))
        .on(EVENTS.DRAG_UPDATE, (event: MouseEvent) => this.onDragUpdate(event))
        .on(EVENTS.DRAG_END, () => this.onDragEnd());
    }
  };

  private onDragStart(event: MouseEvent) {
    this.lastDragEvent = event;
  }

  private onDragUpdate(event: MouseEvent) {
    if (!this.lastDragEvent) {
      return;
    }
    this.camera.move(event.pageX - this.lastDragEvent.pageX, event.pageY - this.lastDragEvent.pageY);
    this.lastDragEvent = event;
  }

  private onDragEnd() {
    this.lastDragEvent = undefined;
  }

  /**
   * Handles trackpad swipe gestures for camera movement
   */
  private handleTrackpadMove(event: WheelEvent): void {
    const hasWrongHorizontalScroll = event.shiftKey && Math.abs(event.deltaY) > 0.001;

    this.moveWithEdges(
      hasWrongHorizontalScroll ? -event.deltaY : -event.deltaX,
      hasWrongHorizontalScroll ? -event.deltaX : -event.deltaY
    );
  }

  /**
   * Handles zoom behavior for both trackpad pinch and mouse wheel
   */
  private handleWheelZoom(event: WheelEvent): void {
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
    const dScale = this.context.constants.camera.STEP * this.context.constants.camera.SPEED * pinchSpeed;

    const cameraScale = this.camera.getCameraScale();

    // Smooth scale. The closer you get, the higher the speed
    const smoothDScale = dScale * cameraScale;
    this.camera.zoom(xy[0], xy[1], cameraScale - smoothDScale);
  }

  private handleWheelEvent = (event: WheelEvent) => {
    if (!this.context.graph.rootStore.settings.getConfigFlag("canZoomCamera")) {
      return;
    }

    event.stopPropagation();
    event.preventDefault();

    const isTrackpad = isTrackpadWheelEvent(event);
    const isTrackpadMove = isTrackpad && !isMetaKeyEvent(event);

    // Trackpad swipe gesture - always moves camera
    if (isTrackpadMove) {
      this.handleTrackpadMove(event);
      return;
    }

    // Mouse wheel behavior - check configuration
    if (!isTrackpad && !isMetaKeyEvent(event)) {
      const mouseWheelBehavior = this.context.constants.camera.MOUSE_WHEEL_BEHAVIOR;

      if (mouseWheelBehavior === "scroll") {
        this.handleTrackpadMove(event);
        return;
      }
    }

    // Default: zoom behavior (trackpad pinch or mouse wheel with "zoom" mode)
    this.handleWheelZoom(event);
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
