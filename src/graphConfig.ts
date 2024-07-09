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

export type TGraphConstants = {
  system: {
    GRID_SIZE: number;
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
  };

  connection: {
    MUTED_CANVAS_CONNECTION_WIDTH: number;
    SCALES: [number, number, number];
    DEFAULT_Z_INDEX: number;
    THRESHOLD_LINE_HIT: number;
    MIN_ZOOM_FOR_CONNECTION_ARROW_AND_LABEL: number;
  };

  text: {
    BASE_FONT_SIZE: number;
    PADDING: number;
  };
};

export const initGraphConstants: TGraphConstants = {
  system: {
    GRID_SIZE: 16,
    PIXEL_RATIO: window.devicePixelRatio || 1,
    USABLE_RECT_GAP: 400,
    CAMERA_VIEWPORT_TRESHOLD: 0.5,
  },
  camera: {
    SPEED: 1,
    STEP: 0.008,
  },
  block: {
    WIDTH_MIN: 16 * 10,
    HEAD_HEIGHT: 16 * 4,
    BODY_PADDING: 16 * 1.5,
    SCALES: [0.125, 0.225, 0.7],
    DEFAULT_Z_INDEX: 1,
    INCRIMENT_Z_INDEX: 10,
    GHOST_BLOCK_OPACITY: 0.1,
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
  },
  text: {
    BASE_FONT_SIZE: 24,
    PADDING: 10,
  },
};
