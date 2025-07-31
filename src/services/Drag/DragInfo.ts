import { Graph } from "../../graph";
import { Point } from "../../utils/types/shapes";

/**
 * Drag lifecycle stages
 */
export type DragStage = "start" | "dragging" | "drop";

/**
 * Interface for position modifier during dragging
 */
export interface PositionModifier {
  name: string;
  priority: number;

  /** Checks if the modifier is applicable for the given position */
  applicable: (pos: Point, dragInfo: DragInfo, ctx: DragContext) => boolean;

  /** Suggests a new position (lazy evaluation) */
  suggest: (pos: Point, dragInfo: DragInfo, ctx: DragContext) => Point | null;
}

/**
 * Context for drag modifiers
 */
export interface DragContext {
  graph: Graph;
  currentPosition: Point;
  stage: DragStage;
  [key: string]: unknown;
}

/**
 * Modifier suggestion with lazy evaluation
 */
export interface ModifierSuggestion {
  name: string;
  priority: number;
  distance: number | null;

  /** Gets the suggested position (with caching) */
  getSuggestedPosition(): Point | null;

  /** @private Lazy calculation function */
  _suggester: () => Point | null;

  /** @private Position cache */
  _cachedPosition?: Point | null;
}

/**
 * Stateful model for storing drag process information
 * Uses lazy calculations through getters for optimal performance
 */
export class DragInfo {
  protected initialEvent: MouseEvent | null = null;
  protected currentEvent: MouseEvent | null = null;

  // Cache for camera coordinates
  private _startCameraPoint: Point | null = null;
  private _currentCameraPoint: Point | null = null;

  // Position modifier system
  private modifiers: PositionModifier[] = [];
  private suggestions: ModifierSuggestion[] = [];
  private selectedModifier: string | null = null;
  private contextCache: DragContext | null = null;
  private customContext: Record<string, unknown>;

  // Drag stage
  private currentStage: DragStage = "start";

