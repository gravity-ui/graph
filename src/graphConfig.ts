import { GraphComponent } from "./components/canvas/GraphComponent";
import { Block } from "./components/canvas/blocks/Block";
import { ESelectionStrategy } from "./services/selection";

export type TGraphColors = {
  canvas?: Partial<TCanvasColors>;
  block?: Partial<TBlockColors>;
  anchor?: Partial<TAnchorColors>;
  connection?: Partial<TConnectionColors>;
  connectionLabel?: Partial<TConnectionLabelColors>;
  selection?: Partial<TSelectionColors>;
};

export type TSelectionColors = {
  background: string;
  border: string;
};

export type TConnectionLabelColors = {
  background: string;
  hoverBackground: string;
  selectedBackground: string;
  text: string;
  hoverText: string;
  selectedText: string;
};

export type TConnectionColors = {
  background: string;
  selectedBackground: string;
};

export type TAnchorColors = {
  background: string;
  selectedBorder: string;
};

export type TBlockColors = {
  background: string;
  border: string;
  text: string;
  selectedBorder: string;
};

export type TCanvasColors = {
  belowLayerBackground: string;
  layerBackground: string;
  dots: string;
  border: string;
};

export type TMouseWheelBehavior = "zoom" | "scroll";

export const initGraphColors: TGraphColors = {
  anchor: {
    background: "#4a4a4a",
    selectedBorder: "#FFCC00",
  },
  block: {
    background: "#e0e0e0",
    border: "#dfdfdf",
    text: "#272727",
    selectedBorder: "#FFCC00",
  },
  canvas: {
    belowLayerBackground: "#eaeaea",
    layerBackground: "#f9f9f9",
    border: "#EAEAEAFF",
    dots: "#d0d2ce",
  },
  connection: {
    background: "#272727",
    selectedBackground: "#ecc113",
  },
  connectionLabel: {
    background: "#EAEAEA",
    hoverBackground: "#FFCC00",
    selectedBackground: "#FFCC00",
    text: "#777677",
    hoverText: "#777677",
    selectedText: "#777677",
  },
  selection: {
    background: "rgba(0, 0, 0, 0.051)",
    border: "#ecc113",
  },
};

/**
 * Constructor type for any class that extends GraphComponent
 */
export type GraphComponentConstructor = new (...args: unknown[]) => GraphComponent;

