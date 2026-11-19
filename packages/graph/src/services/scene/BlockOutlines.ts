import type { SceneStore } from "../../lib/scene/SceneStore";
import { blockOutlineSegments, blockOutlineStrokes } from "../../lib/scene/blockOutline";
import { elementBounds } from "../../lib/scene/elementBounds";
import { LEVEL_BIT, SCENE_LEVELS, isOnLevel } from "../../lib/scene/levels";
import type { TSceneChange, TSceneElement, TSceneOutline, TScenePrimitive } from "../../lib/scene/types";

import type { TBlockOutlineShape } from "./blockOutlineShape";
import { blockOutlineShape } from "./blockOutlineShape";

export function outlinePaths(shape: TBlockOutlineShape, stroke: TSceneOutline, levelMask?: number): TScenePrimitive[] {
  const contours = blockOutlineSegments(shape.width, shape.height, shape.circles, shape.radius);
  if (shape.x || shape.y) {
    for (const segments of contours) {
      for (let i = 0; i < segments.length; i += 2) {
        segments[i] += shape.x;
        segments[i + 1] += shape.y;
      }
    }
  }
  // A detached port can be close enough that its halo reaches a neighbouring rim.
  return blockOutlineStrokes(stroke).flatMap((paint) =>
    contours.map((segments): TScenePrimitive => ({ kind: "path", segments, closed: true, stroke: paint, levelMask }))
  );
}

type TOutline = {
  child?: TSceneElement;
  ports?: { element: TSceneElement; x: number; y: number }[];
  signature?: string;
};

/** Only blocks with a matching rule own an outline. Changes to a port invalidate its own block. */
export class BlockOutlines {
  private readonly owners = new Map<string, TOutline>();
  private readonly dirty = new Map<string, "position" | "shape">();
  private readonly zoomDependent = new Set<string>();
  private scale = 1;

  constructor(private readonly store: SceneStore) {}

  public changed({ element, type, fields }: TSceneChange): void {
    if (element.entityType === "block") {
      const { id } = element;
      if (type === "delete") {
        this.owners.delete(id);
        this.dirty.delete(id);
        this.zoomDependent.delete(id);
      } else if (
        this.owners.has(id) ||
        ((!fields || fields.has("styleId")) && this.store.getStyles()[element.styleId]?.outline)
      ) {
        this.mark(id, fields);
      }
    } else if (element.parent && this.owners.has(element.parent) && element.entityType !== "block-outline") {
      if (element.entityType === "anchor" || fields?.has("hidden")) this.mark(element.parent, fields);
    }
  }

  private mark(id: string, fields: TSceneChange["fields"]): void {
    if (fields && !fields.has("styleId") && !fields.has("primitives") && !fields.has("hidden")) {
      if ((fields.has("x") || fields.has("y")) && !this.dirty.has(id)) this.dirty.set(id, "position");
      return;
    }
    this.dirty.set(id, "shape");
  }

  /** An application can use the same entity type for its own primitives. */
  public readonly owns = (element: TSceneElement): boolean =>
    element.parent !== undefined && this.owners.get(element.parent)?.child === element;

  public stylesChanged(): void {
    for (const id of this.owners.keys()) this.dirty.set(id, "shape");
  }

  public flush(scale: number): void {
    if (this.scale !== scale) {
      this.scale = scale;
      for (const id of this.zoomDependent) this.dirty.set(id, "shape");
    }
    if (!this.dirty.size) return;
    for (const [id, change] of this.dirty) {
      this.dirty.delete(id);
      const block = this.store.get(id);
      if (block) this.refresh(block, change === "position");
    }
  }

  private refresh(block: TSceneElement, moved: boolean): void {
    const rows = this.store.getStyles();
    const stroke = rows[block.styleId]?.outline;
    let cached = this.owners.get(block.id);
    const child = cached?.child && this.store.get(cached.child.id) === cached.child ? cached.child : undefined;
    if (!stroke) {
      this.owners.delete(block.id);
      this.zoomDependent.delete(block.id);
      if (child) this.store.delete(child.id);
      return;
    }
    if (!cached) {
      cached = {};
      this.owners.set(block.id, cached);
    }
    // A delegated HTML block owns its outline in the DOM until it hands drawing back to the scene.
    if (block.hidden) {
      this.zoomDependent.delete(block.id);
      return;
    }
    if (
      moved &&
      child &&
      cached.ports?.every(({ element, x, y }) => element.x - block.x === x && element.y - block.y === y)
    ) {
      this.move(child, block);
      return;
    }
    const anchors = this.store
      .childrenOf(block.id)
      .filter((el) => el.entityType === "anchor" && !this.store.isDrawnHidden(el));
    cached.ports = anchors.map((element) => ({ element, x: element.x - block.x, y: element.y - block.y }));
    const groups = this.groupShapes(block, anchors);
    const signature = JSON.stringify([stroke, Array.from(groups, ([key, group]) => [key, group.mask])]);
    if (groups.size === 0) {
      if (child) this.store.delete(child.id);
      cached.child = undefined;
      cached.signature = undefined;
    } else if (!child || signature !== cached.signature) {
      const primitives = Array.from(groups.values()).flatMap(({ shape, mask }) => outlinePaths(shape, stroke, mask));
      const patch = { x: block.x, y: block.y, bounds: elementBounds(primitives), primitives };
      cached.signature = signature;
      if (child) this.store.update(child.id, patch);
      else {
        let id = "block-outline\0" + block.id;
        while (this.store.get(id)) id += "\0";
        cached.child = this.store.add({
          id,
          parent: block.id,
          entityType: "block-outline",
          childOrder: Number.MAX_SAFE_INTEGER,
          zIndex: 0,
          ...patch,
        });
      }
    } else {
      this.move(child, block);
    }
  }
  private move(child: TSceneElement, block: TSceneElement): void {
    if (child.x !== block.x || child.y !== block.y) this.store.update(child.id, { x: block.x, y: block.y });
  }

  private groupShapes(
    block: TSceneElement,
    anchors: readonly TSceneElement[]
  ): Map<string, { shape: TBlockOutlineShape; mask: number }> {
    const rows = this.store.getStyles();
    const groups = new Map<string, { shape: TBlockOutlineShape; mask: number }>();
    let zoomDependent = false;
    for (const level of SCENE_LEVELS) {
      const shape = blockOutlineShape(block, anchors, level, this.scale, (el) => rows[el.styleId]);
      if (!shape) {
        zoomDependent ||= block.primitives.some(
          (p) =>
            p.kind === "rect" &&
            (p.part === "body" || p.part === "border") &&
            isOnLevel(p.levelMask, level) &&
            (p.minScale !== undefined || p.maxScale !== undefined)
        );
        continue;
      }
      zoomDependent ||= shape.scaleDependent;
      const key = JSON.stringify([shape.x, shape.y, shape.width, shape.height, shape.radius, shape.circles]);
      const group = groups.get(key);
      if (group) group.mask += LEVEL_BIT[level];
      else groups.set(key, { shape, mask: LEVEL_BIT[level] });
    }
    if (zoomDependent) this.zoomDependent.add(block.id);
    else this.zoomDependent.delete(block.id);
    return groups;
  }
}
