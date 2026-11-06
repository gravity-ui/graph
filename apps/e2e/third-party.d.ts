// The declarations of @gravity-ui/uikit import two types from "react-beautiful-dnd", but its type package is not a
// dependency of uikit. The strict E2E config (skipLibCheck: false) checks those declarations, so declare the types.
declare module "react-beautiful-dnd" {
  export type DraggableProvided = unknown;
  export type DroppableProvided = unknown;
}
