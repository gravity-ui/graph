import { validateConnectionEffectScaleRange } from "../../components/canvas/connections/effects/ConnectionEffect";
import type { TSceneLevel } from "../../services/scene/types";
import { TileIndex } from "../culling/TileIndex";
import type { TTileRect } from "../culling/TileIndex";
import { isDevelopmentBuild } from "../detachedWarning";

import { LEVEL_BIT, levelMaskOfPrimitives } from "./levels";
import {
  bakeElementStyle,
  composeChildStyle,
  ignoresCameraAware,
  inheritsElementStyle,
  styleEncodeKey,
  styleGeometryKey,
  styleRaise,
} from "./style";
import type { TSceneChange, TSceneElement, TScenePrimitive, TSceneStyle, TSceneStyleChange } from "./types";
import { paintedGeometryBounds } from "./webgl/levelBounds";

export type TSceneElementInput = Omit<TSceneElement, "order" | "styleId" | "hidden" | "childOrder"> & {
  hidden?: boolean;
  childOrder?: number;
};

/** The dim colour of a store until it is set: the default theme's layer background (`initGraphColors`). */
const DEFAULT_DIM_COLOR = "#f9f9f9";

const NO_ELEMENTS: readonly TSceneElement[] = Object.freeze([]);

const NO_NODES: readonly TNode[] = Object.freeze([]);

const NO_CHILD_ROWS: ReadonlyMap<string, number> = new Map();

/** @internal The style rows of an export drawn at another level or scale (`SceneStore.stylesWith`). */
export type TSceneExportStyles = {
  /** The style list: rows replaced, composed rows composed again, and the rows `childRows` adds. */
  readonly styles: readonly TSceneStyle[];
  /**
   * Child element ids and the rows they draw with in the export where that is not their `styleId`: their parent's row
   * needs composition (an element `dim` or `opacity`) only at the export's level and scale.
   */
  readonly childRows: ReadonlyMap<string, number>;
};

/**
 * Validates literal effect ranges before publishing primitives. Development builds also freeze text primitives with
 * their `cameraAware` objects, since the WebGL backend compares texts by identity and retains them after encoding.
 */
function preparePrimitives(primitives: readonly TScenePrimitive[]): void {
  const freezeText = isDevelopmentBuild();
  for (const primitive of primitives) {
    if (primitive.kind === "path" && primitive.effect) validateConnectionEffectScaleRange(primitive.effect);
    if (!freezeText || primitive.kind !== "text" || Object.isFrozen(primitive)) continue;
    if (typeof primitive.cameraAware === "object") Object.freeze(primitive.cameraAware);
    Object.freeze(primitive);
  }
}

function validateStyleEffects(style: TSceneStyle): void {
  for (const values of [style.base, style.parts]) {
    for (const part in values) {
      const effect = values[part]?.effect;
      if (effect) validateConnectionEffectScaleRange(effect);
    }
  }
}

/** Element types and parts already warned about by `warnIgnoredCameraAware`. */
const ignoredCameraAware = new Set<string>();

/**
 * Development builds: one warning per element type and part whose drawn row has a `cameraAware: true` that a text of
 * the element does not take (`ignoresCameraAware`: a heightless text that does not declare `cameraAware`). The type is
 * the element id's first segment (`entityKey`). The primitives are checked first, the build last: in a production
 * build the check costs a test per primitive.
 */
function warnIgnoredCameraAware(element: TSceneElement, style: TSceneStyle | undefined): void {
  if (!style) return;
  for (const primitive of element.primitives) {
    if (!ignoresCameraAware(primitive, style)) continue;
    const type = element.id.split("\u0000")[0];
    const key = `${type}\u0000${primitive.part}`;
    if (ignoredCameraAware.has(key) || !isDevelopmentBuild()) continue;
    ignoredCameraAware.add(key);
    console.warn(
      `Scene element type "${type}", part "${primitive.part}": a style's cameraAware: true is not applied to a text ` +
        "without a height (its element's bounds would not cover it); give the text a height, or declare cameraAware " +
        "on the primitive"
    );
  }
}

/** Whether a row sets `cameraAware: true` on some part, in its base or its state values. */
function turnsCameraAwareOn(style: TSceneStyle): boolean {
  for (const values of [style.base, style.parts]) {
    if (!values) continue;
    for (const part in values) {
      if (values[part]?.cameraAware === true) return true;
    }
  }
  return false;
}

function sameRect(a: TTileRect | undefined, b: TTileRect | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.minX === b.minX && a.minY === b.minY && a.maxX === b.maxX && a.maxY === b.maxY;
}

/**
 * The forms of a row width that is unbounded in world units: `{ px }` without `maxWorld` and `{ world }` with a
 * positive `minPx`. At the minimum camera scale (0.01) their world width is px / 0.01 and minPx / 0.01.
 */
type TUnboundedWidth = "px" | "minPx";

const UNBOUNDED_WIDTH_WARNINGS: ReadonlyMap<TUnboundedWidth, string> = new Map([
  [
    "px",
    "A style rule sets a { px } width without maxWorld: the culling bounds of elements drawn with it take that " +
      "width at the minimum camera scale (px / 0.01 world units). Give the width a maxWorld.",
  ],
  [
    "minPx",
    "A style rule sets a { world } width with a minPx: the culling bounds of elements drawn with it take that width " +
      "at the minimum camera scale (minPx / 0.01 world units). Use a smaller minPx, or a width without one.",
  ],
]);

