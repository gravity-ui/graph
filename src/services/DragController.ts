import { Graph } from "../graph";
import { ESchedulerPriority, scheduler } from "../lib/Scheduler";
import { dragListener } from "../utils/functions/dragListener";
import { EVENTS } from "../utils/types/events";

import { TEdgePanningConfig } from "./camera/Camera";

/**
 * Интерфейс для компонентов, которые могут быть перетаскиваемыми
 */
export interface DragHandler {
  /**
   * Вызывается при начале перетаскивания
   * @param event - Событие мыши
   */
  onDraggingStart(event: MouseEvent): void;

  /**
   * Вызывается при обновлении позиции во время перетаскивания
   * @param event - Событие мыши
   */
  onDragUpdate(event: MouseEvent): void;

  /**
   * Вызывается при завершении перетаскивания
   * @param event - Событие мыши
   */
  onDragEnd(event: MouseEvent): void;
}

/**
 * Конфигурация для DragController
 */
export interface DragControllerConfig {
  /** Включить автоматическое движение камеры при приближении к границам */
  enableEdgePanning?: boolean;
  /** Конфигурация edge panning */
  edgePanningConfig?: Partial<TEdgePanningConfig>;
}

/**
 * Централизованный контроллер для управления перетаскиванием компонентов
 */
export class DragController {
  private graph: Graph;

  private currentDragHandler?: DragHandler;

  private isDragging = false;

  private lastMouseEvent?: MouseEvent;

  private updateScheduler?: () => void;

  constructor(graph: Graph) {
    this.graph = graph;
  }

  /**
   * Начинает процесс перетаскивания для указанного компонента
   * @param component - Компонент, который будет перетаскиваться
   * @param event - Исходное событие мыши
   * @param config - Конфигурация перетаскивания
   * @returns void
   */
  public start(component: DragHandler, event: MouseEvent, config: DragControllerConfig = {}): void {
    if (this.isDragging) {
      // eslint-disable-next-line no-console
      console.warn("DragController: attempt to start dragging while already dragging");
      return;
    }

    this.currentDragHandler = component;
    this.isDragging = true;
    this.lastMouseEvent = event;

    // Включаем edge panning если необходимо
    if (config.enableEdgePanning ?? true) {
      const camera = this.graph.getGraphLayer().$.camera;
      const defaultConfig = this.graph.graphConstants.camera.EDGE_PANNING;

      camera.enableEdgePanning({
        speed: config.edgePanningConfig?.speed || defaultConfig.SPEED,
        edgeSize: config.edgePanningConfig?.edgeSize || defaultConfig.EDGE_SIZE,
      });

      // Запускаем периодическое обновление компонента для синхронизации с движением камеры
      this.startContinuousUpdate();
    }

    // TODO: Нужно передать EventedComponent вместо DragController
    // this.graph.getGraphLayer().captureEvents(this);

    // Вызываем обработчик начала перетаскивания
    component.onDraggingStart(event);

    // Запускаем dragListener для отслеживания движений мыши
    this.startDragListener(event);
  }

  /**
   * Обновляет состояние перетаскивания
   * @param event - Событие мыши
   * @returns void
   */
  public update(event: MouseEvent): void {
    if (!this.isDragging || !this.currentDragHandler) {
      return;
    }

    this.lastMouseEvent = event;
    this.currentDragHandler.onDragUpdate(event);
  }

  /**
   * Завершает процесс перетаскивания
   * @param event - Событие мыши
   * @returns void
   */
  public end(event: MouseEvent): void {
    if (!this.isDragging || !this.currentDragHandler) {
      return;
    }

    // TODO: Нужно передать EventedComponent вместо DragController
    // this.graph.getGraphLayer().releaseCapture();

    // Останавливаем непрерывное обновление
    this.stopContinuousUpdate();

    // Отключаем edge panning
    const camera = this.graph.getGraphLayer().$.camera;
    camera.disableEdgePanning();

    // Вызываем обработчик завершения перетаскивания
    this.currentDragHandler.onDragEnd(event);

    // Сбрасываем состояние
    this.currentDragHandler = undefined;
    this.isDragging = false;
    this.lastMouseEvent = undefined;
  }

  /**
   * Проверяет, происходит ли в данный момент перетаскивание
   * @returns true если происходит перетаскивание
   */
  public isDragInProgress(): boolean {
    return this.isDragging;
  }

  /**
   * Получает текущий перетаскиваемый компонент
   * @returns текущий DragHandler или undefined
   */
  public getCurrentDragHandler(): DragHandler | undefined {
    return this.currentDragHandler;
  }

  /**
   * Запускает непрерывное обновление компонента для синхронизации с движением камеры
   * @returns void
   */
  private startContinuousUpdate(): void {
    if (this.updateScheduler) {
      return;
    }

    const update = () => {
      if (!this.isDragging || !this.currentDragHandler || !this.lastMouseEvent) {
        return;
      }

      // Создаем синтетическое событие мыши с текущими координатами
      // Это позволяет компонентам обновлять свою позицию при движении камеры
      // даже когда физическое движение мыши не происходит
      const syntheticEvent = new MouseEvent("mousemove", {
        clientX: this.lastMouseEvent.clientX,
        clientY: this.lastMouseEvent.clientY,
        bubbles: false,
        cancelable: false,
      });

      // Копируем pageX/pageY вручную, так как в MouseEventInit их нет
      Object.defineProperty(syntheticEvent, "pageX", { value: this.lastMouseEvent.pageX });
      Object.defineProperty(syntheticEvent, "pageY", { value: this.lastMouseEvent.pageY });

      // TODO: лучше в onDragUpdate передавать только deltaX/deltaY и clientX/clientY

      this.currentDragHandler.onDragUpdate(syntheticEvent);
    };

    // Используем средний приоритет для обновлений чтобы синхронизироваться с движением камеры
    this.updateScheduler = scheduler.addScheduler({ performUpdate: update }, ESchedulerPriority.MEDIUM);
  }

  /**
   * Останавливает непрерывное обновление
   * @returns void
   */
  private stopContinuousUpdate(): void {
    if (this.updateScheduler) {
      this.updateScheduler();
      this.updateScheduler = undefined;
    }
  }

  /**
   * Запускает dragListener для отслеживания событий мыши
   * @param _initialEvent - Начальное событие мыши (не используется)
   * @returns void
   */
  private startDragListener(_initialEvent: MouseEvent): void {
    const ownerDocument = this.graph.getGraphCanvas().ownerDocument;

    dragListener(ownerDocument)
      .on(EVENTS.DRAG_START, (event: MouseEvent) => {
        this.lastMouseEvent = event;
      })
      .on(EVENTS.DRAG_UPDATE, (event: MouseEvent) => {
        this.update(event);
      })
      .on(EVENTS.DRAG_END, (event: MouseEvent) => {
        this.end(event);
      });
  }

  /**
   * Принудительно завершает текущее перетаскивание (например, при размонтировании)
   * @returns void
   */
  public forceEnd(): void {
    if (this.isDragging && this.lastMouseEvent) {
      this.end(this.lastMouseEvent);
    }
  }
}
