import type { TTileRect } from "../../../lib/culling/TileIndex";
import type { TElementPatch, TSceneElementInput, TSceneWriter } from "../../../lib/scene/SceneStore";
import type { TSceneElement, TSceneStyle } from "../../../lib/scene/types";
import type { GraphScene } from "../../../services/scene/GraphScene";
import type { TSceneKey } from "../../../services/scene/sceneKey";
import type { TStyleTarget } from "../../../services/styles/types";
import type { TEntityAddress } from "../../../services/tags/types";

function sameBounds(a: TTileRect, b: TTileRect): boolean {
  return a === b || (a.minX === b.minX && a.minY === b.minY && a.maxX === b.maxX && a.maxY === b.maxY);
}

/** One mounted component's scene record and style binding. The producer keeps its geometry and picking rules. */
export class SceneElementWriter {
  public readonly element: TSceneElement;
  public key: TSceneKey;
  private unbind?: () => void;

  constructor(
    private readonly scene: GraphScene,
    input: TSceneElementInput,
    owner?: TSceneWriter
  ) {
    this.element = scene.store.add(input, owner);
    this.key = { elementId: input.id, sub: 0 };
  }

  public isCurrent(): boolean {
    return this.scene.store.get(this.element.id) === this.element;
  }

  public bindStyle(entity: TEntityAddress, target: TStyleTarget, onChange?: (style: TSceneStyle) => void): void {
    this.unbind = this.scene.bindStyle(this.element, entity, target, onChange);
  }

  /** Components with animated placement compare their own layout snapshot; connections compare the live record. */
  public update(
    next: TElementPatch,
    previous: Pick<TSceneElement, keyof TElementPatch> = this.element
  ): TElementPatch | undefined {
    const patch: TElementPatch = {};
    if (next.x !== undefined && previous.x !== next.x) patch.x = next.x;
    if (next.y !== undefined && previous.y !== next.y) patch.y = next.y;
    if (next.bounds && !sameBounds(previous.bounds, next.bounds)) patch.bounds = next.bounds;
    if (next.primitives !== undefined && previous.primitives !== next.primitives) patch.primitives = next.primitives;
    if (next.zIndex !== undefined && previous.zIndex !== next.zIndex) patch.zIndex = next.zIndex;
    if (next.hidden !== undefined && previous.hidden !== next.hidden) patch.hidden = next.hidden;
    if (next.childOrder !== undefined && previous.childOrder !== next.childOrder) patch.childOrder = next.childOrder;
    if (!Object.keys(patch).length) return undefined;
    this.scene.store.update(this.element.id, patch);
    if (patch.childOrder !== undefined) this.key = { elementId: this.element.id, sub: 0 };
    return patch;
  }

  public dispose(): void {
    this.unbind?.();
    if (this.isCurrent()) this.scene.store.delete(this.element.id);
  }
}