  // Position of the dragged entity
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
   * Resets DragInfo state
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
    this.currentStage = "start"; // Return to initial stage
    // Don't reset custom context as it's set during DragInfo creation
  }

  /**
   * Gets the current drag stage
   */
  public get stage(): DragStage {
    return this.currentStage;
  }

  /**
   * Initializes the initial drag state
   * @param event - Initial mouse event
   * @returns void
   */
  public init(event: MouseEvent): void {
    this.initialEvent = event;
    this.currentEvent = event;
    this._startCameraPoint = null; // Will be calculated lazily
    this._currentCameraPoint = null;
    this.currentStage = "start"; // Set initialization stage

    // Calculate offset between mouse and entity during initialization
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
   * Updates the current drag state
   * @param event - Current mouse event
   * @returns void
   */
  public update(event: MouseEvent): void {
    this.currentEvent = event;
    this._currentCameraPoint = null; // Reset cache for recalculation
    this.currentStage = "dragging"; // Set active drag stage
    this.contextCache = null; // Reset context cache to update stage
  }

  /**
   * Ends the drag process
   * @param event - Final mouse event
   * @returns void
   */
  public end(event: MouseEvent): void {
    this.currentEvent = event;
    this._currentCameraPoint = null; // Final update
    this.currentStage = "drop"; // Set completion stage
    this.contextCache = null; // Reset context cache to update stage
  }

  /**
   * Updates custom context during drag operation
   * @param newContext - New context data to merge with existing
   * @returns void
   */
  public updateContext(newContext: Record<string, unknown>): void {
    this.customContext = { ...this.customContext, ...newContext };
    this.contextCache = null; // Reset context cache for recalculation
  }

  // === LAZY GETTERS FOR SCREEN COORDINATES ===

  /**
   * Initial X coordinates in screen space
   */
  public get startX(): number {
    return this.initialEvent?.clientX ?? 0;
  }

  /**
   * Initial Y coordinates in screen space
   */
  public get startY(): number {
    return this.initialEvent?.clientY ?? 0;
  }

  /**
   * Current X coordinates in screen space
   */
  public get lastX(): number {
    return this.currentEvent?.clientX ?? this.startX;
  }

  /**
   * Current Y coordinates in screen space
   */
  public get lastY(): number {
    return this.currentEvent?.clientY ?? this.startY;
  }

  // === LAZY GETTERS FOR CAMERA COORDINATES ===

  /**
   * Initial coordinates in camera space
   */
  protected get startCameraPoint(): Point {
    if (!this._startCameraPoint && this.initialEvent) {
      this._startCameraPoint = this.graph.getPointInCameraSpace(this.initialEvent);
    }
    return this._startCameraPoint ?? new Point(0, 0);
  }

  /**
   * Current coordinates in camera space
   */
  protected get currentCameraPoint(): Point {
    if (!this._currentCameraPoint && this.currentEvent) {
      this._currentCameraPoint = this.graph.getPointInCameraSpace(this.currentEvent);
    }
    return this._currentCameraPoint ?? this.startCameraPoint;
  }

  /**
   * Initial X coordinate in camera space
   */
  public get startCameraX(): number {
    return this.startCameraPoint.x;
  }

  /**
   * Initial Y coordinate in camera space
   */
  public get startCameraY(): number {
    return this.startCameraPoint.y;
  }

  /**
   * Current X coordinate in camera space
   */
  public get lastCameraX(): number {
    return this.currentCameraPoint.x;
  }

  /**
   * Current Y coordinate in camera space
   */
  public get lastCameraY(): number {
    return this.currentCameraPoint.y;
  }

  // === COMPUTED PROPERTIES ===

  /**
   * Coordinate difference in screen space
   */
  public get screenDelta(): { x: number; y: number } {
    return {
      x: this.lastX - this.startX,
      y: this.lastY - this.startY,
    };
  }

  /**
   * Coordinate difference in camera space
   */
  public get worldDelta(): { x: number; y: number } {
    return {
      x: this.lastCameraX - this.startCameraX,
      y: this.lastCameraY - this.startCameraY,
    };
  }

  /**
   * Drag distance in screen space
   */
  public get screenDistance(): number {
    const delta = this.screenDelta;
    return Math.sqrt(delta.x * delta.x + delta.y * delta.y);
  }

  /**
   * Drag distance in camera space
   */
  public get worldDistance(): number {
    const delta = this.worldDelta;
    return Math.sqrt(delta.x * delta.x + delta.y * delta.y);
  }

  /**
   * Drag direction in camera space
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
   * Checks if dragging is a micro-movement
   * @param threshold - Distance threshold in pixels (default 5)
   * @returns true if distance is less than threshold
   */
  public isMicroDrag(threshold = 5): boolean {
    return this.worldDistance < threshold;
  }

  /**
   * Drag duration in milliseconds
   */
  public get duration(): number {
    if (!this.initialEvent || !this.currentEvent) return 0;
    return this.currentEvent.timeStamp - this.initialEvent.timeStamp;
  }

  /**
   * Drag velocity in pixels per millisecond
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
   * Initial mouse event
   */
  public get initialMouseEvent(): MouseEvent | null {
    return this.initialEvent;
  }

  /**
   * Current mouse event
   */
  public get currentMouseEvent(): MouseEvent | null {
    return this.currentEvent;
  }

  /**
   * Checks if DragInfo is initialized
   */
  public get isInitialized(): boolean {
    return this.initialEvent !== null;
  }

  /**
   * Checks if there's movement since initialization
   */
  public get hasMovement(): boolean {
    return this.currentEvent !== this.initialEvent;
  }

  // === POSITION MODIFIER SYSTEM ===

  /**
   * Analyzes all modifiers and creates suggestions
   * @returns void
   */
  public analyzeSuggestions(): void {
    if (this.modifiers.length === 0) {
      this.suggestions = [];
      return;
    }

    // Use entity position for modifiers, not mouse position
    const entityPos = this.currentEntityPosition;
    const context = this.getDragContext();

    this.suggestions = this.modifiers
      .filter((m) => m.applicable(entityPos, this, context))
      .map((modifier) => this.createSuggestion(modifier, entityPos, context));
  }

  /**
   * Creates a lazy modifier suggestion
   * @param modifier - Position modifier
   * @param pos - Initial position
   * @param ctx - Drag context
   * @returns Suggestion with lazy evaluation
   */
  private createSuggestion(modifier: PositionModifier, pos: Point, ctx: DragContext): ModifierSuggestion {
    return {
      name: modifier.name,
      priority: modifier.priority,
      distance: null, // Lazy evaluation
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
   * Selects modifier by priority (first with lowest priority)
   * @returns void
   */
  public selectByPriority(): void {
    const best = this.suggestions.sort((a, b) => a.priority - b.priority)[0];
    this.selectedModifier = best?.name || null;
  }

  /**
   * Selects modifier by distance (closest to original position)
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
   * Selects modifier using custom function
   * @param selector - Modifier selection function
   * @returns void
   */
  public selectByCustom(selector: (suggestions: ModifierSuggestion[]) => string | null): void {
    this.selectedModifier = selector(this.suggestions);
  }

  /**
   * Selects specific modifier by name
   * @param name - Modifier name
   * @returns void
   */
  public selectModifier(name: string): void {
    if (this.suggestions.some((s) => s.name === name)) {
      this.selectedModifier = name;
    }
  }

  /**
   * Selects default modifier (by distance)
   * @returns void
   */
  public selectDefault(): void {
    this.selectByDistance();
  }

  /**
   * Calculates distance from original to suggested position
   * @param suggestion - Modifier suggestion
   * @returns Distance in pixels
   */
  private calculateDistance(suggestion: ModifierSuggestion): number {
    const original = new Point(this.lastCameraX, this.lastCameraY);
    const suggested = suggestion.getSuggestedPosition();

    if (!suggested) return Infinity;

    return Math.sqrt((suggested.x - original.x) ** 2 + (suggested.y - original.y) ** 2);
  }

  /**
   * Checks if modifier with specified name is applicable
   * @param modifierName - Modifier name
   * @returns true if modifier is applicable
   */
  public isApplicable(modifierName: string): boolean {
    return this.suggestions.some((s) => s.name === modifierName);
  }

  /**
   * Checks if modifier with specified name is applied
   * @param modifierName - Modifier name
   * @returns true if modifier is applied
   */
  public isModified(modifierName: string): boolean {
    return this.selectedModifier === modifierName;
  }

  /**
   * Gets adjusted position considering applied modifier
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
   * Gets adjusted X coordinate
   */
  public get adjustedCameraX(): number {
    return this.adjustedPosition.x;
  }

  /**
   * Gets adjusted Y coordinate
   */
  public get adjustedCameraY(): number {
    return this.adjustedPosition.y;
  }

  // === ENTITY POSITION ===

  /**
   * Initial entity position
   */
  public get entityStartX(): number {
    return this.entityStartPosition?.x ?? 0;
  }

  /**
   * Initial entity position
   */
  public get entityStartY(): number {
    return this.entityStartPosition?.y ?? 0;
  }

  /**
   * Current entity position (without modifiers)
   */
  public get currentEntityPosition(): Point {
    if (!this.entityStartPosition || !this.mouseToEntityOffset) {
      // Fallback to mouse position if no entity data
      return new Point(this.lastCameraX, this.lastCameraY);
    }

    const currentMousePos = new Point(this.lastCameraX, this.lastCameraY);
    return new Point(currentMousePos.x - this.mouseToEntityOffset.x, currentMousePos.y - this.mouseToEntityOffset.y);
  }

  /**
   * Adjusted entity position considering modifiers
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
   * Adjusted entity X coordinate
   */
  public get adjustedEntityX(): number {
    return this.adjustedEntityPosition.x;
  }

  /**
   * Adjusted entity Y coordinate
   */
  public get adjustedEntityY(): number {
    return this.adjustedEntityPosition.y;
  }

  /**
   * Delta between initial and adjusted entity position
   * Used to apply the same delta to other entities
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
   * Applies adjusted delta to arbitrary starting position
   * @param startX - Initial entity X coordinate
   * @param startY - Initial entity Y coordinate
   * @returns New position with applied delta
   */
  public applyAdjustedDelta(startX: number, startY: number): { x: number; y: number } {
    const delta = this.adjustedWorldDelta;
    return {
      x: startX + delta.x,
      y: startY + delta.y,
    };
  }

  // === DRAG CONTEXT ===

  /**
   * Gets drag context (with caching)
   * @returns Drag context
   */
  private getDragContext(): DragContext {
    if (!this.contextCache) {
      this.contextCache = this.createSimpleContext();
    }
    return this.contextCache;
  }

  /**
   * Creates simple drag context
   * @returns Basic context with additional user data
   */
  private createSimpleContext(): DragContext {
    const mousePos = new Point(this.lastCameraX, this.lastCameraY);
    const entityPos = this.currentEntityPosition;

    return {
      graph: this.graph,
      currentPosition: mousePos, // Mouse position (for compatibility)
      currentEntityPosition: entityPos, // Entity position
      entityStartPosition: this.entityStartPosition,
      stage: this.currentStage, // Current drag stage
      // Add user context
      ...this.customContext,
    };
  }
}
