import { TGraphLayerContext } from "../../components/canvas/layers/graphLayer/GraphLayer";
import { Component } from "../../lib/Component";
import { withEvent } from "../../mixins/withEvents";
import { getXY, isMetaKeyEvent, isTrackpadWheelEvent, isWindows } from "../../utils/functions";
import { clamp } from "../../utils/functions/clamp";
import { dragListener } from "../../utils/functions/dragListener";
import { EVENTS } from "../../utils/types/events";
import { ICamera } from "./CameraService";

export type TCameraProps = {
  children: any[];
  root?: HTMLElement;
};

export class Camera extends withEvent(Component) {
  public declare props: TCameraProps;

  public declare context: TGraphLayerContext;

  private ctx: CanvasRenderingContext2D;

  private camera: ICamera;

  private ownerDocument: Document;

  private lastDragEvent?: MouseEvent;

  public constructor(props: TCameraProps, context: TGraphLayerContext) {
    super(props, context);

    this.camera = this.context.camera;
    this.ctx = this.context.ctx;
    this.ownerDocument = this.context.ownerDocument;

    this.addWheelListener();
    this.addEventListener("click", this.handleClick);
    this.addEventListener("mousedown", this.handleMouseDownEvent);
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

  protected propsChanged(nextProps: TCameraProps) {
    if (this.props.root !== nextProps.root) {
      this.props.root?.removeEventListener("wheel", this.handleWheelEvent);
      this.addWheelListener(nextProps.root);
    }
    super.propsChanged(nextProps);
  }

  protected unmount() {
    super.unmount();

    this.camera.off("update", this.performRender);

    this.props.root?.removeEventListener("wheel", this.handleWheelEvent);
    this.removeEventListener("mousedown", this.handleMouseDownEvent);
  }

  private handleMouseDownEvent = (event: MouseEvent) => {
    if (!this.context.graph.rootStore.settings.getConfigFlag("canDragCamera") || !(event instanceof MouseEvent)) {
      return;
    }
    if (!isMetaKeyEvent(event)) {
      dragListener(this.ownerDocument)
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
    const uR = this.context.graph.rootStore.blocksList.getUsableRect();
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
    const dpr = this.context.constants.system.PIXEL_RATIO;
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);

    const cameraState = this.camera.getCameraState();
    this.ctx.clearRect(0, 0, cameraState.width * dpr, cameraState.height * dpr);

    this.ctx.setTransform(
      cameraState.scale * dpr,
      0,
      0,
      cameraState.scale * dpr,
      cameraState.x * dpr,
      cameraState.y * dpr
    );
  }

  public updateChildren() {
    return this.props.children;
  }
}
