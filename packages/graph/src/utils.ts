// Core utility functions
export { debounce, throttle, schedule } from "./utils/functions";
export { setCssProps, setCssProp, removeCssProps } from "./utils/functions/cssProp";
export {
  noop,
  isTouchEvent,
  getXY,
  getCoord,
  getEventDelta,
  isMetaKeyEvent,
  isShiftKeyEvent,
  isAltKeyEvent,
  getEventSelectionAction,
  isBlock,
  createCustomDragEvent,
  createObject,
  dispatchEvents,
  addEventListeners,
  isAllowChangeBlockGeometry,
  getBlocksRect,
  isGeometryHaveInfinity,
  startAnimation,
  isTrackpadWheelEvent,
  calculateNiceNumber,
  alignToPixelGrid,
  computeCssVariable,
} from "./utils/functions";
export { clamp } from "./utils/functions/clamp";
export { type TMeasureTextOptions, type TWrapText, measureText, measureMultilineText } from "./utils/functions/text";
export { dragListener, type DragListenerOptions } from "./utils/functions/dragListener";

// Renderers
export * from "./utils/renderers/text";
export { renderSVG } from "./utils/renderers/svgPath";
export { render } from "./utils/renderers/render";

// Shapes
export * from "./utils/shapes";

// Types
export type { RecursivePartial, Constructor } from "./utils/types/helpers";
export { type TPoint, type TRect, Point, Rect, isTRect } from "./utils/types/shapes";
export { EVENTS, SELECTION_EVENT_TYPES, EVENTS_DETAIL, MOUSE_ENTER_DELAY_IN_FRAMES } from "./utils/types/events";

// Emitter
export { Emitter } from "./utils/Emitter";
