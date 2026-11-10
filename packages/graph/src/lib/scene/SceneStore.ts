import { TileIndex } from "../culling/TileIndex";
import type { TTileRect } from "../culling/TileIndex";

import type { TSceneChange, TSceneElement, TSceneStyle } from "./types";

export type TSceneElementInput = Omit<TSceneElement, "order" | "styleId" | "hidden"> & { hidden?: boolean };

/** Draw order of the scene: z-level first, then the order of mounting and raising. */
export function compareSceneOrder(a: TSceneElement, b: TSceneElement): number {
  return a.zIndex - b.zIndex || a.order - b.order;
}

/** Research prototype (E2): the elements of a scene, found by world rect and returned in draw order. */
export class SceneStore {
  private readonly elements = new Map<string, TSceneElement>();

  private readonly index: TileIndex<TSceneElement>;

  private order = 0;

  private styles: readonly TSceneStyle[] = Object.freeze([{}]);

  private readonly listeners = new Set<(change: TSceneChange) => void>();

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
    const element: TSceneElement = { ...input, hidden: input.hidden ?? false, order: ++this.order, styleId: 0 };
    this.elements.set(element.id, element);
    this.place(element);
    this.emit({ type: "add", element });
    return element;
  }

  public subscribe(listener: (change: TSceneChange) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Visits every element, hidden ones included, in no particular order. */
  public forEach(callback: (element: TSceneElement) => void): void {
    this.elements.forEach(callback);
  }

  /** Registers a style and returns its id. Replaces the style list, so a consumer sees the change by identity. */
  public defineStyle(style: TSceneStyle): number {
    this.styles = Object.freeze([...this.styles, style]);
    return this.styles.length - 1;
  }

  public getStyles(): readonly TSceneStyle[] {
    return this.styles;
  }

  public setStyle(id: string, styleId: number): void {
    const element = this.require(id);
    element.styleId = styleId;
    this.emit({ type: "update", element, fields: new Set(["styleId"]) });
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
    const fields = new Set<keyof TSceneElement>();
    for (const [key, value] of Object.entries(patch)) {
      if (value !== undefined) fields.add(key as keyof TSceneElement);
    }
    this.emit({ type: "update", element, fields });
  }

  public raise(id: string): void {
    const element = this.require(id);
    element.order = ++this.order;
    this.emit({ type: "update", element, fields: new Set(["order"]) });
  }

  public delete(id: string): void {
    const element = this.elements.get(id);
    if (!element) return;
    this.elements.delete(id);
    this.index.delete(element);
    this.emit({ type: "delete", element });
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

  private emit(change: TSceneChange): void {
    this.listeners.forEach((listener) => listener(change));
  }

  private require(id: string): TSceneElement {
    const element = this.elements.get(id);
    if (!element) throw new Error(`Scene element ${id} does not exist`);
    return element;
  }
}
