import type { TSceneChange, TSceneElement } from "./types";

type TPending = {
  /** The element a delete removes from the renderer: the one it knew before this batch. */
  deleted?: TSceneElement;
  /** What follows the delete, if any: an add of the current element, an update, or nothing. */
  next: "add" | "update" | "none";
  element: TSceneElement;
  /** The fields of an update; undefined means every field. */
  fields?: Set<keyof TSceneElement>;
};

/**
 * Store changes waiting for the next frame, one entry per element (review C1). An add followed by updates stays an add
 * (the renderer reads the live element), updates merge their fields, an add followed by a delete cancels out, and a
 * delete followed by an add of the same id gives a delete and then an add. `take()` returns the deletes first, then the
 * adds and updates, each in the order the elements first changed.
 */
export class SceneChangeQueue {
  private readonly pending = new Map<string, TPending>();

  public get size(): number {
    return this.pending.size;
  }

  public push(change: TSceneChange): void {
    const { element } = change;
    const entry = this.pending.get(element.id);
    if (!entry) {
      if (change.type === "delete") this.pending.set(element.id, { deleted: element, next: "none", element });
      else this.pending.set(element.id, { next: change.type, element, fields: fieldsOf(change) });
      return;
    }
    if (change.type === "add") {
      entry.next = "add";
      entry.element = element;
      entry.fields = undefined;
      return;
    }
    if (change.type === "update") {
      // After an add the renderer reads the live element; after a delete nothing follows.
      if (entry.next !== "update") return;
      const fields = entry.fields;
      if (fields && change.fields) change.fields.forEach((field) => fields.add(field));
      else entry.fields = undefined;
      return;
    }
    if (entry.deleted === undefined && entry.next === "add") {
      this.pending.delete(element.id);
      return;
    }
    entry.deleted ??= element;
    entry.next = "none";
  }

  /**
   * The waiting changes, and an empty queue. Every delete comes first, then the adds and updates: a delete only frees
   * room, so the renderer's limits (zIndex bands, elements per band) are not hit by an element that changed before a
   * delete that made room for it. An id's delete still comes before its add.
   */
  public take(): TSceneChange[] {
    const changes: TSceneChange[] = [];
    for (const entry of this.pending.values()) {
      if (entry.deleted) changes.push({ type: "delete", element: entry.deleted });
    }
    for (const entry of this.pending.values()) {
      if (entry.next === "add") changes.push({ type: "add", element: entry.element });
      else if (entry.next === "update") changes.push({ type: "update", element: entry.element, fields: entry.fields });
    }
    this.pending.clear();
    return changes;
  }

  public clear(): void {
    this.pending.clear();
  }
}

function fieldsOf(change: TSceneChange): Set<keyof TSceneElement> | undefined {
  return change.type === "update" && change.fields ? new Set(change.fields) : undefined;
}
