import { defineTag } from "./defineTag";

/** Bound to the selection buckets. */
export const selectedTag = defineTag("selected");
/** The component under the pointer; one entity at a time. */
export const hoveredTag = defineTag("hovered");
/** Participants of the current drag. */
export const draggingTag = defineTag("dragging");
/** A group that accepts the dragged blocks; written by the groups transfer layer. */
export const dropTargetTag = defineTag("dropTarget");
/** The port a new connection starts from; written by the connection editing layer (step 2). */
export const connectionSourceTag = defineTag("connectionSource");
/** The port a new connection would end at; written by the connection editing layer (step 2). */
export const connectionTargetTag = defineTag("connectionTarget");