/** Whether a row sets a width of the unbounded form in its base or its state values. */
function hasUnboundedWidth(style: TSceneStyle, form: TUnboundedWidth): boolean {
  for (const values of [style.base, style.parts]) {
    if (!values) continue;
    for (const part of Object.keys(values)) {
      const width = values[part]?.width;
      if (typeof width !== "object") continue;
      if (form === "px" ? "px" in width && width.maxWorld === undefined : "world" in width && (width.minPx ?? 0) > 0) {
        return true;
      }
    }
  }
  return false;
}

/** A development error for a child order that is not an integer of at least 0; such an order still sorts. */
function checkChildOrder(id: string, childOrder: number | undefined): void {
  if (childOrder === undefined || (Number.isInteger(childOrder) && childOrder >= 0) || !isDevelopmentBuild()) return;
  console.error(`Scene element ${id}: childOrder ${childOrder} is not an integer of at least 0`);
}

/**
 * The store's record of an element. The tile index holds nodes, so a query reaches an element's owner without a
 * lookup.
 */
type TNode = {
  readonly element: TSceneElement;
  /** A child's owner node (the root of its nesting); undefined for an owner. */
  readonly parent: TNode | undefined;
  /** A child's scene parent: its owner, or the child element it is nested in; undefined for an owner. */
  readonly up: TNode | undefined;
  /** The elements nested directly in this one, by child order, then in the order they were added. */
  kids: readonly TNode[];
  /**
   * An owner's child elements in draw order: each kid, then what is nested in it (pre-order). A new array on every
   * change; empty for a child.
   */
  children: readonly TSceneElement[];
  /** A child's index in its owner's `children`: its place in `compareOrder`. */
  childIndex: number;
  /** When a child was added: siblings of an equal child order keep this order. */
  added: number;
  /**
   * The levels the element's primitives show on (`levelMaskOfPrimitives`): a query for a level skips an element
   * without it.
   */
  levels: number;
  /** The last query that reached the node: an owner it collected, or a child it found. */
  mark: number;
  /** For an owner in the query that marked it: whether it found the owner itself, and how many of its children. */
  self: boolean;
  found: number;
  /** For an owner in the query that marked it: its bucket, the zIndex with the raise of its style. */
  bucket: number;
  /** The bounds the index holds while the element's row grows its geometry (a hover scale); undefined otherwise. */
  drawn: TTileRect | undefined;
  /** The `styleGeometryKey` `drawn` was baked with; "" while the row grows nothing. */
  drawnKey: string;
};

/**
 * A composed row (`SceneStore.applyChildStyle`): the drawn row of the children whose own row is `own` and whose scene
 * parent draws with `parent`. `users` counts the children that draw with it, `dependents` the composed entries whose
 * `parent` is its `id` (a nested element's drawn row composed from it).
 */
type TComposedEntry = { id: number; own: number; parent: number; users: number; dependents: number };

/** Scene order of two owners: the bucket, then `order` (`SceneStore.compareOrder` of owners). */
function compareOwners(a: TNode, b: TNode): number {
  return a.bucket - b.bucket || a.element.order - b.element.order;
}

type TCanvasQuery = {
  scale: number;
  level: TSceneLevel | undefined;
  region?: { rect: TTileRect; elements: readonly TSceneElement[]; bounds: Float64Array };
};

/** Research prototype (E2): the elements of a scene, found by world rect and returned in draw order. */
export class SceneStore {
  private readonly nodes = new Map<string, TNode>();

  private readonly index: TileIndex<TNode>;
  private canvasQuery?: TCanvasQuery;

  /** The last query's mark (`TNode.mark`). */
  private queryMark = 0;

  private order = 0;

  private styles: readonly TSceneStyle[] = Object.freeze([{}]);

  /** Ids of freed style rows, reused by defineStyle. */
  private readonly freeStyles: number[] = [];

  /** The forms of unbounded row widths already reported (`warnUnboundedWidth`, once per store and form). */
  private readonly warnedUnboundedWidths = new Set<TUnboundedWidth>();

  /** Elements by the style row they draw with (`styleId`); row 0 is not tracked. */
  private readonly styleUsers = new Map<number, Set<string>>();

  /** The last add sequence number given to a child (`TNode.added`). */
  private childSequence = 0;

  /** The row bindStyle set on a child; its `styleId` is the drawn row. */
  private readonly ownStyles = new Map<string, number>();

  /**
   * Composed rows by `${own}|${parent}`, counted by the children that draw with them and the composed rows composed
   * from them. In insertion order an entry follows the entry of the row it is composed from (`stylesWith`).
   */
  private readonly composed = new Map<string, TComposedEntry>();

  /** The entries of `composed` by their row. */
  private readonly composedById = new Map<number, TComposedEntry>();

  /** The composed row key each child draws with, if any. */
  private readonly composedOf = new Map<string, string>();

  private readonly listeners = new Set<(change: TSceneChange) => void>();

  private readonly styleListeners = new Set<(change: TSceneStyleChange) => void>();

  /** The colour a style's `dim` moves paints towards; the graph scene keeps it on the theme's layer background. */
  private dimColor = DEFAULT_DIM_COLOR;

