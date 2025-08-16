import { EventedComponent } from "../../components/canvas/EventedComponent/EventedComponent";
import { TGraphLayerContext } from "../../components/canvas/layers/graphLayer/GraphLayer";
import { Component } from "../../lib";
import { TComponentProps, TComponentState } from "../../lib/Component";
import { ComponentDescriptor } from "../../lib/CoreComponent";
import { getXY, isMetaKeyEvent, isTrackpadWheelEvent, isWindows } from "../../utils/functions";
import { clamp } from "../../utils/functions/clamp";
import { dragListener } from "../../utils/functions/dragListener";
import { EVENTS } from "../../utils/types/events";

import { ICamera } from "./CameraService";

export type TCameraProps = TComponentProps & {
  root?: HTMLDivElement;
  children: ComponentDescriptor[];
};

export class Camera extends EventedComponent<TCameraProps, TComponentState, TGraphLayerContext> {
  private camera: ICamera;

  private ownerDocument: Document;

  private lastDragEvent?: MouseEvent;
  private isPanning = false;
  private panStartPoint?: { x: number; y: number };
  private isPinching = false;
  private pinchStartScale = 1;

  constructor(props: TCameraProps, parent: Component) {
    super(props, parent);

    this.camera = this.context.camera;
    this.ownerDocument = this.context.ownerDocument;

    this.addWheelListener();
    this.addEventListener("click", this.handleClick);
    this.addEventListener("mousedown", this.handleMouseDownEvent);

    // Подписываемся на события жестов
    this.setupGestureListeners();
  }

  private setupGestureListeners(): void {
    // Слушаем события жестов на уровне Graph
    this.context.graph.on("panstart", this.handlePanStart.bind(this));
    this.context.graph.on("panmove", this.handlePanMove.bind(this));
    this.context.graph.on("panend", this.handlePanEnd.bind(this));
    this.context.graph.on("pinchstart", this.handlePinchStart.bind(this));
    this.context.graph.on("pinchmove", this.handlePinchMove.bind(this));
    this.context.graph.on("pinchend", this.handlePinchEnd.bind(this));
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

    this.props.root?.removeEventListener("wheel", this.handleWheelEvent);
    this.removeEventListener("mousedown", this.handleMouseDownEvent);

    // Отписываемся от событий жестов
    this.context.graph.off("panstart", this.handlePanStart.bind(this));
    this.context.graph.off("panmove", this.handlePanMove.bind(this));
    this.context.graph.off("panend", this.handlePanEnd.bind(this));
    this.context.graph.off("pinchstart", this.handlePinchStart.bind(this));
    this.context.graph.off("pinchmove", this.handlePinchMove.bind(this));
    this.context.graph.off("pinchend", this.handlePinchEnd.bind(this));
  }

  private handleMouseDownEvent = (event: MouseEvent) => {
    if (!this.context.graph.rootStore.settings.getConfigFlag("canDragCamera") || !(event instanceof MouseEvent)) {
      return;
    }
    if (!isMetaKeyEvent(event)) {
      // Используем старую систему dragListener как fallback для совместимости
      dragListener(this.ownerDocument)
        .on(EVENTS.DRAG_START, (dragEvent: MouseEvent) => this.onDragStart(dragEvent))
        .on(EVENTS.DRAG_UPDATE, (dragEvent: MouseEvent) => this.onDragUpdate(dragEvent))
        .on(EVENTS.DRAG_END, () => this.onDragEnd());
    }
  };

  // Обработчики новых событий жестов
  private handlePanStart = (gestureEvent: any) => {
    if (!this.context.graph.rootStore.settings.getConfigFlag("canDragCamera")) {
      return;
    }

    // Проверяем, что событие произошло на камере (не на блоках)
    if (gestureEvent.detail.target === this) {
      this.isPanning = true;
      this.panStartPoint = { x: gestureEvent.detail.sourceEvent.center.x, y: gestureEvent.detail.sourceEvent.center.y };
    }
  };

  private handlePanMove = (gestureEvent: any) => {
    if (!this.isPanning || !this.panStartPoint) {
      return;
    }

    const currentPoint = gestureEvent.detail.sourceEvent.center;
    const deltaX = currentPoint.x - this.panStartPoint.x;
    const deltaY = currentPoint.y - this.panStartPoint.y;

    // Обновляем начальную точку для следующего движения
    this.panStartPoint = { x: currentPoint.x, y: currentPoint.y };

    // Двигаем камеру
    this.camera.move(deltaX, deltaY);
  };

  private handlePanEnd = (_gestureEvent: any) => {
    this.isPanning = false;
    this.panStartPoint = undefined;
  };

  private handlePinchStart = (gestureEvent: any) => {
    if (!this.context.graph.rootStore.settings.getConfigFlag("canZoomCamera")) {
      return;
    }

    this.isPinching = true;
    // Проверяем, что событие произошло на камере (не на блоках)
    if (gestureEvent.detail.target === this) {
      this.pinchStartScale = gestureEvent.detail.sourceEvent.scale;
    }
  };

  private handlePinchMove = (gestureEvent: any) => {
    if (!this.isPinching) {
      return;
    }

    const currentScale = gestureEvent.detail.sourceEvent.scale;
    const scaleDelta = currentScale - this.pinchStartScale;

    // Получаем центр pinch жеста
    const center = gestureEvent.detail.sourceEvent.center;

    // Используем ту же логику скорости зума, что и в handleWheelEvent
    // Конвертируем scaleDelta в формат, совместимый с wheel событием
    const pinchSpeed = Math.sign(scaleDelta) * clamp(Math.abs(scaleDelta * 10), 1, 20);
    const dScale = this.context.constants.camera.STEP * this.context.constants.camera.SPEED * pinchSpeed;

    const cameraScale = this.camera.getCameraScale();

    // Smooth scale. The closer you get, the higher the speed
    const smoothDScale = dScale * cameraScale;

    // Применяем зум к камере с той же формулой
    this.camera.zoom(center.x, center.y, cameraScale - smoothDScale);

    // Обновляем начальный масштаб для следующего кадра
    this.pinchStartScale = currentScale;
  };

  private handlePinchEnd = (_gestureEvent: any) => {
    this.isPinching = false;
    this.pinchStartScale = 1;
  };

  // Старые обработчики для совместимости
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
