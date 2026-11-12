import { TileIndex } from "../culling/TileIndex";
import type { TTileRect } from "../culling/TileIndex";

import { styleEncodeKey, styleRaise } from "./style";
import type { TSceneChange, TSceneElement, TSceneStyle } from "./types";

export type TSceneElementInput = Omit<TSceneElement, "order" | "styleId" | "hidden"> & { hidden?: boolean };

/** The dim colour of a store until it is set: the default theme's layer background (`initGraphColors`). */
const DEFAULT_DIM_COLOR = "#f9f9f9";

/**
 * Draw order of the scene by the elements' own zIndex: z-level first, then the order of mounting and raising. A
 * store's `query()` also adds the raise of the element's style (`SceneStore.zIndexOf`).
 */
export function compareSceneOrder(a: TSceneElement, b: TSceneElement): number {
  return a.zIndex - b.zIndex || a.order - b.order;
}

/** Research prototype (E2): the elements of a scene, found by world rect and returned in draw order. */
export class SceneStore {
  private readonly elements = new Map<string, TSceneElement>();

  private readonly index: TileIndex<TSceneElement>;

  private order = 0;

  private styles: readonly TSceneStyle[] = Object.freeze([{}]);

  /** Ids of freed style rows, reused by defineStyle. */
  private readonly freeStyles: number[] = [];

  /** Elements by the style row they use; row 0 is not tracked. */
  private readonly styleUsers = new Map<number, Set<string>>();

  private readonly listeners = new Set<(change: TSceneChange) => void>();

  private readonly styleListeners = new Set<() => void>();

  /** The colour a style's `dim` moves paints towards; the graph scene keeps it on the theme's layer background. */
  private dimColor = DEFAULT_DIM_COLOR;

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

  /**
   * Calls the listener after every change of the style rows (a row defined, rewritten or freed) and of the dim colour.
   * A change of table properties only (colours, visibility, dim) emits no element update, so a renderer redraws on
   * this.
   */
  public subscribeStyles(listener: () => void): () => void {
    this.styleListeners.add(listener);
    return () => {
      this.styleListeners.delete(listener);
    };
  }

  /** Visits every element, hidden ones included, in no particular order. */
  public forEach(callback: (element: TSceneElement) => void): void {
    this.elements.forEach(callback);
  }

  /**
   * Registers a style row and returns its id: a freed row when there is one, else a new one. Replaces the style list,
   * so a consumer sees the change by identity.
   */
  public defineStyle(style: TSceneStyle): number {
    const freed = this.freeStyles.pop();
    if (freed !== undefined) {
      this.styles = Object.freeze(this.styles.map((row, id) => (id === freed ? style : row)));
      this.emitStyles();
      return freed;
    }
    this.styles = Object.freeze([...this.styles, style]);
    this.emitStyles();
    return this.styles.length - 1;
  }

  public getStyles(): readonly TSceneStyle[] {
    return this.styles;
  }

  /** Sets the colour a style's `dim` moves paints towards; a new colour notifies `subscribeStyles` listeners. */
  public setDimColor(color: string): void {
    if (color === this.dimColor) return;
    this.dimColor = color;
    this.emitStyles();
  }

  public getDimColor(): string {
    return this.dimColor;
  }

  /**
   * Rewrites rows in one copy of the style list. An element whose row changed gets an update with `primitives` when
   * the encode keys differ and `zIndex` when the raises differ; a change of table properties only emits no element
   * update. Every call that changes a row then notifies `subscribeStyles` listeners once. Row 0 and unknown ids are
   * skipped.
   */
  public replaceStyles(rows: ReadonlyMap<number, TSceneStyle>): void {
    const next = [...this.styles];
    const changes: [number, TSceneStyle, TSceneStyle][] = [];
    rows.forEach((style, id) => {
      if (id <= 0 || id >= next.length || next[id] === style) return;
      changes.push([id, next[id], style]);
      next[id] = style;
    });
    if (changes.length === 0) return;
    this.styles = Object.freeze(next);
    for (const [id, previous, style] of changes) {
      const fields = this.styleFields(previous, style);
      if (fields.size === 0) continue;
      this.styleUsers.get(id)?.forEach((elementId) => {
        const element = this.elements.get(elementId);
        if (element) this.emit({ type: "update", element, fields: new Set(fields) });
      });
    }
    this.emitStyles();
  }

  /** Resets a row to the empty style and offers it to the next defineStyle. Row 0 is never freed. */
  public freeStyle(styleId: number): void {
    if (styleId <= 0 || styleId >= this.styles.length || this.freeStyles.includes(styleId)) return;
    this.replaceStyles(new Map([[styleId, {}]]));
    this.freeStyles.push(styleId);
  }

  public setStyle(id: string, styleId: number): void {
    const element = this.require(id);
    const previous = this.styles[element.styleId];
    this.styleUsers.get(element.styleId)?.delete(id);
    element.styleId = styleId;
    if (styleId > 0) {
      let users = this.styleUsers.get(styleId);
      if (!users) {
        users = new Set();
        this.styleUsers.set(styleId, users);
      }
      users.add(id);
    }
    const fields = this.styleFields(previous, this.styles[styleId]);
    fields.add("styleId");
    this.emit({ type: "update", element, fields });
  }

  /** The element's zIndex bucket with the raise of its style. */
  public zIndexOf(element: TSceneElement): number {
    return element.zIndex + styleRaise(this.styles[element.styleId]);
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
    this.styleUsers.get(element.styleId)?.delete(id);
    this.index.delete(element);
    this.emit({ type: "delete", element });
  }

  /** Visible elements whose bounds meet the rect, in draw order. */
  public query(rect: TTileRect): TSceneElement[] {
    const found: TSceneElement[] = [];
    this.index.query(rect, (element) => {
      if (!element.hidden) found.push(element);
    });
    return found.sort((a, b) => this.zIndexOf(a) - this.zIndexOf(b) || a.order - b.order);
  }

  /** What an element has to redo when its row changes from `previous` to `next`. */
  private styleFields(previous: TSceneStyle | undefined, next: TSceneStyle | undefined): Set<keyof TSceneElement> {
    const fields = new Set<keyof TSceneElement>();
    if (styleEncodeKey(previous) !== styleEncodeKey(next)) fields.add("primitives");
    if (styleRaise(previous) !== styleRaise(next)) fields.add("zIndex");
    return fields;
  }

  private place(element: TSceneElement): void {
    const { minX, minY, maxX, maxY } = element.bounds;
    this.index.set(element, element.x + minX, element.y + minY, element.x + maxX, element.y + maxY);
  }

  private emit(change: TSceneChange): void {
    this.listeners.forEach((listener) => listener(change));
  }

  private emitStyles(): void {
    this.styleListeners.forEach((listener) => listener());
  }

  private require(id: string): TSceneElement {
    const element = this.elements.get(id);
    if (!element) throw new Error(`Scene element ${id} does not exist`);
    return element;
  }
}
