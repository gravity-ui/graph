import { Graph } from "../graph";
import { Point } from "../utils/types/shapes";

/**
 * Стадии жизненного цикла перетаскивания
 */
export type DragStage = "start" | "dragging" | "drop";

/**
 * Интерфейс для модификатора позиции при перетаскивании
 */
export interface PositionModifier {
  name: string;
  priority: number;

  /** Проверяет, применим ли модификатор для данной позиции */
  applicable: (pos: Point, dragInfo: DragInfo, ctx: DragContext) => boolean;

  /** Предлагает новую позицию (ленивое вычисление) */
  suggest: (pos: Point, dragInfo: DragInfo, ctx: DragContext) => Point | null;
}

/**
 * Контекст для модификаторов перетаскивания
 */
export interface DragContext {
  graph: Graph;
  currentPosition: Point;
  stage: DragStage;
  [key: string]: unknown;
}

/**
 * Предложение модификатора с ленивым вычислением
 */
export interface ModifierSuggestion {
  name: string;
  priority: number;
  distance: number | null;

  /** Получает предложенную позицию (с кэшированием) */
  getSuggestedPosition(): Point | null;

  /** @private Ленивая функция вычисления */
  _suggester: () => Point | null;

  /** @private Кэш позиции */
  _cachedPosition?: Point | null;
}

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

  // Система модификаторов позиции
  private modifiers: PositionModifier[] = [];
  private suggestions: ModifierSuggestion[] = [];
  private selectedModifier: string | null = null;
  private contextCache: DragContext | null = null;
  private customContext: Record<string, unknown>;

  // Стадия перетаскивания
  private currentStage: DragStage = "start";

  // Позиция перетаскиваемой сущности
  private entityStartPosition: Point | null = null;
  private mouseToEntityOffset: Point | null = null;

  constructor(
    protected graph: Graph,
    modifiers: PositionModifier[] = [],
    customContext?: Record<string, unknown>,
    initialEntityPosition?: { x: number; y: number }
  ) {
    this.modifiers = modifiers;
    this.customContext = customContext || {};

    if (initialEntityPosition) {
      this.entityStartPosition = new Point(initialEntityPosition.x, initialEntityPosition.y);
    }
  }

  /**
   * Сбрасывает состояние DragInfo
   * @returns void
   */
  public reset(): void {
    this.initialEvent = null;
    this.currentEvent = null;
    this._startCameraPoint = null;
    this._currentCameraPoint = null;
    this.suggestions = [];
    this.selectedModifier = null;
    this.contextCache = null;
    this.currentStage = "start"; // Возвращаем к начальной стадии
    // Кастомный контекст не сбрасываем, так как он задается при создании DragInfo
  }

  /**
   * Получает текущую стадию перетаскивания
   */
  public get stage(): DragStage {
    return this.currentStage;
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
    this.currentStage = "start"; // Устанавливаем стадию инициализации

    // Вычисляем offset между мышью и сущностью при инициализации
    if (this.entityStartPosition) {
      const mouseStartPoint = this.graph.getPointInCameraSpace(event);
      this.mouseToEntityOffset = new Point(
        mouseStartPoint.x - this.entityStartPosition.x,
        mouseStartPoint.y - this.entityStartPosition.y
      );
    }
  }

  public get context(): DragContext | null {
    return this.getDragContext();
  }

  /**
   * Обновляет текущее состояние перетаскивания
   * @param event - Текущее событие мыши
   * @returns void
   */
  public update(event: MouseEvent): void {
    this.currentEvent = event;
    this._currentCameraPoint = null; // Сбрасываем кэш для перевычисления
    this.currentStage = "dragging"; // Устанавливаем стадию активного перетаскивания
    this.contextCache = null; // Сбрасываем кэш контекста для обновления stage
  }

  /**
   * Завершает процесс перетаскивания
   * @param event - Финальное событие мыши
   * @returns void
   */
  public end(event: MouseEvent): void {
    this.currentEvent = event;
    this._currentCameraPoint = null; // Финальное обновление
    this.currentStage = "drop"; // Устанавливаем стадию завершения
    this.contextCache = null; // Сбрасываем кэш контекста для обновления stage
  }

  /**
   * Обновляет кастомный контекст во время операции перетаскивания
   * @param newContext - Новые данные контекста для объединения с существующими
   * @returns void
   */
  public updateContext(newContext: Record<string, unknown>): void {
    this.customContext = { ...this.customContext, ...newContext };
    this.contextCache = null; // Сбрасываем кэш контекста для перевычисления
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

  // === СИСТЕМА МОДИФИКАТОРОВ ПОЗИЦИИ ===

  /**
   * Анализирует все модификаторы и создает предложения
   * @returns void
   */
  public analyzeSuggestions(): void {
    if (this.modifiers.length === 0) {
      this.suggestions = [];
      return;
    }

    // Используем позицию сущности для модификаторов, а не позицию мыши
    const entityPos = this.currentEntityPosition;
    const context = this.getDragContext();

    this.suggestions = this.modifiers
      .filter((m) => m.applicable(entityPos, this, context))
      .map((modifier) => this.createSuggestion(modifier, entityPos, context));
  }

  /**
   * Создает ленивое предложение модификатора
   * @param modifier - Модификатор позиции
   * @param pos - Исходная позиция
   * @param ctx - Контекст перетаскивания
   * @returns Предложение с ленивым вычислением
   */
  private createSuggestion(modifier: PositionModifier, pos: Point, ctx: DragContext): ModifierSuggestion {
    return {
      name: modifier.name,
      priority: modifier.priority,
      distance: null, // Ленивое вычисление
      _suggester: () => modifier.suggest(pos, this, ctx),
      _cachedPosition: undefined,

      getSuggestedPosition(): Point | null {
        if (this._cachedPosition === undefined) {
          this._cachedPosition = this._suggester();
        }
        return this._cachedPosition;
      },
    };
  }

  /**
   * Выбирает модификатор по приоритету (первый с наименьшим приоритетом)
   * @returns void
   */
  public selectByPriority(): void {
    const best = this.suggestions.sort((a, b) => a.priority - b.priority)[0];
    this.selectedModifier = best?.name || null;
  }

  /**
   * Выбирает модификатор по расстоянию (ближайший к исходной позиции)
   * @returns void
   */
  public selectByDistance(): void {
    const withDistances = this.suggestions
      .map((s) => ({
        ...s,
        distance: this.calculateDistance(s),
      }))
      .sort((a, b) => a.distance - b.distance);

    this.selectedModifier = withDistances[0]?.name || null;
  }

  /**
   * Выбирает модификатор с помощью кастомной функции
   * @param selector - Функция выбора модификатора
   * @returns void
   */
  public selectByCustom(selector: (suggestions: ModifierSuggestion[]) => string | null): void {
    this.selectedModifier = selector(this.suggestions);
  }

  /**
   * Выбирает конкретный модификатор по имени
   * @param name - Имя модификатора
   * @returns void
   */
  public selectModifier(name: string): void {
    if (this.suggestions.some((s) => s.name === name)) {
      this.selectedModifier = name;
    }
  }

  /**
   * Выбирает модификатор по умолчанию (по расстоянию)
   * @returns void
   */
  public selectDefault(): void {
    this.selectByDistance();
  }

  /**
   * Вычисляет расстояние от исходной до предложенной позиции
   * @param suggestion - Предложение модификатора
   * @returns Расстояние в пикселях
   */
  private calculateDistance(suggestion: ModifierSuggestion): number {
    const original = new Point(this.lastCameraX, this.lastCameraY);
    const suggested = suggestion.getSuggestedPosition();

    if (!suggested) return Infinity;

    return Math.sqrt((suggested.x - original.x) ** 2 + (suggested.y - original.y) ** 2);
  }

  /**
   * Проверяет, применим ли модификатор с указанным именем
   * @param modifierName - Имя модификатора
   * @returns true если модификатор применим
   */
  public isApplicable(modifierName: string): boolean {
    return this.suggestions.some((s) => s.name === modifierName);
  }

  /**
   * Проверяет, применен ли модификатор с указанным именем
   * @param modifierName - Имя модификатора
   * @returns true если модификатор применен
   */
  public isModified(modifierName: string): boolean {
    return this.selectedModifier === modifierName;
  }

  /**
   * Получает скорректированную позицию с учетом примененного модификатора
   */
  public get adjustedPosition(): Point {
    if (!this.selectedModifier) {
      return new Point(this.lastCameraX, this.lastCameraY);
    }

    const suggestion = this.suggestions.find((s) => s.name === this.selectedModifier);
    const adjustedPos = suggestion?.getSuggestedPosition();

    return adjustedPos || new Point(this.lastCameraX, this.lastCameraY);
  }

  /**
   * Получает скорректированную координату X
   */
  public get adjustedCameraX(): number {
    return this.adjustedPosition.x;
  }

  /**
   * Получает скорректированную координату Y
   */
  public get adjustedCameraY(): number {
    return this.adjustedPosition.y;
  }

  // === ПОЗИЦИЯ СУЩНОСТИ ===

  /**
   * Начальная позиция сущности
   */
  public get entityStartX(): number {
    return this.entityStartPosition?.x ?? 0;
  }

  /**
   * Начальная позиция сущности
   */
  public get entityStartY(): number {
    return this.entityStartPosition?.y ?? 0;
  }

  /**
   * Текущая позиция сущности (без модификаторов)
   */
  public get currentEntityPosition(): Point {
    if (!this.entityStartPosition || !this.mouseToEntityOffset) {
      // Fallback к позиции мыши если нет данных о сущности
      return new Point(this.lastCameraX, this.lastCameraY);
    }

    const currentMousePos = new Point(this.lastCameraX, this.lastCameraY);
    return new Point(currentMousePos.x - this.mouseToEntityOffset.x, currentMousePos.y - this.mouseToEntityOffset.y);
  }

  /**
   * Скорректированная позиция сущности с учетом модификаторов
   */
  public get adjustedEntityPosition(): Point {
    if (!this.selectedModifier) {
      return this.currentEntityPosition;
    }

    const suggestion = this.suggestions.find((s) => s.name === this.selectedModifier);
    const adjustedPos = suggestion?.getSuggestedPosition();

    return adjustedPos || this.currentEntityPosition;
  }

  /**
   * Скорректированная X координата сущности
   */
  public get adjustedEntityX(): number {
    return this.adjustedEntityPosition.x;
  }

  /**
   * Скорректированная Y координата сущности
   */
  public get adjustedEntityY(): number {
    return this.adjustedEntityPosition.y;
  }

  /**
   * Дельта между начальной и скорректированной позицией сущности
   * Используется для применения той же дельты к другим сущностям
   */
  public get adjustedWorldDelta(): { x: number; y: number } {
    if (!this.entityStartPosition) {
      return { x: 0, y: 0 };
    }

    const adjustedPos = this.adjustedEntityPosition;
    return {
      x: adjustedPos.x - this.entityStartPosition.x,
      y: adjustedPos.y - this.entityStartPosition.y,
    };
  }

  /**
   * Применяет скорректированную дельту к произвольной начальной позиции
   * @param startX - Начальная X координата сущности
   * @param startY - Начальная Y координата сущности
   * @returns Новая позиция с примененной дельтой
   */
  public applyAdjustedDelta(startX: number, startY: number): { x: number; y: number } {
    const delta = this.adjustedWorldDelta;
    return {
      x: startX + delta.x,
      y: startY + delta.y,
    };
  }

  // === КОНТЕКСТ ПЕРЕТАСКИВАНИЯ ===

  /**
   * Получает контекст перетаскивания (с кэшированием)
   * @returns Контекст перетаскивания
   */
  private getDragContext(): DragContext {
    if (!this.contextCache) {
      this.contextCache = this.createSimpleContext();
    }
    return this.contextCache;
  }

  /**
   * Создает простой контекст перетаскивания
   * @returns Базовый контекст с дополнительными данными от пользователя
   */
  private createSimpleContext(): DragContext {
    const mousePos = new Point(this.lastCameraX, this.lastCameraY);
    const entityPos = this.currentEntityPosition;

    return {
      graph: this.graph,
      currentPosition: mousePos, // Позиция мыши (для совместимости)
      currentEntityPosition: entityPos, // Позиция сущности
      entityStartPosition: this.entityStartPosition,
      stage: this.currentStage, // Текущая стадия перетаскивания
      // Добавляем пользовательский контекст
      ...this.customContext,
    };
  }
}
