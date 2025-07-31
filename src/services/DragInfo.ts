import { Graph } from "../graph";
import { Point } from "../utils/types/shapes";

/**
 * Statefull модель для хранения информации о процессе перетаскивания
 * Использует ленивые вычисления через getter-ы для оптимальной производительности
 */
export class DragInfo {
  protected initialEvent: MouseEvent | null = null;
  protected currentEvent: MouseEvent | null = null;

  // Кэш для координат камеры
  private _startCameraPoint: Point | null = null;
  private _currentCameraPoint: Point | null = null;

  constructor(protected graph: Graph) {}

  /**
   * Сбрасывает состояние DragInfo
   * @returns void
   */
  public reset(): void {
    this.initialEvent = null;
    this.currentEvent = null;
    this._startCameraPoint = null;
    this._currentCameraPoint = null;
  }

  /**
   * Инициализирует начальное состояние перетаскивания
   * @param event - Начальное событие мыши
   * @returns void
   */
  public init(event: MouseEvent): void {
    this.initialEvent = event;
    this.currentEvent = event;
    this._startCameraPoint = null; // Будет вычислен лениво
    this._currentCameraPoint = null;
  }

  /**
   * Обновляет текущее состояние перетаскивания
   * @param event - Текущее событие мыши
   * @returns void
   */
  public update(event: MouseEvent): void {
    this.currentEvent = event;
    this._currentCameraPoint = null; // Сбрасываем кэш для перевычисления
  }

  /**
   * Завершает процесс перетаскивания
   * @param event - Финальное событие мыши
   * @returns void
   */
  public end(event: MouseEvent): void {
    this.currentEvent = event;
    this._currentCameraPoint = null; // Финальное обновление
  }

  // === ЛЕНИВЫЕ ГЕТТЕРЫ ДЛЯ ЭКРАННЫХ КООРДИНАТ ===

  /**
   * Начальные координаты X в экранном пространстве
   */
  public get startX(): number {
    return this.initialEvent?.clientX ?? 0;
  }

  /**
   * Начальные координаты Y в экранном пространстве
   */
  public get startY(): number {
    return this.initialEvent?.clientY ?? 0;
  }

  /**
   * Текущие координаты X в экранном пространстве
   */
  public get lastX(): number {
    return this.currentEvent?.clientX ?? this.startX;
  }

  /**
   * Текущие координаты Y в экранном пространстве
   */
  public get lastY(): number {
    return this.currentEvent?.clientY ?? this.startY;
  }

  // === ЛЕНИВЫЕ ГЕТТЕРЫ ДЛЯ КООРДИНАТ КАМЕРЫ ===

  /**
   * Начальные координаты в пространстве камеры
   */
  protected get startCameraPoint(): Point {
    if (!this._startCameraPoint && this.initialEvent) {
      this._startCameraPoint = this.graph.getPointInCameraSpace(this.initialEvent);
    }
    return this._startCameraPoint ?? new Point(0, 0);
  }

  /**
   * Текущие координаты в пространстве камеры
   */
  protected get currentCameraPoint(): Point {
    if (!this._currentCameraPoint && this.currentEvent) {
      this._currentCameraPoint = this.graph.getPointInCameraSpace(this.currentEvent);
    }
    return this._currentCameraPoint ?? this.startCameraPoint;
  }

  /**
   * Начальная координата X в пространстве камеры
   */
  public get startCameraX(): number {
    return this.startCameraPoint.x;
  }

  /**
   * Начальная координата Y в пространстве камеры
   */
  public get startCameraY(): number {
    return this.startCameraPoint.y;
  }

  /**
   * Текущая координата X в пространстве камеры
   */
  public get lastCameraX(): number {
    return this.currentCameraPoint.x;
  }

  /**
   * Текущая координата Y в пространстве камеры
   */
  public get lastCameraY(): number {
    return this.currentCameraPoint.y;
  }

  // === ВЫЧИСЛЯЕМЫЕ СВОЙСТВА ===

  /**
   * Разность координат в экранном пространстве
   */
  public get screenDelta(): { x: number; y: number } {
    return {
      x: this.lastX - this.startX,
      y: this.lastY - this.startY,
    };
  }

  /**
   * Разность координат в пространстве камеры
   */
  public get worldDelta(): { x: number; y: number } {
    return {
      x: this.lastCameraX - this.startCameraX,
      y: this.lastCameraY - this.startCameraY,
    };
  }

  /**
   * Расстояние перетаскивания в экранном пространстве
   */
  public get screenDistance(): number {
    const delta = this.screenDelta;
    return Math.sqrt(delta.x * delta.x + delta.y * delta.y);
  }

  /**
   * Расстояние перетаскивания в пространстве камеры
   */
  public get worldDistance(): number {
    const delta = this.worldDelta;
    return Math.sqrt(delta.x * delta.x + delta.y * delta.y);
  }

  /**
   * Направление перетаскивания в пространстве камеры
   */
  public get worldDirection(): "horizontal" | "vertical" | "diagonal" | "none" {
    const delta = this.worldDelta;
    const deltaX = Math.abs(delta.x);
    const deltaY = Math.abs(delta.y);

    if (deltaX < 3 && deltaY < 3) return "none";

    const ratio = deltaX / deltaY;
    if (ratio > 2) return "horizontal";
    if (ratio < 0.5) return "vertical";
    return "diagonal";
  }

  /**
   * Проверяет, является ли перетаскивание микросдвигом
   * @param threshold - Порог расстояния в пикселях (по умолчанию 5)
   * @returns true если расстояние меньше порога
   */
  public isMicroDrag(threshold = 5): boolean {
    return this.worldDistance < threshold;
  }

  /**
   * Продолжительность перетаскивания в миллисекундах
   */
  public get duration(): number {
    if (!this.initialEvent || !this.currentEvent) return 0;
    return this.currentEvent.timeStamp - this.initialEvent.timeStamp;
  }

  /**
   * Скорость перетаскивания в пикселях в миллисекунду
   */
  public get velocity(): { vx: number; vy: number } {
    const duration = this.duration;
    if (duration <= 0) return { vx: 0, vy: 0 };

    const delta = this.worldDelta;
    return {
      vx: delta.x / duration,
      vy: delta.y / duration,
    };
  }

  /**
   * Исходное событие мыши
   */
  public get initialMouseEvent(): MouseEvent | null {
    return this.initialEvent;
  }

  /**
   * Текущее событие мыши
   */
  public get currentMouseEvent(): MouseEvent | null {
    return this.currentEvent;
  }

  /**
   * Проверяет, инициализирован ли DragInfo
   */
  public get isInitialized(): boolean {
    return this.initialEvent !== null;
  }

  /**
   * Проверяет, есть ли движение с момента инициализации
   */
  public get hasMovement(): boolean {
    return this.currentEvent !== this.initialEvent;
  }
}
