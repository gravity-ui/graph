// The declarations of @gravity-ui/uikit import two types from "react-beautiful-dnd", but its type package is not a
// dependency of uikit. The shared contract tsconfig checks library declarations (skipLibCheck: false), so declare
// the types. Consumers that type-check with skipLibCheck: true do not need this.
declare module "react-beautiful-dnd" {
  export type DraggableProvided = unknown;
  export type DroppableProvided = unknown;
}
