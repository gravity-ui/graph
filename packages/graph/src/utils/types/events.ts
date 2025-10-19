export const MOUSE_ENTER_DELAY_IN_FRAMES = 24;

export const EVENTS = {
  DRAG_START: "drag-start",
  DRAG_UPDATE: "drag-update",
  DRAG_END: "drag-end",
  RESIZE_START: "resize-start",
  RESIZE_UPDATE: "resize-update",
  RESIZE_END: "resize-end",
  RESIZER_MOUSEDOWN: "resizer-mousedown",
  SELECTION_START: "start-area-selection",
  SELECTION_UPDATE: "update-area-selection",
  SELECTION_END: "end-area-selection",
  NEW_CONNECTION_START: "start-new-connection",
  NEW_CONNECTION_UPDATE: "update-new-connection",
  NEW_CONNECTION_END: "end-new-connection",
  NEW_BLOCK_START: "start-new-block",
  NEW_BLOCK_UPDATE: "update-new-block",
  NEW_BLOCK_END: "end-new-block",
};

export const SELECTION_EVENT_TYPES = {
  SET: 0,
  ADD: 1,
  DELETE: 2,
  TOGGLE: 3,
};

export const EVENTS_DETAIL = {
  [EVENTS.DRAG_START]: (x: number, y: number) => {
    return { x, y };
  },
  [EVENTS.DRAG_UPDATE]: (x: number, y: number) => {
    return { x, y };
  },
  [EVENTS.DRAG_END]: (x: number, y: number) => {
    return { x, y };
  },
};