  constructor(tileSize = 1024) {
    this.index = new TileIndex<TNode>({ tileSize });
  }

  public get size(): number {
    return this.nodes.size;
  }

  public get(id: string): TSceneElement | undefined {
    return this.nodes.get(id)?.element;
  }

  /**
   * Adds an element. An input with `parent` adds a child element (spec §5.2): `parent` is its owner or the child
   * element it is nested in; the element records its owner as `parent` and the child element as `nestedIn`, takes no
   * `order` of its own (0), and its drawn row starts composed with its scene parent's drawn row. The element keeps the
   * input's `entityType`. A `childOrder` that is not an integer of at least 0 is a development error.
   */
  public add(input: TSceneElementInput): TSceneElement {
    if (this.nodes.has(input.id)) {
      throw new Error(`Scene element ${input.id} already exists`);
    }
    checkChildOrder(input.id, input.childOrder);
    let upNode: TNode | undefined;
    if (input.parent !== undefined) {
      upNode = this.nodes.get(input.parent);
      if (!upNode) {
        throw new Error(`Scene element ${input.id}: its parent ${input.parent} does not exist`);
      }
    }
    const ownerNode = upNode ? upNode.parent ?? upNode : undefined;
    preparePrimitives(input.primitives);
    const element: TSceneElement = {
      ...input,
      entityType: input.entityType,
      parent: ownerNode?.element.id,
      nestedIn: upNode !== undefined && upNode !== ownerNode ? upNode.element.id : undefined,
      hidden: input.hidden ?? false,
      childOrder: input.childOrder ?? 0,
      order: ownerNode === undefined ? ++this.order : 0,
      styleId: 0,
    };
    const node: TNode = {
      element,
      parent: ownerNode,
      up: upNode,
      kids: NO_NODES,
      children: NO_ELEMENTS,
      childIndex: 0,
      added: upNode ? ++this.childSequence : 0,
      levels: levelMaskOfPrimitives(element.primitives),
      mark: 0,
      self: false,
      found: 0,
      bucket: 0,
      drawn: undefined,
      drawnKey: "",
    };
    this.nodes.set(element.id, node);
    this.place(node);
    if (upNode) {
      this.insertKid(node);
      // No update: the add carries the element with its drawn row.
      this.applyChildStyle(element, false);
    }
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
   * Calls the listener after every change of the style rows (a row defined, rewritten or freed) and of the dim colour,
   * with the reason (`TSceneStyleChange`). A change of table properties only (colours, visibility, dim) emits no
   * element update, so a renderer redraws on this; a listener without a parameter fits.
   */
  public subscribeStyles(listener: (change: TSceneStyleChange) => void): () => void {
    this.styleListeners.add(listener);
    return () => {
      this.styleListeners.delete(listener);
    };
  }

  /** Visits every element, hidden ones included, in no particular order. */
  public forEach(callback: (element: TSceneElement) => void): void {
    this.nodes.forEach((node) => callback(node.element));
  }

  /**
   * The child elements drawn after an element inside its owner, in draw order: each by child order among its siblings
   * (an equal order: in the order they were added), followed by what is nested in it. For an owner, its whole draw
   * list (both renderers draw it so); for a child, what is nested in it. Empty without any.
   */
  public childrenOf(id: string): readonly TSceneElement[] {
    const node = this.nodes.get(id);
    if (!node) return NO_ELEMENTS;
    if (node.parent === undefined) return node.children;
    if (node.kids.length === 0) return NO_ELEMENTS;
    const list: TSceneElement[] = [];
    const visit = (current: TNode): void => {
      for (const kid of current.kids) {
        list.push(kid.element);
        visit(kid);
      }
    };
    visit(node);
    return list;
  }

  /** The owner a child belongs to; an owner is its own root. */
  public rootOf(element: TSceneElement): TSceneElement {
    return element.parent === undefined ? element : this.nodes.get(element.parent)?.element ?? element;
  }

  /** Whether the element is not drawn: hidden itself, or nested in a hidden element up to and including its owner. */
  public isDrawnHidden(element: TSceneElement): boolean {
    const node = this.nodes.get(element.id);
    if (node) return this.isNodeHidden(node);
    return element.hidden || (element.parent !== undefined && this.rootOf(element).hidden);
  }

  /** The row bindStyle set: a child's own row; an owner's `styleId`. */
  public ownStyleOf(id: string): number {
    const element = this.require(id);
    return element.parent === undefined ? element.styleId : this.ownStyles.get(id) ?? 0;
  }

  /**
   * Registers a style row and returns its id: a freed row when there is one, else a new one. Replaces the style list,
   * so a consumer sees the change by identity. Development builds warn once per store about a width unbounded in world
   * units (`warnUnboundedWidth`).
   */
  public defineStyle(style: TSceneStyle): number {
    validateStyleEffects(style);
    this.warnUnboundedWidth(style);
    const freed = this.freeStyles.pop();
    if (freed !== undefined) {
      this.styles = Object.freeze(this.styles.map((row, id) => (id === freed ? style : row)));
      this.emitStyles("define");
      return freed;
    }
    this.styles = Object.freeze([...this.styles, style]);
    this.emitStyles("define");
    return this.styles.length - 1;
  }

  public getStyles(): readonly TSceneStyle[] {
    return this.styles;
  }

  /** Sets the colour a style's `dim` moves paints towards; a new colour notifies `subscribeStyles` listeners. */
  public setDimColor(color: string): void {
    if (color === this.dimColor) return;
    this.dimColor = color;
    this.emitStyles("dim");
  }

  public getDimColor(): string {
    return this.dimColor;
  }

  /**
   * The style list with some rows replaced, without changing the store, for an export drawn at another level or scale
   * (`toImage`). The composed rows of children are composed again from the replaced own and parent rows, transitively
   * down the nesting. A parent row that needs composition (an element `dim` or `opacity`) only in the export gets
   * composed rows for the direct children of the elements that use it, added to the list (`childRows`: the export
   * draws those children with them; deeper descendants keep their live rows). A parent row that stops needing it
   * leaves its children's composed rows equal to their own rows but for `raise`, which children ignore. Row 0 and
   * unknown ids are skipped; without rows it is the live list.
   */
  public stylesWith(rows: ReadonlyMap<number, TSceneStyle>): TSceneExportStyles {
    if (rows.size === 0) return { styles: this.styles, childRows: NO_CHILD_ROWS };
    const next = [...this.styles];
    rows.forEach((style, id) => {
      if (id > 0 && id < this.styles.length) {
        validateStyleEffects(style);
        next[id] = style;
      }
    });
    // In insertion order an entry follows the entry of the row it is composed from (a row with dependents is never
    // freed, so its id is not reused under them): one pass recomposes scene parents first.
    const changed = new Set(rows.keys());
    this.composed.forEach((entry) => {
      if (changed.has(entry.own) || changed.has(entry.parent)) {
        next[entry.id] = composeChildStyle(next[entry.own], next[entry.parent]);
        changed.add(entry.id);
      }
    });
    const childRows = new Map<string, number>();
    const added = new Map<string, number>();
    rows.forEach((_style, parentRow) => {
      if (parentRow <= 0 || parentRow >= this.styles.length) return;
      if (inheritsElementStyle(this.styles[parentRow]) || !inheritsElementStyle(next[parentRow])) return;
      // Its children draw with their own rows now (no composed entry): give each pair one composed row.
      this.styleUsers.get(parentRow)?.forEach((id) => {
        const node = this.nodes.get(id);
        if (!node) return;
        for (const kid of node.kids) {
          const child = kid.element;
          const own = this.ownStyles.get(child.id) ?? 0;
          const key = `${own}|${parentRow}`;
          let row = added.get(key);
          if (row === undefined) {
            row = next.length;
            next.push(composeChildStyle(next[own], next[parentRow]));
            added.set(key, row);
          }
          childRows.set(child.id, row);
        }
      });
    });
    return { styles: Object.freeze(next), childRows };
  }

  /**
   * Rewrites rows in one copy of the style list. An element whose row changed gets an update with `primitives` when
   * the encode keys differ and `zIndex` when the raises differ (never for a child, which draws in its parent's
   * bucket); a change of table properties only emits no element update. What is nested in an element whose row changed
   * gets its drawn rows again, and the composed rows of a changed own or parent row are rewritten. Every call that
   * changes a row then notifies `subscribeStyles` listeners with `"replace"`. Row 0 and unknown ids are skipped.
   */
  public replaceStyles(rows: ReadonlyMap<number, TSceneStyle>): void {
    this.rewriteStyles(rows, "replace");
  }

  /**
   * `replaceStyles` with the reason its listeners get: `"free"` for the row `freeStyle` resets. The composed rows it
   * rewrites after that are a `"replace"`: their content changed.
   */
  private rewriteStyles(rows: ReadonlyMap<number, TSceneStyle>, change: "replace" | "free"): void {
    const next = [...this.styles];
    const changes: [number, TSceneStyle, TSceneStyle][] = [];
    rows.forEach((style, id) => {
      if (id <= 0 || id >= next.length || next[id] === style) return;
      validateStyleEffects(style);
      changes.push([id, next[id], style]);
      next[id] = style;
    });
    if (changes.length === 0) return;
    this.styles = Object.freeze(next);
    for (const [id, previous, style] of changes) {
      this.warnUnboundedWidth(style);
      // The elements drawn with it bake their grown bounds again; a change that keeps the geometry costs none.
      if (styleGeometryKey(previous) !== styleGeometryKey(style)) {
        this.styleUsers.get(id)?.forEach((elementId) => {
          const node = this.nodes.get(elementId);
          if (node && this.restyle(node)) this.place(node);
        });
      }
      // A rule added or changed after binding can turn camera-aware text on where a text does not take it.
      if (turnsCameraAwareOn(style)) {
        this.styleUsers.get(id)?.forEach((elementId) => {
          const element = this.get(elementId);
          if (element) warnIgnoredCameraAware(element, style);
        });
      }
      const fields = this.styleFields(previous, style);
      if (fields.size === 0) continue;
      this.styleUsers.get(id)?.forEach((elementId) => {
        const element = this.get(elementId);
        if (!element) return;
        const elementFields = this.fieldsOf(element, fields);
        if (elementFields.size > 0) this.emit({ type: "update", element, fields: elementFields });
      });
    }
    const changedIds = new Set(changes.map(([id]) => id));
    // A parent row can start or stop needing composition.
    for (const id of changedIds) {
      const users = this.styleUsers.get(id);
      if (!users) continue;
      for (const elementId of [...users]) {
        const element = this.get(elementId);
        if (element) this.childrenOf(elementId).forEach((child) => this.applyChildStyle(child, true));
      }
    }
    // A composed row can be the parent row of a nested element's composed row; the nesting is a tree, so this
    // recursion ends.
    const rewrites = new Map<number, TSceneStyle>();
    this.composed.forEach((entry) => {
      if (changedIds.has(entry.own) || changedIds.has(entry.parent)) {
        rewrites.set(entry.id, composeChildStyle(this.styles[entry.own], this.styles[entry.parent]));
      }
    });
    if (rewrites.size > 0) this.rewriteStyles(rewrites, "replace");
    this.emitStyles(change);
  }

  /**
   * Resets a row to the empty style and offers it to the next defineStyle. Row 0 is never freed. Elements that still
   * use a freed row (a development warning) keep their culling bounds when defineStyle reuses it: they are not baked.
   */
  public freeStyle(styleId: number): void {
    if (styleId <= 0 || styleId >= this.styles.length || this.freeStyles.includes(styleId)) return;
    if (isDevelopmentBuild() && (this.styleUsers.get(styleId)?.size ?? 0) > 0) {
      console.warn(
        `Scene style row ${styleId} is freed while elements still use it; they draw with the next style defined ` +
          "in its place"
      );
    }
    this.rewriteStyles(new Map([[styleId, {}]]), "free");
    this.freeStyles.push(styleId);
  }

  /**
   * Sets the element's row. An owner draws with it, and its children get their drawn rows again. A child keeps it as
   * its own row (`ownStyleOf`) and draws with it composed with its scene parent's element values (`composeChildStyle`);
   * what is nested in it gets its drawn rows again.
   */
  public setStyle(id: string, styleId: number): void {
    const node = this.requireNode(id);
    const { element } = node;
    if (element.parent !== undefined) {
      if (styleId === 0) this.ownStyles.delete(id);
      else this.ownStyles.set(id, styleId);
      this.applyChildStyle(element, true);
      // What is nested in it composes with its new drawn row; `childrenOf` lists parents before what is nested in them.
      this.childrenOf(id).forEach((nested) => this.applyChildStyle(nested, true));
      warnIgnoredCameraAware(element, this.styles[element.styleId]);
      return;
    }
    this.useRow(node, styleId, true);
    this.childrenOf(id).forEach((child) => this.applyChildStyle(child, true));
    warnIgnoredCameraAware(element, this.styles[element.styleId]);
  }

  /** The element's zIndex bucket with the raise of its style; a child's is its root's. */
  public zIndexOf(element: TSceneElement): number {
    const root = this.rootOf(element);
    return root.zIndex + styleRaise(this.styles[root.styleId]);
  }

  /**
   * Scene order of two elements: the root's zIndex with its style's raise, the root's `order`, then the root before
   * its children, which follow in `childrenOf` order (by `childOrder`, then in the order they were added), as the
   * WebGL backend gives them their depth sub-orders.
   */
  public compareOrder(a: TSceneElement, b: TSceneElement): number {
    const rootA = this.rootOf(a);
    const rootB = this.rootOf(b);
    return (
      this.zIndexOf(rootA) - this.zIndexOf(rootB) || rootA.order - rootB.order || this.childRank(a) - this.childRank(b)
    );
  }

  /**
   * Patches an element and emits an update. Primitives are values: a patch replaces `primitives` with an array of
   * primitives that are never mutated afterwards, text primitives above all (the WebGL backend compares them by
   * identity and keeps the live objects of its last encode, so a text changed in place is not seen as changed).
   */
  public update(
    id: string,
    patch: Partial<Pick<TSceneElement, "x" | "y" | "bounds" | "primitives" | "hidden" | "zIndex" | "childOrder">>
  ): void {
    const node = this.requireNode(id);
    const { element } = node;
    checkChildOrder(id, patch.childOrder);
    if (patch.primitives !== undefined) preparePrimitives(patch.primitives);
    Object.assign(element, patch);
    if (patch.primitives !== undefined) {
      node.levels = levelMaskOfPrimitives(patch.primitives);
      warnIgnoredCameraAware(element, this.styles[element.styleId]);
    }
    // New primitives or bounds bake the grown bounds again, only while the row grows something.
    const reshaped = patch.primitives !== undefined || patch.bounds !== undefined;
    const regrown = reshaped && node.drawnKey !== "" && this.restyle(node, true);
    if (regrown || patch.x !== undefined || patch.y !== undefined || patch.bounds !== undefined) this.place(node);
    if (patch.childOrder !== undefined && node.up !== undefined) this.reorderKid(node);
    const fields = new Set<keyof TSceneElement>();
    for (const [key, value] of Object.entries(patch)) {
      if (value !== undefined) fields.add(key as keyof TSceneElement);
    }
    this.emit({ type: "update", element, fields });
  }

  /** Raises the element above the others of its bucket; a child raises its root. */
  public raise(id: string): void {
    const element = this.rootOf(this.require(id));
    element.order = ++this.order;
    this.emit({ type: "update", element, fields: new Set(["order"]) });
  }

  /**
   * Raises the elements above the others of their bucket, keeping their order among themselves (spec V3): each gets a
   * new highest `order`, in their current scene order, with one update each. A child stands for its root; unknown ids
   * are skipped.
   */
  public raiseMany(ids: Iterable<string>): void {
    const elements = new Map<string, TSceneElement>();
    for (const id of ids) {
      const element = this.get(id);
      if (!element) continue;
      const root = this.rootOf(element);
      elements.set(root.id, root);
    }
    const ordered = [...elements.values()].sort((a, b) => this.compareOrder(a, b));
    for (const element of ordered) {
      element.order = ++this.order;
      this.emit({ type: "update", element, fields: new Set<keyof TSceneElement>(["order"]) });
    }
  }

  /** Deletes the element; what is nested in it goes first, deepest first, with one delete change each. */
  public delete(id: string): void {
    const node = this.nodes.get(id);
    if (!node) return;
    const { element } = node;
    [...node.kids].forEach((kid) => this.delete(kid.element.id));
    this.nodes.delete(id);
    this.styleUsers.get(element.styleId)?.delete(id);
    this.index.delete(node);
    let composedKey: string | undefined;
    if (node.up !== undefined) {
      this.removeKid(node);
      composedKey = this.composedOf.get(id);
      this.composedOf.delete(id);
      this.ownStyles.delete(id);
    }
    this.emit({ type: "delete", element });
    if (composedKey !== undefined) this.releaseComposed(composedKey);
  }

  /**
   * Drawn elements whose bounds meet the rect, in draw order (`compareOrder`): not hidden, and not nested in a hidden
   * element. Only the owners are sorted, by their bucket and `order`; each owner's children follow it in `childrenOf`
   * order, which is their draw order. An owner whose bounds miss the rect still places the children that meet it.
   *
   * The bounds are the element's `bounds`, grown where the live row it draws with scales its circles or widens its
   * strokes past them (a hover scale): the index holds the bounds of the live rows, so an export whose own rows grow
   * geometry (`styles`) is not covered and can crop the grown part.
   *
   * With a `level`, an element without a primitive on that level is left out before any other work: an element
   * without primitives, or an anchor at the minimalistic level. An owner left out still places its children that have
   * primitives on the level.
   *
   * `styles` is the style list whose raises order the owners: the live one by default, an export's (`stylesWith`'s
   * `styles`).
   *
   * `includeHidden` returns hidden elements too, and what is nested in them, in the same draw order; `isDrawnHidden`
   * tells them apart.
   */
  public query(
    rect: TTileRect,
    level?: TSceneLevel,
    styles: readonly TSceneStyle[] = this.styles,
    includeHidden = false
  ): TSceneElement[] {
    const mark = ++this.queryMark;
    const owners: TNode[] = [];
    // The level's bit, tested with arithmetic as `isOnLevel` does (no-bitwise); 0 for no level.
    const bit = level === undefined ? 0 : LEVEL_BIT[level];
    this.index.query(rect, (node) => {
      if (bit !== 0 && Math.floor(node.levels / bit) % 2 !== 1) return;
      const owner = node.parent ?? node;
      if (!includeHidden && this.isNodeHidden(node)) return;
      if (owner.mark !== mark) {
        owner.mark = mark;
        owner.self = false;
        owner.found = 0;
        owners.push(owner);
      }
      if (node === owner) {
        owner.self = true;
      } else {
        node.mark = mark;
        owner.found++;
      }
    });
    for (const owner of owners) owner.bucket = owner.element.zIndex + styleRaise(styles[owner.element.styleId]);
    owners.sort(compareOwners);
    const found: TSceneElement[] = [];
    for (const owner of owners) {
      if (owner.self) found.push(owner.element);
      if (owner.found === 0) continue;
      const children = owner.children;
      if (owner.found === children.length) {
        for (const child of children) found.push(child);
        continue;
      }
      // Some children miss the rect or are hidden: keep the ones this query found.
      for (const child of children) {
        if (this.nodes.get(child.id)?.mark === mark) found.push(child);
      }
    }
    return found;
  }

  /** @internal Reuses draw order during a Canvas pan. Any scene or style change drops the candidates. */
  public queryForCanvas(rect: TTileRect, scale: number, level?: TSceneLevel): readonly TSceneElement[] {
    const { minX, minY, maxX, maxY } = rect;
    const width = maxX - minX;
    const height = maxY - minY;
    if (!Number.isFinite(minX + minY + maxX + maxY + width + height) || width < 0 || height < 0) {
      return this.query(rect, level);
    }
    const cached = this.canvasQuery;
    if (!cached || cached.scale !== scale || cached.level !== level) {
      // A single draw at a new scale or after a scene change uses the ordinary query, as during a zoom or drag.
      this.canvasQuery = { scale, level };
      return this.query(rect, level);
    }
    let region = cached.region;
    if (
      !region ||
      minX < region.rect.minX ||
      minY < region.rect.minY ||
      maxX > region.rect.maxX ||
      maxY > region.rect.maxY
    ) {
      const marginX = width / 8;
      const marginY = height / 8;
      region = this.canvasQueryRegion(
        {
          minX: minX - marginX,
          minY: minY - marginY,
          maxX: maxX + marginX,
          maxY: maxY + marginY,
        },
        level
      );
      cached.region = region;
    }
    const { elements, bounds } = region;
    const found: TSceneElement[] = [];
    for (let i = 0, at = 0; i < elements.length; i++, at += 4) {
      // Exact per-element filtering preserves run boundaries at the viewport edges.
      if (bounds[at] <= maxX && bounds[at + 1] <= maxY && bounds[at + 2] >= minX && bounds[at + 3] >= minY) {
        found.push(elements[i]);
      }
    }
    return found;
  }

  private canvasQueryRegion(rect: TTileRect, level: TSceneLevel | undefined): NonNullable<TCanvasQuery["region"]> {
    const elements = this.query(rect, level);
    const bounds = new Float64Array(elements.length * 4);
    for (let i = 0, at = 0; i < elements.length; i++, at += 4) {
      const element = elements[i];
      const { minX, minY, maxX, maxY } = this.requireNode(element.id).drawn ?? element.bounds;
      const x0 = element.x + minX;
      const y0 = element.y + minY;
      const x1 = element.x + maxX;
      const y1 = element.y + maxY;
      // TileIndex includes records with non-finite or inverted bounds in every query.
      const bounded = Number.isFinite(x0 + y0 + x1 + y1) && x0 <= x1 && y0 <= y1;
      bounds[at] = bounded ? x0 : -Infinity;
      bounds[at + 1] = bounded ? y0 : -Infinity;
      bounds[at + 2] = bounded ? x1 : Infinity;
      bounds[at + 3] = bounded ? y1 : Infinity;
    }
    return { rect, elements, bounds };
  }

  /** What an element has to redo when its row changes from `previous` to `next`. */
  private styleFields(previous: TSceneStyle | undefined, next: TSceneStyle | undefined): Set<keyof TSceneElement> {
    const fields = new Set<keyof TSceneElement>();
    if (styleEncodeKey(previous) !== styleEncodeKey(next)) fields.add("primitives");
    if (styleRaise(previous) !== styleRaise(next)) fields.add("zIndex");
    return fields;
  }

  /** The style fields that apply to the element: a child draws in its parent's bucket, so its raise moves nothing. */
  private fieldsOf(element: TSceneElement, fields: ReadonlySet<keyof TSceneElement>): Set<keyof TSceneElement> {
    const own = new Set(fields);
    if (element.parent !== undefined) own.delete("zIndex");
    return own;
  }

  /**
   * Makes the element draw with a row: the users bookkeeping, the `styleId` write, the bounds the row grows (`restyle`)
   * and, with `emit`, an update with the style fields and `styleId`, emitted even for an equal row.
   */
  private useRow(node: TNode, styleId: number, emit: boolean): void {
    const { element } = node;
    const previousStyleId = element.styleId;
    const previous = this.styles[previousStyleId];
    this.styleUsers.get(element.styleId)?.delete(element.id);
    element.styleId = styleId;
    if (this.restyle(node)) this.place(node);
    if (styleId > 0) {
      let users = this.styleUsers.get(styleId);
      if (!users) {
        users = new Set();
        this.styleUsers.set(styleId, users);
      }
      users.add(element.id);
    }
    if (!emit) return;
    const fields = this.fieldsOf(element, this.styleFields(previous, this.styles[styleId]));
    fields.add("styleId");
    this.emit({ type: "update", element, fields, previousStyleId });
  }

  /** Place of an element under its root: 0 for the root, 1 + its index in `childrenOf` for a child. */
  private childRank(element: TSceneElement): number {
    return element.parent === undefined ? 0 : 1 + (this.nodes.get(element.id)?.childIndex ?? 0);
  }

  private isNodeHidden(node: TNode): boolean {
    for (let current: TNode | undefined = node; current; current = current.up) {
      if (current.element.hidden) return true;
    }
    return false;
  }

  private sortKids(kids: readonly TNode[]): readonly TNode[] {
    return [...kids].sort((a, b) => a.element.childOrder - b.element.childOrder || a.added - b.added);
  }

  /** Puts a child among its scene parent's kids and rebuilds its owner's draw list. */
  private insertKid(node: TNode): void {
    const up = node.up;
    if (!up) return;
    up.kids = this.sortKids([...up.kids, node]);
    this.rebuildChildren(node.parent);
  }

  private removeKid(node: TNode): void {
    const up = node.up;
    if (!up) return;
    const kids = up.kids.filter((kid) => kid !== node);
    up.kids = kids.length > 0 ? kids : NO_NODES;
    this.rebuildChildren(node.parent);
  }

  /** After a child-order change: its subtree moves with it. */
  private reorderKid(node: TNode): void {
    const up = node.up;
    if (!up) return;
    up.kids = this.sortKids(up.kids);
    this.rebuildChildren(node.parent);
  }

  /** An owner's draw list, the pre-order of its nesting, and each child's rank in it; O(its children). */
  private rebuildChildren(owner: TNode | undefined): void {
    if (!owner) return;
    const list: TSceneElement[] = [];
    const visit = (current: TNode): void => {
      for (const kid of current.kids) {
        kid.childIndex = list.length;
        list.push(kid.element);
        visit(kid);
      }
    };
    visit(owner);
    owner.children = list.length > 0 ? list : NO_ELEMENTS;
  }

  /**
   * Sets a child's drawn row from its own row and its scene parent's drawn row: the own row itself while the parent's
   * row has no element dim or opacity, else the composed row of the pair, interned and counted. With `emit`, an update
   * with the style fields follows a change. The child leaves its previous composed row before that row is released, so
   * a freed row has no users.
   */
  private applyChildStyle(child: TSceneElement, emit: boolean): void {
    const node = this.nodes.get(child.id);
    if (!node) return;
    const own = this.ownStyles.get(child.id) ?? 0;
    const parentRow = (node.up?.element ?? this.rootOf(child)).styleId;
    const key = inheritsElementStyle(this.styles[parentRow]) ? `${own}|${parentRow}` : undefined;
    const current = this.composedOf.get(child.id);
    let next = own;
    if (key !== undefined) {
      let entry = this.composed.get(key);
      if (!entry) {
        const id = this.defineStyle(composeChildStyle(this.styles[own], this.styles[parentRow]));
        entry = { id, own, parent: parentRow, users: 0, dependents: 0 };
        this.composed.set(key, entry);
        this.composedById.set(id, entry);
        const above = this.composedById.get(parentRow);
        if (above) above.dependents += 1;
      }
      if (current !== key) entry.users++;
      next = entry.id;
    }
    if (child.styleId !== next) this.useRow(node, next, emit);
    if (current !== key) {
      if (key === undefined) this.composedOf.delete(child.id);
      else this.composedOf.set(child.id, key);
      if (current !== undefined) this.releaseComposed(current);
    }
  }

  private releaseComposed(key: string): void {
    const entry = this.composed.get(key);
    if (!entry) return;
    entry.users -= 1;
    this.freeIfUnused(entry);
  }

  /**
   * Frees a composed row once no element draws with it and no other composed row is composed from it, then lets the
   * row it was composed from go the same way. A subtree that re-links (its owner's row changed) keeps its old rows
   * until its last nested element left them, so no row is freed or reused under a dependent row.
   */
  private freeIfUnused(entry: TComposedEntry): void {
    if (entry.users > 0 || entry.dependents > 0) return;
    this.composed.delete(`${entry.own}|${entry.parent}`);
    this.composedById.delete(entry.id);
    this.freeStyle(entry.id);
    const above = this.composedById.get(entry.parent);
    if (!above) return;
    above.dependents -= 1;
    this.freeIfUnused(above);
  }

  /** The element's bounds grown by the geometry its row bakes (a circle scale, a wider stroke); undefined if equal. */
  private styledBounds(element: TSceneElement): TTileRect | undefined {
    const style = this.styles[element.styleId];
    // The stroke Canvas 2D paints, not only the alignment's reach: it strokes a circle centred on its radius.
    const baked = paintedGeometryBounds(bakeElementStyle(element.primitives, style));
    const { bounds } = element;
    if (
      !baked ||
      (baked.minX >= bounds.minX && baked.minY >= bounds.minY && baked.maxX <= bounds.maxX && baked.maxY <= bounds.maxY)
    ) {
      return undefined;
    }
    return {
      minX: Math.min(bounds.minX, baked.minX),
      minY: Math.min(bounds.minY, baked.minY),
      maxX: Math.max(bounds.maxX, baked.maxX),
      maxY: Math.max(bounds.maxY, baked.maxY),
    };
  }

  /**
   * Bakes the grown bounds again when the row's geometry key changed, or always with `force` (new primitives or
   * bounds), and tells whether they changed, so the caller indexes the element again. A row that grows nothing costs a
   * key lookup.
   */
  private restyle(node: TNode, force = false): boolean {
    const key = styleGeometryKey(this.styles[node.element.styleId]);
    if (!force && key === node.drawnKey) return false;
    node.drawnKey = key;
    const drawn = key === "" ? undefined : this.styledBounds(node.element);
    if (sameRect(drawn, node.drawn)) return false;
    node.drawn = drawn;
    return true;
  }

  /**
   * Development builds: one warning per store and form about a row width that is unbounded in world units, a `{ px }`
   * width without `maxWorld` or a `{ world }` width with a positive `minPx`. The culling bounds of the elements drawn
   * with it take that width at the minimum camera scale (`paintedGeometryBounds`): px / 0.01 or minPx / 0.01 world
   * units.
   */
  private warnUnboundedWidth(style: TSceneStyle): void {
    if (this.warnedUnboundedWidths.size === UNBOUNDED_WIDTH_WARNINGS.size || !isDevelopmentBuild()) return;
    UNBOUNDED_WIDTH_WARNINGS.forEach((message, form) => {
      if (this.warnedUnboundedWidths.has(form) || !hasUnboundedWidth(style, form)) return;
      this.warnedUnboundedWidths.add(form);
      console.warn(message);
    });
  }

  /** Indexes the element by its bounds, or by the bounds its row grows them to (`restyle`). */
  private place(node: TNode): void {
    const { element } = node;
    const { minX, minY, maxX, maxY } = node.drawn ?? element.bounds;
    this.index.set(node, element.x + minX, element.y + minY, element.x + maxX, element.y + maxY);
  }

  private emit(change: TSceneChange): void {
    this.canvasQuery = undefined;
    this.listeners.forEach((listener) => listener(change));
  }

  private emitStyles(change: TSceneStyleChange): void {
    this.canvasQuery = undefined;
    this.styleListeners.forEach((listener) => listener(change));
  }

  private require(id: string): TSceneElement {
    return this.requireNode(id).element;
  }

  private requireNode(id: string): TNode {
    const node = this.nodes.get(id);
    if (!node) throw new Error(`Scene element ${id} does not exist`);
    return node;
  }
}
