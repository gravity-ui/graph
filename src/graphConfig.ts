import { GraphComponent } from "./components/canvas/GraphComponent";
import { Block } from "./components/canvas/blocks/Block";

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
  /** Opacity for lowlighted connection labels (0-1) */
  lowlightOpacity: number;
};

export type TConnectionColors = {
  background: string;
  selectedBackground: string;
  /** Stroke color for highlighted connections */
  highlightStroke: string;
  /** Opacity for lowlighted connections (0-1) */
  lowlightOpacity: number;
};

export type TAnchorColors = {
  background: string;
  selectedBorder: string;
  /** Border color for highlighted anchors */
  highlightBorder: string;
  /** Opacity for lowlighted anchors (0-1) */
  lowlightOpacity: number;
};

export type TBlockColors = {
  background: string;
  border: string;
  text: string;
  selectedBorder: string;
  /** Border color for highlighted blocks */
  highlightBorder: string;
  /** Opacity for lowlighted blocks (0-1) */
  lowlightOpacity: number;
};

export type TCanvasColors = {
  belowLayerBackground: string;
  layerBackground: string;
  dots: string;
  border: string;
};

export const initGraphColors: TGraphColors = {
  anchor: {
    background: "#4a4a4a",
    selectedBorder: "#FFCC00",
    highlightBorder: "#00BFFF",
    lowlightOpacity: 0.3,
  },
  block: {
    background: "#e0e0e0",
    border: "#dfdfdf",
    text: "#272727",
    selectedBorder: "#FFCC00",
    highlightBorder: "#00BFFF",
    lowlightOpacity: 0.3,
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
    highlightStroke: "#00BFFF",
    lowlightOpacity: 0.3,
  },
  connectionLabel: {
    background: "#EAEAEA",
    hoverBackground: "#FFCC00",
    selectedBackground: "#FFCC00",
    text: "#777677",
    hoverText: "#777677",
    selectedText: "#777677",
    lowlightOpacity: 0.3,
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
  selectionLayer: {
    SELECTABLE_ENTITY_TYPES: GraphComponentConstructor[];
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
  };

  block: {
    WIDTH_MIN: number;
    HEAD_HEIGHT: number;
    BODY_PADDING: number;
    SCALES: [number, number, number];
    DEFAULT_Z_INDEX: number;
    INCRIMENT_Z_INDEX: number;
    GHOST_BLOCK_OPACITY: number;
    WIDTH: number;
    HEIGHT: number;
    SNAPPING_GRID_SIZE: number;
    /** Border width for highlighted blocks */
    HIGHLIGHT_BORDER_SIZE: number;
  };

  anchor: {
    /** Border width for highlighted anchors */
    HIGHLIGHT_BORDER_SIZE: number;
  };

  connection: {
    MUTED_CANVAS_CONNECTION_WIDTH: number;
    SCALES: [number, number, number];
    DEFAULT_Z_INDEX: number;
    THRESHOLD_LINE_HIT: number;
    MIN_ZOOM_FOR_CONNECTION_ARROW_AND_LABEL: number;
    /** Size of Path2D chunks for batch rendering */
    PATH2D_CHUNK_SIZE: number;
    /** Line width for highlighted connections */
    HIGHLIGHT_LINE_WIDTH: number;
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
  },
  block: {
    WIDTH_MIN: 16 * 10,
    HEAD_HEIGHT: 16 * 4,
    BODY_PADDING: 16 * 1.5,
    SCALES: [0.125, 0.225, 0.7],
    DEFAULT_Z_INDEX: 1,
    INCRIMENT_Z_INDEX: 10,
    GHOST_BLOCK_OPACITY: 0.7,
    WIDTH: 200,
    HEIGHT: 160,
    SNAPPING_GRID_SIZE: 1,
    HIGHLIGHT_BORDER_SIZE: 4,
  },
  anchor: {
    HIGHLIGHT_BORDER_SIZE: 3,
  },
  connection: {
    MUTED_CANVAS_CONNECTION_WIDTH: 0.8,
    SCALES: [0.01, 0.125, 0.125],
    DEFAULT_Z_INDEX: 0,
    THRESHOLD_LINE_HIT: 8,
    MIN_ZOOM_FOR_CONNECTION_ARROW_AND_LABEL: 0.25,
    PATH2D_CHUNK_SIZE: 100,
    HIGHLIGHT_LINE_WIDTH: 3,
    LABEL: {
      INNER_PADDINGS: [0, 0, 0, 0],
    },
  },
  text: {
    BASE_FONT_SIZE: 24,
    PADDING: 10,
  },
};
