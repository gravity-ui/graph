import { TileIndex } from "../culling/TileIndex";
import type { TTileRect } from "../culling/TileIndex";

import type { TSceneElement } from "./types";

export type TSceneElementInput = Omit<TSceneElement, "sequence" | "hidden"> & { hidden?: boolean };

/** Draw order of the scene: z-level first, then the order of mounting and raising. */
export function compareSceneOrder(a: TSceneElement, b: TSceneElement): number {
  return a.zIndex - b.zIndex || a.sequence - b.sequence;
}

/** Research prototype (E2): the elements of a scene, found by world rect and returned in draw order. */
export class SceneStore {
  private readonly elements = new Map<string, TSceneElement>();

  private readonly index: TileIndex<TSceneElement>;

  private sequence = 0;

  constructor(tileSize = 1024) {
    this.index = new TileIndex<TSceneElement>({ tileSize });
  }

  public get size(): number {
    return this.elements.size;
  }

  public get(id: string): TSceneElement | undefined {
    return this.elements.get(id);
  }

  public add(input: TSceneElementInput): TSceneElement {
    if (this.elements.has(input.id)) {
      throw new Error(`Scene element ${input.id} already exists`);
    }
    const element: TSceneElement = { ...input, hidden: input.hidden ?? false, sequence: ++this.sequence };
    this.elements.set(element.id, element);
    this.place(element);
    return element;
  }

  public update(
    id: string,
    patch: Partial<Pick<TSceneElement, "x" | "y" | "bounds" | "primitives" | "hidden" | "zIndex">>
  ): void {
    const element = this.require(id);
    Object.assign(element, patch);
    if (patch.x !== undefined || patch.y !== undefined || patch.bounds !== undefined) {
      this.place(element);
    }
  }

  public raise(id: string): void {
    this.require(id).sequence = ++this.sequence;
  }

  public delete(id: string): void {
    const element = this.elements.get(id);
    if (!element) return;
    this.elements.delete(id);
    this.index.delete(element);
  }

  /** Visible elements whose bounds meet the rect, in draw order. */
  public query(rect: TTileRect): TSceneElement[] {
    const found: TSceneElement[] = [];
    this.index.query(rect, (element) => {
      if (!element.hidden) found.push(element);
    });
    return found.sort(compareSceneOrder);
  }

  private place(element: TSceneElement): void {
    const { minX, minY, maxX, maxY } = element.bounds;
    this.index.set(element, element.x + minX, element.y + minY, element.x + maxX, element.y + maxY);
  }

  private require(id: string): TSceneElement {
    const element = this.elements.get(id);
    if (!element) throw new Error(`Scene element ${id} does not exist`);
    return element;
  }
}
