import { EventedComponent } from "../../components/canvas/EventedComponent/EventedComponent";
import { TGraphLayerContext } from "../../components/canvas/layers/graphLayer/GraphLayer";
import { Component, ESchedulerPriority } from "../../lib";
import { TComponentProps, TComponentState } from "../../lib/Component";
import { ComponentDescriptor } from "../../lib/CoreComponent";
import { getXY, isMetaKeyEvent, isTrackpadWheelEvent, isWindows } from "../../utils/functions";
import { clamp } from "../../utils/functions/clamp";
import { dragListener } from "../../utils/functions/dragListener";
import { EVENTS } from "../../utils/types/events";
import { schedule } from "../../utils/utils/schedule";

import { ICamera } from "./CameraService";

export type TCameraProps = TComponentProps & {
  root?: HTMLDivElement;
  children: ComponentDescriptor[];
};

export type TEdgePanningConfig = {
  edgeSize: number; // размер зоны для активации edge panning (в пикселях)
  speed: number; // скорость движения камеры
  enabled: boolean; // включен ли режим
};

const DEFAULT_EDGE_PANNING_CONFIG: TEdgePanningConfig = {
  edgeSize: 100,
  speed: 15,
  enabled: false,
};

export class Camera extends EventedComponent<TCameraProps, TComponentState, TGraphLayerContext> {
  private camera: ICamera;

  private ownerDocument: Document;

  private lastDragEvent?: MouseEvent;

  private edgePanningConfig: TEdgePanningConfig = { ...DEFAULT_EDGE_PANNING_CONFIG };

  private edgePanningAnimation?: () => void;

  private lastMousePosition: { x: number; y: number } = { x: 0, y: 0 };

  constructor(props: TCameraProps, parent: Component) {
    super(props, parent);

    this.camera = this.context.camera;
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

    this.props.root?.removeEventListener("wheel", this.handleWheelEvent);
    this.removeEventListener("mousedown", this.handleMouseDownEvent);
    this.disableEdgePanning();
  }

  private handleMouseDownEvent = (event: MouseEvent) => {
    if (!this.context.graph.rootStore.settings.getConfigFlag("canDragCamera") || !(event instanceof MouseEvent)) {
      return;
    }
    if (!isMetaKeyEvent(event)) {
      dragListener(this.ownerDocument)
        .on(EVENTS.DRAG_START, (dragEvent: MouseEvent) => this.onDragStart(dragEvent))
        .on(EVENTS.DRAG_UPDATE, (dragEvent: MouseEvent) => this.onDragUpdate(dragEvent))
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

  /**
   * Включает автоматическое перемещение камеры при приближении мыши к границам viewport
   * @param config Конфигурация edge panning (частичная)
   * @returns void
   */
  public enableEdgePanning(config: Partial<TEdgePanningConfig> = {}): void {
    this.edgePanningConfig = { ...this.edgePanningConfig, ...config, enabled: true };

    if (this.props.root) {
      this.props.root.addEventListener("mousemove", this.handleEdgePanningMouseMove);
      this.props.root.addEventListener("mouseleave", this.handleEdgePanningMouseLeave);
    }
  }

  /**
   * Отключает автоматическое перемещение камеры
   * @returns void
   */
  public disableEdgePanning(): void {
    this.edgePanningConfig.enabled = false;

    if (this.props.root) {
      this.props.root.removeEventListener("mousemove", this.handleEdgePanningMouseMove);
      this.props.root.removeEventListener("mouseleave", this.handleEdgePanningMouseLeave);
    }

    this.stopEdgePanningAnimation();
  }

  private handleEdgePanningMouseMove = (event: MouseEvent): void => {
    if (!this.edgePanningConfig.enabled || !this.props.root) {
      return;
    }

    this.lastMousePosition = { x: event.clientX, y: event.clientY };
    this.updateEdgePanning();
  };

  private handleEdgePanningMouseLeave = (): void => {
    this.stopEdgePanningAnimation();
  };

  private updateEdgePanning(): void {
    if (!this.edgePanningConfig.enabled || !this.props.root) {
      return;
    }

    const rect = this.props.root.getBoundingClientRect();
    const { x, y } = this.lastMousePosition;
    const { edgeSize, speed } = this.edgePanningConfig;

    // Вычисляем расстояния до границ
    const distanceToLeft = x - rect.left;
    const distanceToRight = rect.right - x;
    const distanceToTop = y - rect.top;
    const distanceToBottom = rect.bottom - y;

    let deltaX = 0;
    let deltaY = 0;

    // Проверяем левую границу - при приближении к левому краю двигаем камеру вправо
    if (distanceToLeft < edgeSize && distanceToLeft >= 0) {
      const intensity = 1 - distanceToLeft / edgeSize;
      deltaX = speed * intensity; // Положительный - камера двигается вправо
    }
    // Проверяем правую границу - при приближении к правому краю двигаем камеру влево
    else if (distanceToRight < edgeSize && distanceToRight >= 0) {
      const intensity = 1 - distanceToRight / edgeSize;
      deltaX = -speed * intensity; // Отрицательный - камера двигается влево
    }

    // Проверяем верхнюю границу - при приближении к верхнему краю двигаем камеру вниз
    if (distanceToTop < edgeSize && distanceToTop >= 0) {
      const intensity = 1 - distanceToTop / edgeSize;
      deltaY = speed * intensity; // Положительный - камера двигается вниз
    }
    // Проверяем нижнюю границу - при приближении к нижнему краю двигаем камеру вверх
    else if (distanceToBottom < edgeSize && distanceToBottom >= 0) {
      const intensity = 1 - distanceToBottom / edgeSize;
      deltaY = -speed * intensity; // Отрицательный - камера двигается вверх
    }

    // Если нужно двигать камеру
    if (deltaX !== 0 || deltaY !== 0) {
      this.startEdgePanningAnimation(deltaX, deltaY);
    } else {
      this.stopEdgePanningAnimation();
    }
  }

  private startEdgePanningAnimation(deltaX: number, deltaY: number): void {
    // Останавливаем предыдущую анимацию
    this.stopEdgePanningAnimation();

    // Используем schedule с высоким приоритетом и частотой обновления каждый фрейм
    this.edgePanningAnimation = schedule(
      () => {
        if (this.edgePanningConfig.enabled) {
          this.camera.move(deltaX, deltaY);
        }
      },
      {
        priority: ESchedulerPriority.HIGH,
        frameInterval: 1, // Каждый фрейм
        once: false, // Повторяющаяся анимация
      }
    );
  }

  private stopEdgePanningAnimation(): void {
    if (this.edgePanningAnimation) {
      this.edgePanningAnimation(); // Вызываем функцию для остановки
      this.edgePanningAnimation = undefined;
    }
  }
}