export type TGraphConstants = {
  /**
   * Configuration for the selection layer behavior.
   * The selection layer is responsible for rendering the selection rectangle
   * and managing which entities can be selected when the user draws a selection box on the canvas.
   */
  selectionLayer: {
    /**
     * List of entity types that can be selected via the selection rectangle.
     *
     * Only entities whose constructors are included in this array will be selectable
     * when the user draws a selection rectangle on the canvas. This allows fine-grained
     * control over which types of graph components can be multi-selected.
     *
     * @remarks
     * - By default, only `Block` entities are selectable
     * - You can extend this to include other entity types like connections, anchors, etc.
     * - Each entry must be a constructor (class) that extends `GraphComponent`
     *
     * @example
     * ```typescript
     * // Allow selecting both blocks and connections
     * selectionLayer: {
     *   SELECTABLE_ENTITY_TYPES: [GraphComponent, Block, Connection]
     * }
     * ```
     *
     * @default [Block]
     */
    SELECTABLE_ENTITY_TYPES: GraphComponentConstructor[];
    /**
     * Selection strategy that determines how newly selected entities interact with existing selection.
     *
     * Available strategies:
     * - **`REPLACE`** - New selection replaces the current selection entirely
     * - **`APPEND`** - New selection is added to the current selection
     * - **`SUBTRACT`** - New selection is removed from the current selection
     * - **`TOGGLE`** - New selection toggles the selection state of entities
     *
     * @remarks
     * This strategy is applied when the user completes drawing a selection rectangle
     * and determines how the entities inside the rectangle affect the overall selection state.
     *
     * @example
     * ```typescript
     * // Additive selection mode
     * selectionLayer: {
     *   STRATEGY: ESelectionStrategy.APPEND
     * }
     * ```
     *
     * @default ESelectionStrategy.REPLACE
     */
    STRATEGY?: ESelectionStrategy;

    /**
     * Selection strategy that determines how newly selected entities interact with existing selection when Shift key is pressed.
     *
     * Available strategies:
     * - **`REPLACE`** - New selection replaces the current selection entirely
     * - **`APPEND`** - New selection is added to the current selection
     * - **`SUBTRACT`** - New selection is removed from the current selection
     * - **`TOGGLE`** - New selection toggles the selection state of entities
     *
     * @default ESelectionStrategy.APPEND
     */
    SHIFT_STRATEGY?: ESelectionStrategy;
  };

  system: {
    GRID_SIZE: number;
    /**
     * @deprecated this config is not used anymore, Layers checks devicePixelRatio internally
     */
    PIXEL_RATIO: number;
    USABLE_RECT_GAP: number;
    /** For preload blocks on the html layer (camera dimensions * (1 + this value)) */
    CAMERA_VIEWPORT_TRESHOLD: number;
  };

  camera: {
    /* Speed camera scale */
    SPEED: number;
    /* Step on camera scale */
    STEP: number;
    /**
     * Auto-panning threshold: distance from edge in pixels to activate auto-panning
     * @default 50
     */
    AUTO_PAN_THRESHOLD: number;
    /**
     * Auto-panning speed: base pixels per frame for camera movement
     * @default 10
     */
    AUTO_PAN_SPEED: number;
    /**
     * Controls the behavior of mouse wheel events.
     *
     * - **"zoom"**: Mouse wheel will zoom in/out the graph
     * - **"scroll"**: Mouse wheel will scroll the graph vertically by default, or horizontally when Shift is pressed
     *
     * @remarks
     * **Mouse wheel scrolling behavior:**
     * - Default scroll direction is vertical (up/down)
     * - Holding Shift key switches to horizontal scrolling (left/right)
     * - This is an environment-dependent behavior as per W3C UI Events specification
     * - Different browsers and operating systems may handle Shift+wheel differently
     *
     * **Trackpad behavior:**
     * - This setting only affects mouse wheel behavior
     * - Trackpad gestures remain unchanged and use their native behavior:
     *   - Pinch to zoom
     *   - Two-finger swipe to scroll in any direction
     *
     * @default "zoom"
     * @see https://w3c.github.io/uievents/#events-wheelevents - W3C UI Events Wheel Events specification
     */
    MOUSE_WHEEL_BEHAVIOR: TMouseWheelBehavior;
    /**
     * Multiplier for trackpad pinch-to-zoom gesture speed.
     * Applied when zooming with trackpad using pinch gesture (Cmd/Ctrl + scroll).
     *
     * @default 1
     */
    PINCH_ZOOM_SPEED: number;
  };

  block: {
    WIDTH_MIN: number;
    BORDER_WIDTH: number;
    HEAD_HEIGHT: number;
    BODY_PADDING: number;
    SCALES: [number, number, number];
    DEFAULT_Z_INDEX: number;
    INCRIMENT_Z_INDEX: number;
    GHOST_BLOCK_OPACITY: number;
    WIDTH: number;
    HEIGHT: number;
    SNAPPING_GRID_SIZE: number;
  };

  connection: {
    MUTED_CANVAS_CONNECTION_WIDTH: number;
    SCALES: [number, number, number];
    DEFAULT_Z_INDEX: number;
    THRESHOLD_LINE_HIT: number;
    MIN_ZOOM_FOR_CONNECTION_ARROW_AND_LABEL: number;
    /** Size of Path2D chunks for batch rendering */
    PATH2D_CHUNK_SIZE: number;
    LABEL: {
      INNER_PADDINGS: [number, number, number, number];
    };
  };

  text: {
    BASE_FONT_SIZE: number;
    PADDING: number;
  };
};

export const initGraphConstants: TGraphConstants = {
  selectionLayer: {
    SELECTABLE_ENTITY_TYPES: [Block],
    STRATEGY: ESelectionStrategy.REPLACE,
  },
  system: {
    GRID_SIZE: 16,
    /* @deprecated this config is not used anymore, Layers checks devicePixelRatio internally */
    PIXEL_RATIO: typeof globalThis !== "undefined" ? globalThis.devicePixelRatio || 1 : 1,
    USABLE_RECT_GAP: 400,
    CAMERA_VIEWPORT_TRESHOLD: 0.5,
  },
  camera: {
    SPEED: 1,
    STEP: 0.008,
    AUTO_PAN_THRESHOLD: 50,
    AUTO_PAN_SPEED: 5,
    MOUSE_WHEEL_BEHAVIOR: "zoom",
    PINCH_ZOOM_SPEED: 1,
  },
  block: {
    WIDTH_MIN: 16 * 10,
    BORDER_WIDTH: 3,
    HEAD_HEIGHT: 16 * 4,
    BODY_PADDING: 16 * 1.5,
    SCALES: [0.125, 0.225, 0.7],
    DEFAULT_Z_INDEX: 1,
    INCRIMENT_Z_INDEX: 10,
    GHOST_BLOCK_OPACITY: 0.7,
    WIDTH: 200,
    HEIGHT: 160,
    SNAPPING_GRID_SIZE: 1,
  },
  connection: {
    MUTED_CANVAS_CONNECTION_WIDTH: 0.8,
    SCALES: [0.01, 0.125, 0.125],
    DEFAULT_Z_INDEX: 0,
    THRESHOLD_LINE_HIT: 8,
    MIN_ZOOM_FOR_CONNECTION_ARROW_AND_LABEL: 0.25,
    PATH2D_CHUNK_SIZE: 100,
    LABEL: {
      INNER_PADDINGS: [0, 0, 0, 0],
    },
  },
  text: {
    BASE_FONT_SIZE: 24,
    PADDING: 10,
  },
};
