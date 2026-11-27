import { defineTag } from "./defineTag";

/** Bound to the selection buckets. */
export const selectedTag = defineTag("selected");
/** The component under the pointer; one entity at a time. */
export const hoveredTag = defineTag("hovered");
/** Participants of the current drag. */
export const draggingTag = defineTag("dragging");
/** A group that accepts the dragged blocks; written by the groups transfer layer. */
export const dropTargetTag = defineTag("dropTarget");
/** The scene entity that owns the source port during connection creation. */
export const connectionSourceTag = defineTag("connectionSource");
/** The scene entity that owns the hovered target port during connection creation. */
export const connectionTargetTag = defineTag("connectionTarget");
