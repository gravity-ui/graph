import { computed, signal } from "@preact/signals-core";
import type { ReadonlySignal } from "@preact/signals-core";
import cloneDeep from "lodash/cloneDeep";
import isObject from "lodash/isObject";

import type { Graph } from "../../../graph";
import { Component } from "../../../lib/Component";
import { CoreComponent } from "../../../lib/CoreComponent";
import type { ChildDescriptor } from "../../../lib/CoreComponent";
import type { TTileRect } from "../../../lib/culling/TileIndex";
import { isDevelopmentBuild } from "../../../lib/detachedWarning";
import { LEVEL_BIT, isOnLevel, unionLevelMasks } from "../../../lib/scene/levels";
import type { TScenePrimitive } from "../../../lib/scene/types";
import { DragContext, DragDiff } from "../../../services/drag";
import type { TSceneLevel } from "../../../services/scene/types";
import { ESelectionStrategy } from "../../../services/selection";
import type { TStyleParts } from "../../../services/styles/types";
import { TGraphSettingsConfig } from "../../../store";
import { EAnchorType } from "../../../store/anchor/Anchor";
import { BlockState, IS_BLOCK_TYPE, TBlockId } from "../../../store/block/Block";
import { PortState } from "../../../store/connection/port/Port";
import { createAnchorPortId, createBlockPointPortId } from "../../../store/connection/port/utils";
import { isAllowDrag, isMetaKeyEvent } from "../../../utils/functions";
import { track } from "../../../utils/functions/track";
import { TPoint, TRect } from "../../../utils/types/shapes";
import { isWithinComponent, pointerTargetAfter } from "../EventedComponent/EventedComponent";
import type { EventedComponent } from "../EventedComponent/EventedComponent";
import { TGraphComponentProps } from "../GraphComponent";
import { Anchor } from "../anchors";
import type { TAnchor, TAnchorClass } from "../anchors";
import { TGraphLayerContext } from "../layers/graphLayer/GraphLayer";
import { SceneComponent } from "../scene/SceneComponent";
import { sameView } from "../scene/viewData";

export type TBlockSettings = {
  /** Phantom blocks are blocks whose dimensions and position
   * are not taken into account when calculating the usable rect.
   *
   * @deprecated phantom blocks are not used anymore. Please create an issue if you need this feature.
   */
  phantom?: boolean;
};

export function isTBlock(block: unknown): block is TBlock {
  return isObject(block);
}

export type TBlock<T extends Record<string, unknown> = {}> = {
  id: TBlockId;
  is: string;
  x: number;
  y: number;
  group?: string;
  width: number;
  height: number;
  name: string;
  anchors?: TAnchor[];
  settings?: TBlockSettings;
  meta?: T;
};

export type TBlockProps = TGraphComponentProps & {
  id: TBlockId;
  font?: string;
};

declare module "../../../graphEvents" {
  interface GraphEventsDefinitions {
    "block-drag-start": (
      event: CustomEvent<{
        nativeEvent: MouseEvent;
        block: TBlock;
      }>
    ) => void;

    "block-drag": (
      event: CustomEvent<{
        nativeEvent: MouseEvent;
        block: TBlock;
        x: number;
        y: number;
      }>
    ) => void;

    "block-drag-end": (
      event: CustomEvent<{
        nativeEvent: MouseEvent;
        block: TBlock;
      }>
    ) => void;
  }
}

export type BlockViewState = {
  zIndex: number;
  order: number;
};

/**
 * Options of a block view drawn on behalf of another view, such as the minimap. Without them a view follows the
 * main view's level of detail.
 */
export type TBlockViewOptions = {
  /** Whether to draw the block's name. */
  text?: boolean;
};

/** What an HTML view of a block asks for (`Block.delegateRender`). */
export type THtmlViewRequest = {
  /** Whether the scene keeps drawing the block while the view holds it (graph-react's `canvasVisible`). */
  readonly canvasVisible: boolean;
};

/** Component state of a block: the block data plus the selection read from `$selected`. */
export type TBlockComponentState<T extends TBlock = TBlock> = T & { selected?: boolean };

/** Text, border and threshold constants of the default look; in the view data, so setConstants re-runs it. */
export type TBlockLook = { fontSize: number; padding: number; borderWidth: number; textMinScale: number };

/** The inputs of a block's level methods: its data without x and y, plus the look constants (spec §5.3). */
export type TBlockView<T extends TBlock = TBlock> = Readonly<Omit<T, "x" | "y">> & { readonly look: TBlockLook };

type TBlockConstants = { readonly look: Readonly<TBlockLook>; readonly zIndex: number };

/** The default look of one view: minimalistic and schematic share `full`; `detailed` has no title. */
type TDefaultLook = {
  readonly view: object;
  readonly full: readonly TScenePrimitive[];
  readonly detailed: readonly TScenePrimitive[];
};

const HALO_GAP = 12;
const BADGE_INSET = 16;
const BADGE_RADIUS = 8;
const LEGACY_MEMBERS = [
  "renderBody",
  "renderSchematicView",
  "renderMinimalisticBlock",
  "renderDetailedView",
  "renderStroke",
  "renderText",
  "render",
];
/** The anchor hook `getAnchorClass` replaced: a subclass that still defines it gets a development warning. */
const REMOVED_ANCHOR_MEMBER = "renderAnchor";

const blockConstants = new WeakMap<Graph, ReadonlySignal<TBlockConstants>>();
const checkedClasses = new WeakSet<object>();
/** Per graph: the farthest any anchor point has lain outside its block's rect (it never decreases). */
const anchorOverflows = new WeakMap<Graph, number>();

function noteAnchorOverflow(graph: Graph, overflow: number): void {
  if (overflow > (anchorOverflows.get(graph) ?? 0)) anchorOverflows.set(graph, overflow);
}

/**
 * @internal How far outside its block's rect an anchor point of this graph has lain at most: the camera's view test
 * of the lazy anchors (`Blocks`) widens its search by it, so it finds a block whose anchors alone are in view.
 */
export function anchorOverflowOf(graph: Graph): number {
  return anchorOverflows.get(graph) ?? 0;
}

/**
 * @internal Sets the graph's largest anchor overflow to `overflow`: `Blocks` recomputes it from its blocks after its
 * block list changed, so a removed outlier (data replaced, a block deleted) no longer widens later view searches.
 */
export function resetAnchorOverflow(graph: Graph, overflow: number): void {
  anchorOverflows.set(graph, overflow);
}

/** Per graph: the largest look reach of anchor classes its blocks have read (`Block.anchorLookReach`). */
const anchorReaches = new WeakMap<Graph, number>();

function noteAnchorReach(graph: Graph, reach: number): void {
  if (reach > (anchorReaches.get(graph) ?? 0)) anchorReaches.set(graph, reach);
}

/**
 * @internal How far an anchor's look reaches from its point at most in this graph: the largest `LOOK_EXTENT` of the
 * anchor classes its blocks have read, and at least `Anchor.LOOK_EXTENT`. The camera's view test of the lazy anchors
 * (`Blocks`) widens its search by it, so it finds a block whose anchors' look alone is in view.
 */
export function anchorReachOf(graph: Graph): number {
  return Math.max(Anchor.LOOK_EXTENT, anchorReaches.get(graph) ?? 0);
}

/** @internal Sets the graph's largest anchor look reach to `reach` (`Blocks`, as `resetAnchorOverflow`). */
export function resetAnchorReach(graph: Graph, reach: number): void {
  anchorReaches.set(graph, reach);
}

/** The anchor classes of a block that keeps `Block.getAnchorClass`; set on first use (no import-order dependency). */
let defaultAnchorClasses: readonly TAnchorClass[] | undefined;

/** The levels on which a block creates stock anchors (`Anchor.CREATION_LEVELS`): schematic and detailed. */
const DEFAULT_ANCHOR_LEVELS = LEVEL_BIT.schematic + LEVEL_BIT.detailed;

/** Per graph: the creation levels of the anchor classes its blocks have read (`Block.syncAnchorClasses`). */
const anchorLevels = new WeakMap<Graph, number>();

function noteAnchorLevels(graph: Graph, mask: number): void {
  const current = anchorLevels.get(graph) ?? DEFAULT_ANCHOR_LEVELS;
  const next = unionLevelMasks(current, mask);
  if (next !== current) anchorLevels.set(graph, next);
}

/**
 * @internal The levels on which blocks of this graph may create anchor components: the stock ones (schematic and
 * detailed) and those of the anchor classes its blocks have read (`Anchor.CREATION_LEVELS`). The camera's lazy search
 * (`Blocks`) runs on these levels only.
 */
export function anchorLevelsOf(graph: Graph): number {
  return unionLevelMasks(DEFAULT_ANCHOR_LEVELS, anchorLevels.get(graph) ?? 0);
}

/** @internal Sets the graph's anchor creation levels to `mask` (`Blocks`, as `resetAnchorReach`). */
export function resetAnchorLevels(graph: Graph, mask: number): void {
  anchorLevels.set(graph, mask);
}

/** The largest `LOOK_EXTENT` of these anchor classes. */
function lookExtentOf(classes: readonly TAnchorClass[]): number {
  let extent = 0;
  for (const klass of classes) if (klass.LOOK_EXTENT > extent) extent = klass.LOOK_EXTENT;
  return extent;
}

/** The levels on which anchors of these classes are created, as one mask. */
function creationLevelsOfClasses(classes: readonly TAnchorClass[]): number {
  let mask = 0;
  for (const klass of classes) mask = unionLevelMasks(mask, Anchor.creationLevelsOf(klass));
  return mask;
}

function sameClasses(a: readonly TAnchorClass[], b: readonly TAnchorClass[]): boolean {
  return a.length === b.length && a.every((klass, index) => klass === b[index]);
}

/** Whether a state change moves the block only: `getAnchorClass` is not asked again for it. */
function onlyPlaceChanged(state: object, next: object): boolean {
  for (const key of Object.keys(next)) {
    if (key === "x" || key === "y") continue;
    if (Reflect.get(state, key) !== Reflect.get(next, key)) return false;
  }
  return true;
}

type TExportPort = {
  readonly anchorId: string;
  readonly port: PortState;
  readonly owner: PortState["owner"];
  readonly lookup: boolean | undefined;
};

/**
 * The default look's constants and the block bucket, one computed per graph (review I3). It reads the whole constants
 * and settings, but keeps its object while the values are equal, so a settings change that does not touch them
 * (`canDragCamera`, `renderer`, an inline settings object from React) runs no block's view data again.
 */
function blockConstantsOf(graph: Graph): ReadonlySignal<TBlockConstants> {
  let constants = blockConstants.get(graph);
  if (!constants) {
    let last: TBlockConstants | undefined;
    constants = computed((): TBlockConstants => {
      const { block, text } = graph.$graphConstants.value;
      const { scaleFontSize } = graph.rootStore.settings.$settings.value;
      const look = {
        fontSize: Math.round(text.BASE_FONT_SIZE * scaleFontSize),
        padding: text.PADDING,
        borderWidth: block.BORDER_WIDTH,
        textMinScale: block.SCALES[0],
      };
      if (last && last.zIndex === block.DEFAULT_Z_INDEX && sameView(last.look, look)) return last;
      last = Object.freeze({ look: Object.freeze(look), zIndex: block.DEFAULT_Z_INDEX });
      return last;
    });
    blockConstants.set(graph, constants);
  }
  return constants;
}

/**
 * Development check, once per class (decision 1, review I10): a `Block` subclass that defines an imperative render
 * member draws nothing with it, unless it extends `LegacyCanvasBlock` (`static legacyCanvas`). A subclass that still
 * defines `renderAnchor`, legacy or not, is told that blocks never call it: `getAnchorClass` replaces it.
 */
function warnLegacyMembers(klass: unknown, base: unknown): void {
  if (typeof klass !== "function" || checkedClasses.has(klass)) return;
  checkedClasses.add(klass);
  const legacyCanvas = Boolean((klass as { legacyCanvas?: boolean }).legacyCanvas);
  const found = new Set<string>();
  let rendersAnchors = false;
  let current: unknown = klass;
  while (typeof current === "function" && current !== base) {
    const prototype: unknown = current.prototype;
    if (typeof prototype === "object" && prototype !== null) {
      const owns = (member: string): boolean => Object.prototype.hasOwnProperty.call(prototype, member);
      if (owns(REMOVED_ANCHOR_MEMBER)) rendersAnchors = true;
      for (const member of legacyCanvas ? [] : LEGACY_MEMBERS) {
        if (owns(member)) found.add(member);
      }
    }
    current = Object.getPrototypeOf(current);
  }
  if (rendersAnchors) {
    console.warn(
      `${klass.name}: blocks no longer call ${REMOVED_ANCHOR_MEMBER}(), so it never creates their anchors. Override ` +
        "getAnchorClass(anchor) to return Anchor or a subclass instead, and declare the size and line width it " +
        "passed as the class's static SIZE and LINE_WIDTH (the block keys each anchor by its id)."
    );
  }
  if (found.size === 0) return;
  console.warn(
    `${klass.name}: blocks no longer draw imperatively, so ${[...found].join(", ")} never draw. Extend ` +
      "LegacyCanvasBlock (deprecated: drawn on the GraphLayer canvas under scene blocks) to keep them for one " +
      "release, or describe the look with the level methods minimalistic, schematic and detailed."
  );
}

/**
 * A block drawn by the scene (spec §5.1): a retained scene component whose look the level methods describe and whose
 * element the theme styles (selection, dragging, hover). Its anchors are child elements of its element. GraphLayer
 * stays its parent: it receives events, hit tests and drags there.
 */
export class Block<T extends TBlock = TBlock, Props extends TBlockProps = TBlockProps> extends SceneComponent<
  TBlockView<T>,
  Props,
  TBlockComponentState<T>,
  TGraphLayerContext
> {
  public static IS = IS_BLOCK_TYPE;

  /** The entity type of the selection bucket and of tag addresses. */
  public static override entityType = "block";

  /**
   * Part names style rules can set for blocks; a type brand only, never set at runtime. A subclass adds parts by
   * redeclaring it: `public declare readonly __styleParts?: TStyleParts<"body" | "border" | "title" | "icon">`.
   */
  public declare readonly __styleParts?: TStyleParts<"body" | "border" | "title" | "halo" | "badge">;

  public cursor?: string = "pointer";

  // from controller mixin
  public readonly isBlock = true;

  public declare context: TGraphLayerContext;

  public declare state: TBlockComponentState<T>;

  public declare props: Props;

  public connectedState: BlockState<T>;

  private connectedStateUnsubscribers: (() => void)[] = [];

  protected lastDragEvent?: MouseEvent;

  protected startDragCoords: number[] = [];

  /**
   * True when the block is fully hidden by CollapsibleGroup (hitbox removed). The handover (`isRenderDelegated()`:
   * `setRenderDelegated` or an HTML view's hold) also hides the block's scene element and makes isVisible() return
   * false, but keeps the hitbox.
   */
  private blockHidden = false;

  /** Bumped when `subscribe()` binds a new BlockState (an undo re-adds an id): the view data reads the new one (I6). */
  private readonly connectedVersion = signal(0);

  private defaultLookCache?: TDefaultLook;

  /**
   * Whether this block has created its anchor components. They are created lazily (user decision, 2026-11-14): once
   * the camera shows the block at a level that draws anchors (`shouldCreateAnchors`), and kept until its anchor list
   * changes, `useBlocksAnchors` turns off or the block unmounts. Until then the block owns and positions their ports.
   */
  private anchorsCreated = false;

  /** How far its anchor points lie outside its rect at most (`updatePortPositions`): part of the lazy view test. */
  private anchorOverflow = 0;

  /** How far its anchors' look reaches from their points, as last read (`anchorLookReach`): part of the view test. */
  private anchorReach = 0;

  /** The class `getAnchorClass` chose for each anchor of `$anchors`, in its order (`syncAnchorClasses`). */
  private anchorClassList?: readonly TAnchorClass[];

  /** The distinct classes of `anchorClassList`, for exports and the lazy rule. */
  private anchorClassSet?: readonly TAnchorClass[];

  /** Whether block data `getAnchorClass` may read changed since the classes were read. */
  private anchorClassesDirty = true;

  /** The levels on which its anchors are created (`Anchor.CREATION_LEVELS`), as last read. */
  private anchorCreationMask = DEFAULT_ANCHOR_LEVELS;

  /** Whether the current failure of `getAnchorClass` was reported (`reportAnchorClassError`). */
  private anchorClassErrorReported = false;

  /** The ids of the anchor list last seen, to release the ports of anchors that leave it. */
  private anchorIds = new Set<string>();

  /**
   * Whether this block holds anchor components an export created (`createExportAnchors`) that the lazy rule would not
   * have created. `updateChildren` keeps returning them until the export releases them (`releaseExportAnchors`).
   */
  private exportAnchors = false;

  /** The anchor ports' owner and lookup before an export created their components; restored when it drops them. */
  private exportPorts?: readonly TExportPort[];

  /** The HTML views holding this block (`delegateRender`), each its own record; created on the first hold. */
  private htmlViews?: THtmlViewRequest[];

  /** Follows `$level` while an HTML view holds the block: a level change re-derives the handover. */
  private unwatchLevel?: () => void;

  protected currentState(): T {
    return this.connectedState.$state.value;
  }

  /** @internal Anchors and selection are projected from their own signals. */
  public override clearRemovedData(previous: object, next: object): void {
    super.clearRemovedData(previous, next, ["anchors", "selected"]);
  }

  /**
   * The React container's order (decision 9): the dense rank among the blocks shown in HTML, zIndex 0, so graph-react's
   * `zIndex + order` is the rank. A container that watches it counts the block in, and leaves it out when it stops; the
   * object stays while the rank does, so other containers do not re-run.
   */
  public readonly $viewState: ReadonlySignal<BlockViewState> = this.createViewState();

  constructor(props: Props, parent: Component) {
    super(props, parent);
    if (isDevelopmentBuild()) warnLegacyMembers(this.constructor, Block);

    this.connectedState = this.getConnectedState(props.id);
    this.subscribe(props.id);
  }

  public override isEntityAvailable(): boolean {
    return super.isEntityAvailable() && this.connectedState.isAttached();
  }

  public getEntityId(): TBlockId {
    return this.props.id;
  }

  public getGeometry(): TRect {
    return {
      x: this.state.x,
      y: this.state.y,
      width: this.state.width,
      height: this.state.height,
    };
  }

  protected override getHitBoxRect(): TRect {
    return this.connectedState.$geometry.value;
  }

  protected override isRenderAllowed(): boolean {
    if (this.blockHidden || this.isRenderDelegated()) return false;
    return super.isRenderAllowed();
  }

  public getConfigFlag<K extends keyof TGraphSettingsConfig>(flagPath: K): TGraphSettingsConfig[K] {
    return this.context.graph.rootStore.settings.getConfigFlag(flagPath);
  }

  private getConnectedState(id: TBlockId): BlockState<T> {
    const blockState = this.context.graph.rootStore.blocksList.getBlockState(id);
    if (!blockState) throw new Error(`Cannot bind Block to missing block ${id}`);
    // The registered custom block declares its data shape; the caller owns that contract.
    return blockState as BlockState<T>;
  }

  /** The selection as a state patch: it comes from the selection bucket (`$selected`), never from the block data. */
  private selectionState(): Pick<TBlockComponentState<T>, "selected"> {
    // T may declare its own `selected`; the component state's `selected` is the bucket's boolean.
    return { selected: this.connectedState.$selected.peek() } as unknown as Pick<TBlockComponentState<T>, "selected">;
  }

  protected subscribe(id: TBlockId): void {
    this.connectedStateUnsubscribers.forEach((unsub) => unsub());
    this.connectedStateUnsubscribers = [];

    const previous = this.connectedState;
    this.connectedState = this.getConnectedState(id);
    if (previous !== this.connectedState) {
      // Queued edits belong to the old block, including edits that have never reached this.state.
      this.__data.nextState = undefined;
      this.__data.removedStateKeys = undefined;
    }
    // The ids of another block's state must not be compared with the new list (the first emission below). Those of
    // the same block's last list are: the ports of the anchors a re-add left out are released, as for a list change.
    if (previous.$state.peek().id !== id) {
      this.anchorIds = new Set(this.connectedState.$anchors.peek().map((anchor) => anchor.id));
    }
    this.connectedVersion.value = this.connectedVersion.peek() + 1;
    this.state = { ...cloneDeep(this.connectedState.$state.value), selected: this.connectedState.$selected.value };
    // `connectedState` is assigned first: the connections' endpoint computeds (`ConnectionState.$sourceBlock`,
    // `$targetBlock`, `$hidden`) read a block's state through this component and depend on the bound state's view, so
    // the writes below make them read the new state.
    this.connectedState.setViewComponent(this);
    if (previous !== this.connectedState) {
      // A rebind (the block was removed and added back with its id in one frame): the old state names nothing, and
      // the new state's hidden value applies, `false` included, as for a new component. A hide requested on the new
      // state before this bind was applied by `setViewComponent`.
      this.unbindConnectedState(previous);
      const hidden = this.connectedState.$hidden.peek();
      if (hidden !== this.blockHidden) this.setHiddenBlock(hidden);
    }
    this.setState({
      ...this.connectedState.$state.value,
      anchors: this.connectedState.$anchors.value,
      // After the spread: a legacy `selected` in untyped or persisted data must not override the selection.
      ...this.selectionState(),
    });

    this.connectedStateUnsubscribers = [
      this.connectedState.$anchors.subscribe((anchors) => {
        this.setState({
          anchors: this.connectedState.$anchors.value,
        });
        this.releaseRemovedAnchorPorts(anchors);
        // A new anchor list is created lazily again: in this update while the block is in view at a level that draws
        // anchors (the kept components are reconciled by key), else once the camera shows it there.
        this.anchorsCreated = false;
        this.anchorClassesDirty = true;
        this.shouldUpdateChildren = true;
      }),
      this.connectedState.$selected.subscribe((selected) => {
        if (selected !== this.getNextState().selected) {
          this.setState({ selected } as unknown as Pick<TBlockComponentState<T>, "selected">);
        }
      }),
      this.connectedState.$state.subscribe(() => {
        this.setState({
          ...this.connectedState.$state.value,
          anchors: this.connectedState.$anchors.value,
          ...this.selectionState(),
        });
        this.updateHitBox(this.connectedState.$geometry.value);
        if (!this.blockHidden) {
          this.updatePortPositions();
        }
      }),
    ];
  }

  /** Sets `lookup` on the anchor ports this block owns: `true` hides their connections (`useBlocksAnchors` off). */
  private setAnchorPortsLookup(lookup: boolean): void {
    this.connectedState.$anchors.peek().forEach((anchor) => {
      const port = this.ports.get(createAnchorPortId(this.state.id, anchor.id));
      if (port?.owner === this && port.lookup !== lookup) port.updatePort({ lookup });
    });
  }

  /**
   * Releases the ports of anchors that left the list. The block claims every anchor port and owns it until the
   * anchor's component exists (lazy anchors), so without this a connection to a removed anchor without a component
   * would keep drawing at the anchor's last point. A removed anchor's component gives its port up in its own unmount.
   */

  private releaseRemovedAnchorPorts(anchors: readonly TAnchor[]): void {
    const next = new Set(anchors.map((anchor) => anchor.id));
    const connections = this.context.graph.rootStore.connectionsList;
    for (const id of this.anchorIds) {
      if (next.has(id)) continue;
      const portId = createAnchorPortId(this.state.id, id);
      this.ports.delete(portId);
      // Only while the block owns it: an anchor component that owns it releases it when it unmounts.
      connections.releasePort(portId, this);
    }
    this.anchorIds = next;
  }

  protected propsChanged(nextProps: Props): void {
    const nextBlockState = this.context.graph.rootStore.blocksList.$blocksMap.value.get(nextProps.id);
    if (nextBlockState && nextBlockState !== this.connectedState) {
      this.subscribe(nextProps.id);
    }
    this.anchorClassesDirty = true;
    super.propsChanged(nextProps);
  }

  protected override stateChanged(nextState: TBlockComponentState<T>): void {
    // Anything but a move may change the anchor classes; a move never asks getAnchorClass again.
    if (!this.anchorClassesDirty && this.picksAnchorClasses() && !onlyPlaceChanged(this.state, nextState)) {
      this.anchorClassesDirty = true;
    }
    super.stateChanged(nextState);
  }

  protected getNextState(): TBlockComponentState<T> {
    return this.__data.nextState || this.state;
  }

  protected willMount(): void {
    // Sets GraphComponent's mounted flag and creates the scene element's computeds.
    super.willMount();
    this.addEventListener("click", this.handleClick);
    let anchorsSetting = true;
    this.subscribeSignal(this.context.graph.rootStore.settings.$useBlocksAnchors, (enabled) => {
      if (anchorsSetting) {
        anchorsSetting = false;
        return;
      }
      // Before plan 3a, turning the setting off at runtime hid the connections attached to anchors (their ports went
      // to `lookup`), and turning it on gave them their positions back. A graph that starts with it off draws them.
      // This holds whether or not the anchor components exist: the block does it for the ports it owns, and an anchor
      // that unmounts because of the setting does it for its own port (`Anchor.unmount`).
      this.setAnchorPortsLookup(!enabled);
      // Anchors were reconciled only on anchor changes: turning the setting off left them mounted and hittable.
      this.shouldUpdateChildren = true;
      this.performRender();
    });
  }

  protected willIterate(): void {
    super.willIterate();
    this.syncAnchorClasses();
    // Lazy anchors: a block that mounted, moved or was shown in view at a level that draws anchors creates them in
    // this update, so they draw in the frame that first draws it. The camera's view test (`Blocks`) covers camera and
    // level changes. Cheapest checks first: a walked block runs this in every frame until it has them.
    if (!this.anchorsCreated && !this.shouldUpdateChildren && this.isAnchorsAllowed() && this.shouldCreateAnchors()) {
      this.shouldUpdateChildren = true;
    }
  }

  /**
   * @internal The camera's view test (`Blocks`) found this block in view at a level that draws anchors: its next
   * update creates its anchor components. Returns false, asking for nothing, when it has them, has none to create, or
   * its own test says no (the search found it at the edge of the view, for example).
   */
  public requestAnchors(): boolean {
    if (this.anchorsCreated || !this.isAnchorsAllowed() || !this.shouldCreateAnchors()) return false;
    this.performRender();
    return true;
  }

  /**
   * Whether this block creates its anchor components now: it is not hidden by a collapsed group, the scene level is
   * one its anchor classes are created on (`Anchor.CREATION_LEVELS`), and the camera shows the block, one of its
   * anchor points, or the look of an anchor (the `LOOK_EXTENT` of its class, as an export reads it). A camera without a
   * size (a graph not laid out yet) counts as showing every block. Override it to create anchors on other terms; it is
   * asked in the block's updates and after camera changes that show it.
   */
  protected shouldCreateAnchors(): boolean {
    if (this.blockHidden) return false;
    if (!isOnLevel(this.anchorCreationLevels(), this.context.graph.scene.$level.peek())) return false;
    const camera = this.context.camera;
    const { relativeWidth, relativeHeight } = camera.getCameraState();
    if (relativeWidth <= 0 || relativeHeight <= 0) return true;
    const { x, y, width, height } = this.connectedState.$geometry.peek();
    // Anchor points outside the rect (a short block with many anchors) and the anchors' look count as part of the
    // block: a dot whose point lies just outside the view still shows at its edge.
    const out = this.anchorOverflow + this.anchorLookReach();
    return camera.isRectVisible(x - out, y - out, width + 2 * out, height + 2 * out);
  }

  /**
   * How far the look of this block's anchors reaches from their points at most: the largest `LOOK_EXTENT` of their
   * classes, as last read in its update. While its classes are unknown, the graph's largest reach. Recorded as the
   * graph's largest for the camera's view search (`anchorReachOf`).
   */
  private anchorLookReach(): number {
    const classes = this.anchorClasses();
    const reach = classes ? lookExtentOf(classes) : anchorReachOf(this.context.graph);
    this.anchorReach = reach;
    noteAnchorReach(this.context.graph, reach);
    return reach;
  }

  /**
   * @internal An export (`graph.scene.toImage()`, through `Blocks`) makes its picture independent of where the camera
   * has been: this creates, through the normal lifecycle (`getAnchorClass`, the level methods, tags and styles), the
   * anchor components this block does not have, when its anchors can reach the export's `rect` (world units) and draw
   * on `level`. They can reach it when the block's rect, widened by its anchor overflow and by the `LOOK_EXTENT` of its
   * anchor classes, meets it. Their elements and style bindings exist when it returns; nothing else of the tree is
   * applied. Skipped for a block that has its anchor components, has no anchors, is hidden (a collapsed group, or drawn
   * by React: its element is hidden) or is not mounted, and while `useBlocksAnchors` is off. Returns whether it created
   * any: the export then calls `releaseExportAnchors()`.
   *
   * Throws when it would have to create them while this block's own update runs (the export was called from one of its
   * lifecycle hooks): entering that update again would run its hooks twice.
   */
  public createExportAnchors(rect: TTileRect, level: TSceneLevel): boolean {
    // Handed over to HTML (`setRenderDelegated`, an HTML view's hold) or hidden: its element is not drawn.
    const notDrawn = this.blockHidden || this.hidden || this.isRenderDelegated();
    if (this.anchorsCreated || this.exportAnchors || notDrawn || !this.isMounted()) return false;
    const anchors = this.connectedState.$anchors.peek();
    if (anchors.length === 0 || !this.getConfigFlag("useBlocksAnchors")) return false;
    if (!this.anchorsShowIn(rect, level)) return false;
    if (this.__comp.updating) {
      throw new Error(
        `graph.scene.toImage() cannot create the anchors of block ${String(this.props.id)} from that block's own ` +
          "update: it was called from one of the block's lifecycle hooks (stateChanged, willIterate, ...) while the " +
          "block has no anchor components. Export outside that block's update, for example from an event handler or " +
          "a layer's render()."
      );
    }
    this.exportPorts = anchors.map((anchor) => {
      const port = this.getAnchorPort(anchor.id);
      return { anchorId: anchor.id, port, owner: port.owner, lookup: port.lookup };
    });
    this.exportAnchors = true;
    this.shouldUpdateChildren = true;
    this.performRender();
    try {
      // The block's own update first (its element, then its children), then the anchors' first updates.
      CoreComponent.applyUpdatesNow(this);
    } catch (error) {
      try {
        this.releaseExportAnchors();
      } catch (cleanupError) {
        console.error(`${this.constructor.name}: dropping the anchors an export created failed`, cleanupError);
      }
      throw error;
    }
    if (this.anchorsCreated || !this.isAnchorsAllowed()) {
      // The lazy rule created them in this update (the camera shows the block): they stay, as lazy anchors.
      this.exportAnchors = false;
      this.exportPorts = undefined;
      return false;
    }
    return true;
  }

  /**
   * @internal Drops the anchor components `createExportAnchors()` created, through the normal reconcile (each anchor's
   * unmount gives its port back to the block), and restores the owner and lookup their ports had before. Anchors the
   * lazy rule wants by now (the camera shows the block at a level that draws anchors) stay, as lazy anchors.
   */
  public releaseExportAnchors(): void {
    if (!this.exportAnchors) return;
    this.exportAnchors = false;
    const ports = this.exportPorts;
    this.exportPorts = undefined;
    this.shouldUpdateChildren = true;
    this.performRender();
    CoreComponent.applyUpdatesNow(this);
    // An unmounted block released its ports itself.
    if (this.anchorsCreated || !ports || !this.isMounted()) return;
    for (const { anchorId, port, owner, lookup } of ports) {
      // An anchor removed meanwhile released its port; a kept one gets back what it had.
      if (!this.anchorIds.has(anchorId)) continue;
      if (port.owner !== owner) {
        if (owner) port.setOwner(owner);
        else port.removeOwner();
      }
      if (port.lookup !== lookup) port.updatePort({ lookup });
    }
  }

  /** @internal How far its anchor points lie outside its rect at most (`Blocks` recomputes the graph's largest). */
  public getAnchorOverflow(): number {
    return this.anchorOverflow;
  }

  /** @internal How far its anchors' look reaches, as last read (`Blocks` recomputes the graph's largest). */
  public getAnchorReach(): number {
    return this.anchorReach;
  }

  /**
   * Whether these anchors can show in an export of `rect` at `level`: the block's rect, widened by its anchor overflow
   * and by the largest `LOOK_EXTENT` of their classes, meets it, and one of their classes draws on the level.
   */
  private anchorsShowIn(rect: TTileRect, level: TSceneLevel): boolean {
    const classes = this.anchorClasses();
    // Classes unknown (a pending update may change which one `getAnchorClass` picks): the block is a candidate.
    if (!classes) return true;
    const { x, y, width, height } = this.connectedState.$geometry.peek();
    const out = this.anchorOverflow + lookExtentOf(classes);
    if (x - out > rect.maxX || x + width + out < rect.minX || y - out > rect.maxY || y + height + out < rect.minY) {
      return false;
    }
    return level === "schematic" || classes.some((klass) => Anchor.drawsOnLevel(klass, level));
  }

  /**
   * Whether an update of this block is pending: new props or state not applied yet, or its queued update. What a
   * `getAnchorClass` override reads (`this.state`, `this.props`, view data derived from them) may be stale then.
   */
  private hasPendingUpdate(): boolean {
    const data = this.__data;
    const entry = this.__comp.detached;
    return data.nextProps !== undefined || data.nextState !== undefined || (entry !== undefined && entry.slot >= 0);
  }

  /**
   * The classes of these anchors' components: an export reads their `LOOK_EXTENT` and level methods
   * (`Anchor.drawsOnLevel`). Without a `getAnchorClass` override every anchor is an `Anchor`. With one, the classes
   * read in the block's last update; `undefined` while an update is pending or the data changed since (they may not be
   * final), so no class-based rejection happens and the export draws whatever intersects.
   */
  private anchorClasses(): readonly TAnchorClass[] | undefined {
    if (!this.picksAnchorClasses()) return (defaultAnchorClasses ??= Object.freeze([Anchor]));
    if (this.hasPendingUpdate() || this.anchorClassesDirty) return undefined;
    return this.anchorClassSet;
  }

  /** Whether this block's class overrides `getAnchorClass`; without an override every anchor is an `Anchor`. */
  private picksAnchorClasses(): boolean {
    return this.getAnchorClass !== Block.prototype.getAnchorClass;
  }

  /**
   * Reads the anchor classes from the block's applied data (`getAnchorClass`) after it changed (a move excepted), in
   * the block's update: their reach and creation levels are cached and noted for the camera's lazy search, an offscreen
   * block's too, and a change of the chosen classes reconciles the anchors, so each component has the class chosen now.
   */
  private syncAnchorClasses(): void {
    if (!this.anchorClassesDirty) return;
    this.anchorClassesDirty = false;
    if (!this.picksAnchorClasses()) return;
    let list: TAnchorClass[];
    try {
      list = this.connectedState.$anchors.peek().map((anchor) => this.getAnchorClass(anchor));
    } catch (error) {
      this.reportAnchorClassError(error);
      return;
    }
    this.anchorClassErrorReported = false;
    const previous = this.anchorClassList;
    const classes = [...new Set(list)];
    this.anchorClassList = list;
    this.anchorClassSet = classes;
    this.anchorReach = lookExtentOf(classes);
    noteAnchorReach(this.context.graph, this.anchorReach);
    this.anchorCreationMask = creationLevelsOfClasses(classes);
    noteAnchorLevels(this.context.graph, this.anchorCreationMask);
    if (this.anchorsCreated && previous !== undefined && !sameClasses(previous, list)) this.shouldUpdateChildren = true;
  }

  /**
   * Reports a `getAnchorClass` failure once per failing stretch of this block: again after a read that succeeded in
   * between. The message says what the block uses meanwhile.
   */
  private reportAnchorClassError(error: unknown): void {
    if (this.anchorClassErrorReported) return;
    this.anchorClassErrorReported = true;
    const block = `${this.constructor.name} (block ${String(this.props.id)})`;
    const fallback = this.anchorClassList
      ? "the block keeps the anchor classes it read before, with their reach and creation levels"
      : "until it returns classes, the block uses the graph's anchor reach and creation levels, and creating its " +
        "anchors calls getAnchorClass() again";
    console.error(`${block}: getAnchorClass() threw; ${fallback}`, error);
  }

  /** The levels on which this block creates its anchors now: its classes', or the graph's while they are unknown. */
  private anchorCreationLevels(): number {
    if (!this.picksAnchorClasses()) return DEFAULT_ANCHOR_LEVELS;
    return this.anchorClassList ? this.anchorCreationMask : anchorLevelsOf(this.context.graph);
  }

  /** @internal The levels on which its anchors are created, as last read (`Blocks` recomputes the graph's). */
  public getAnchorLevels(): number {
    return this.anchorCreationMask;
  }

  protected override getViewData(): TBlockView<T> {
    track(this.connectedVersion);
    const { x: _x, y: _y, ...data } = this.connectedState.$state.value;
    return { ...data, look: blockConstantsOf(this.context.graph).value.look };
  }

  /**
   * Halo and badge (hidden by the theme), body, border and the title from `SCALES[0]`. Also today's minimalistic look,
   * as `renderMinimalisticBlock` drew `renderSchematicView`: `Block` defines no `minimalistic`, so the level takes this
   * list (`encodeLevels`' fallback), and a subclass that overrides only `schematic` changes both levels with one list.
   */
  protected override schematic(view: TBlockView<T>): readonly TScenePrimitive[] {
    return this.defaultLook(view).full;
  }

  /** Today's detailed canvas look: no title (decision 4); the HTML handover is plan 3b. */
  protected override detailed(view: TBlockView<T>): readonly TScenePrimitive[] {
    return this.defaultLook(view).detailed;
  }

  protected override getSceneOrigin(): TPoint {
    track(this.connectedVersion);
    const { x, y } = this.connectedState.$state.value;
    return { x, y };
  }

  protected override getSceneZIndex(): number {
    return blockConstantsOf(this.context.graph).value.zIndex;
  }

  /**
   * Hidden for a reason of its own: by `setVisibility`, or by its group (`setHiddenBlock`). Its delegation is not one:
   * the scene adds it, and a block its group hides stays a hit barrier for its anchors while it is delegated.
   */
  protected override isSceneHidden(): boolean {
    return super.isSceneHidden() || this.blockHidden;
  }

  /** The drag raise (decision 6): requested in the accepted `block-drag-start` action, batched by DragService. */
  protected raiseOnDragStart(): void {
    this.context.graph.scene.requestRaise(this.getSceneElementId());
  }

  /**
   * The handover to HTML (spec §10). An HTML view of this block (graph-react's `GraphBlock`) calls it once its HTML
   * has mounted, and calls the returned function when it unmounts or its request changes. A hold counts at the detailed
   * level only (`isHeldByHtml()`): there the block and its children are hit, drawn in the scene or not (D4), and while
   * a holding view asks for `canvasVisible: false` the scene draws nothing of the block: its body, parts, anchors and
   * children. Its hit box, view data and tags stay current; its connections stay drawn. On the other levels a hold
   * changes nothing: zooming out of the detailed level draws the block in the frame that hides the HTML.
   * `setRenderDelegated` is the low-level switch without these rules: on every level.
   */
  public delegateRender(request: THtmlViewRequest): () => void {
    const held: THtmlViewRequest = { canvasVisible: request.canvasVisible };
    (this.htmlViews ??= []).push(held);
    if (!this.unwatchLevel) {
      let first = true;
      this.unwatchLevel = this.context.graph.scene.$level.subscribe(() => {
        // The first call comes from subscribing: no change.
        if (first) {
          first = false;
          return;
        }
        this.performRender();
      });
    }
    this.performRender();
    this.requestRetarget();
    let released = false;
    return (): void => {
      if (released) return;
      released = true;
      const views = this.htmlViews;
      const index = views ? views.indexOf(held) : -1;
      // Dropped already: the block's unmount drops every hold.
      if (!views || index < 0) return;
      views.splice(index, 1);
      if (views.length === 0) {
        this.htmlViews = undefined;
        this.unwatchLevel?.();
        this.unwatchLevel = undefined;
      }
      this.performRender();
      this.requestRetarget();
    };
  }

  /** Whether an HTML view holds this block now: one has mounted (`delegateRender`) and the level is detailed. */
  public isHeldByHtml(): boolean {
    return this.htmlViews !== undefined && this.context.graph.scene.$level.peek() === "detailed";
  }

  /**
   * Whether the scene draws nothing of this block now: after `setRenderDelegated(true)`, or while a holding HTML view
   * asks for `canvasVisible: false` (any such view hides it). Read this, not `hidden`, to know the block is handed
   * over.
   */
  public override isRenderDelegated(): boolean {
    if (super.isRenderDelegated()) return true;
    return this.isHeldByHtml() && (this.htmlViews?.some((view) => !view.canvasVisible) ?? false);
  }

  /**
   * Shown outside the scene (D4: it and its children are hit, drawn in the scene or not): after
   * `setRenderDelegated(true)`, on every level, or while an HTML view holds it, at the detailed level.
   */
  public override isShownOutsideScene(): boolean {
    return this.isRenderDelegated() || this.isHeldByHtml();
  }

  public updatePosition(x: number, y: number, silent = false): void {
    if (!silent) {
      this.connectedState.updateXY(x, y);
    }
    this.setState({ x, y });
    this.updatePortPositions();
  }

  protected updatePortPositions(): void {
    if (this.blockHidden) {
      return;
    }
    // Update input port position
    const inputPoint = this.getConnectionPoint("in");
    this.getInputPort().setPoint(inputPoint.x, inputPoint.y);

    // Update output port position
    const outputPoint = this.getConnectionPoint("out");
    this.getOutputPort().setPoint(outputPoint.x, outputPoint.y);

    // Update anchor ports positions
    const { x, y, width, height } = this.connectedState;
    let overflow = 0;
    this.connectedState.$anchors.value.forEach((anchor) => {
      const port = this.getAnchorPort(anchor.id);
      if (port) {
        const anchorPoint = this.getConnectionAnchorPosition(anchor);
        port.setPoint(anchorPoint.x, anchorPoint.y);
        overflow = Math.max(
          overflow,
          x - anchorPoint.x,
          anchorPoint.x - x - width,
          y - anchorPoint.y,
          anchorPoint.y - y - height
        );
      }
    });
    this.anchorOverflow = overflow;
    noteAnchorOverflow(this.context.graph, overflow);
  }

  public getInputPort(): PortState {
    return this.getPort(createBlockPointPortId(this.state.id, true));
  }

  public getOutputPort(): PortState {
    return this.getPort(createBlockPointPortId(this.state.id, false));
  }

  public getAnchorPort(anchorId: string): PortState {
    return this.getPort(createAnchorPortId(this.state.id, anchorId));
  }

  /**
   * Check if block can be dragged based on canDrag setting
   */
  public override isDraggable(): boolean {
    const canDrag = this.context.graph.rootStore.settings.$canDrag.value;
    return isAllowDrag(canDrag, this.connectedState.$selected.value);
  }

  /**
   * Handle drag start - emit event and initialize drag state
   */
  public override handleDragStart(context: DragContext): void {
    this.context.graph.executеDefaultEventAction(
      "block-drag-start",
      {
        nativeEvent: context.sourceEvent,
        block: this.connectedState.asTBlock(),
      },
      () => {
        this.lastDragEvent = context.sourceEvent;
        // Store start coords: [worldX, worldY, blockX, blockY]
        this.startDragCoords = [...context.startCoords, this.state.x, this.state.y];
        this.raiseOnDragStart();
      }
    );
  }

  /**
   * Handle click event
   */
  protected handleClick = (event: MouseEvent): void => {
    event.stopPropagation();
    /* Handle selection change */
    this.handleSelectionChange(event);
  };

  protected handleSelectionChange = (event: MouseEvent): void => {
    this.connectedState.setSelection(
      !isMetaKeyEvent(event) ? true : !this.connectedState.selected,
      !isMetaKeyEvent(event) ? ESelectionStrategy.REPLACE : ESelectionStrategy.APPEND
    );
  };

  /**
   * Handle drag update - calculate new position and update block
   */
  public override handleDrag(diff: DragDiff, context: DragContext): void {
    if (!this.startDragCoords.length) return;

    this.lastDragEvent = context.sourceEvent;

    const [x, y] = this.calcNextDragPosition(context.currentCoords[0], context.currentCoords[1]);

    this.context.graph.executеDefaultEventAction(
      "block-drag",
      {
        nativeEvent: context.sourceEvent,
        block: this.connectedState.asTBlock(),
        x,
        y,
      },
      () => this.applyNextPosition(x, y)
    );
  }

  /**
   * Handle drag end - finalize drag state
   */
  public override handleDragEnd(context: DragContext): void {
    if (!this.startDragCoords.length) return;

    this.context.graph.emit("block-drag-end", {
      nativeEvent: context.sourceEvent,
      block: this.connectedState.asTBlock(),
    });

    this.lastDragEvent = undefined;
    this.startDragCoords = [];
    this.updateHitBox(this.state);
  }

  protected calcNextDragPosition(x: number, y: number): [number, number] {
    // Calculate displacement from drag start (consistent with DragDiff API)
    const diffX = (x - this.startDragCoords[0]) | 0;
    const diffY = (y - this.startDragCoords[1]) | 0;

    // Apply displacement to initial block position
    let nextX = this.startDragCoords[2] + diffX;
    let nextY = this.startDragCoords[3] + diffY;

    const spanGridSize = this.context.constants.block.SNAPPING_GRID_SIZE;

    if (spanGridSize > 1) {
      nextX = Math.round(nextX / spanGridSize) * spanGridSize;
      nextY = Math.round(nextY / spanGridSize) * spanGridSize;
    }

    return [nextX, nextY];
  }

  protected applyNextPosition(x: number, y: number): void {
    this.updatePosition(x, y);
  }

  public updateHitBox = (geometry: TRect, force?: boolean): void => {
    if (this.blockHidden) return;
    this.setHitBox(geometry.x, geometry.y, geometry.x + geometry.width, geometry.y + geometry.height, force);
  };

  /* Calculate the position of the anchor based on the absolute position of the block. */
  public getConnectionAnchorPosition(anchor: TAnchor): TPoint {
    const { x, y } = this.getAnchorPosition(anchor);
    return {
      x: x + this.connectedState.x,
      y: y + this.connectedState.y,
    };
  }

  /* Calculate the position of the anchors relative to the block container. */
  public getAnchorPosition(anchor: TAnchor): TPoint {
    const index = this.connectedState.$anchorIndexs.value?.get(anchor.id) || 0;
    const offset = this.context.constants.block.HEAD_HEIGHT + this.context.constants.block.BODY_PADDING;
    return {
      x: anchor.type === EAnchorType.OUT ? this.connectedState.width : 0,
      y: offset + index * this.context.constants.system.GRID_SIZE * 2,
    };
  }

  public getConnectionPoint(direction: "in" | "out"): TPoint {
    return {
      x: this.connectedState.x + (direction === "out" ? this.connectedState.width : 0),
      y: (this.connectedState.y + this.connectedState.height / 2) | 0,
    };
  }

  /**
   * The class of one anchor's component (spec §5.2): `Anchor` by default. Return a subclass for another look: its
   * level methods describe it, its view data carries this block's (`view.block`), and its statics `SIZE`,
   * `LINE_WIDTH`, `LOOK_EXTENT` and `CREATION_LEVELS` give its size, reach and levels. The block creates the component
   * with the anchor's data and port, keyed by the anchor's id.
   *
   * Calling contract: a pure function of the anchor and the block's data (`this.state`, `this.props`,
   * `this.connectedState`), without side effects. The block calls it in its update after that data changed (a move
   * excepted), and reconciles its anchors when a class changes. It learns of a change in `stateChanged` and
   * `propsChanged`: a subclass that overrides either must call `super`, or its anchor classes stop following the data.
   * A throw is reported (`console.error`); the block keeps the classes it read before, if any.
   */
  protected getAnchorClass(_anchor: TAnchor): TAnchorClass {
    return Anchor;
  }

  /** One anchor's component: its class with the anchor's data, its port and the class's `SIZE` and `LINE_WIDTH`. */
  private anchorDescriptor(anchor: TAnchor, index: number): ChildDescriptor {
    const list = this.anchorClassList;
    const klass = list && list.length === (this.state.anchors ?? []).length ? list[index] : this.getAnchorClass(anchor);
    return klass.create(
      {
        ...anchor,
        zIndex: this.zIndex,
        size: klass.SIZE,
        lineWidth: klass.LINE_WIDTH,
        port: this.getAnchorPort(anchor.id),
      },
      { key: anchor.id }
    );
  }

  protected isAnchorsAllowed(): boolean {
    return Boolean(
      Array.isArray(this.state.anchors) && this.state.anchors.length && this.getConfigFlag("useBlocksAnchors")
    );
  }

  /**
   * The anchor components, created lazily: none until the block is in view at a level that draws anchors
   * (`shouldCreateAnchors`), then all of them until the anchor list changes or `useBlocksAnchors` turns off. An export
   * holds them meanwhile (`createExportAnchors`), without making them lazy anchors.
   */
  protected updateChildren(): ChildDescriptor[] {
    // An empty list, not undefined: undefined skips the reconcile and would leave anchors mounted (review M12).
    if (!this.isAnchorsAllowed()) {
      this.anchorsCreated = false;
      return [];
    }
    if (this.anchorsCreated || this.shouldCreateAnchors()) {
      this.anchorsCreated = true;
    } else if (!this.exportAnchors) {
      return [];
    }
    return (this.state.anchors ?? []).map((anchor, index) => this.anchorDescriptor(anchor, index));
  }

  /* Returns rect of block size with padding */
  protected getContentRect(): TRect {
    return {
      x: this.state.x + this.context.constants.text.PADDING,
      y: this.state.y + this.context.constants.text.PADDING,
      height: this.state.height - this.context.constants.text.PADDING * 2,
      width: this.state.width - this.context.constants.text.PADDING * 2,
    };
  }

  public setHiddenBlock(hidden: boolean): void {
    const wasBlockHidden = this.blockHidden;
    this.blockHidden = hidden;
    // What a still pointer hits changes (settled item 11). A block hidden from its mount never set a hit box, so
    // showing it sets its first one, which asks nothing by itself.
    this.requestRetarget();
    if (hidden) {
      this.removeHitBox();
      this.shouldRender = false;
    } else {
      const { x, y, width, height } = this.getHitBoxRect();
      this.setHitBox(x, y, x + width, y + height, true);
      if (wasBlockHidden && !this.hidden) {
        // Restore port positions to their correct values now that the block
        // is visible again (delegatePorts() moved them while it was hidden).
        this.updatePortPositions();
      }
    }
    this.performRender();
  }

  /**
   * Whether the block shows as hovered (`hoveredTag`) while `target` is the pointer's target: by default while the
   * target is the block or one of its descendants (its anchors, its children), as CSS `:hover` (В1, D5). Override to
   * decide by target, for example a block that is not hovered over its anchors: `return target === this;`.
   */
  protected isHoveredBy(target: EventedComponent | undefined): boolean {
    return isWithinComponent(this, target);
  }

  /** The block's hover: its own `mouseenter`/`mouseleave` and those bubbling up from its descendants (D5). */
  protected override onDispatchedEvent(event: Event): void {
    super.onDispatchedEvent(event);
    if (event.type === "mouseenter" || event.type === "mouseleave") {
      this.setHoveredTag(this.isHoveredBy(pointerTargetAfter(event)));
    }
  }

  private defaultLook(view: TBlockView<T>): TDefaultLook {
    const cached = this.defaultLookCache;
    if (cached && cached.view === view) return cached;
    const { width, height, name, look } = view;
    const halo: TScenePrimitive = {
      kind: "rect",
      part: "halo",
      x: -HALO_GAP,
      y: -HALO_GAP,
      width: width + 2 * HALO_GAP,
      height: height + 2 * HALO_GAP,
      radius: HALO_GAP,
    };
    const body: TScenePrimitive = { kind: "rect", part: "body", x: 0, y: 0, width, height };
    const border: TScenePrimitive = {
      kind: "rect",
      part: "border",
      x: 0,
      y: 0,
      width,
      height,
      border: { width: { px: look.borderWidth, minWorld: look.borderWidth, maxWorld: 10 }, align: "inside" },
    };
    const title: TScenePrimitive = {
      kind: "text",
      part: "title",
      text: name,
      family: "sans-serif",
      weight: "bold",
      size: look.fontSize,
      lineHeight: look.fontSize,
      x: look.padding,
      y: look.padding,
      width: Math.max(0, width - 2 * look.padding),
      height: Math.max(0, height - 2 * look.padding),
      align: "center",
      minScale: look.textMinScale,
    };
    const badge: TScenePrimitive = {
      kind: "circle",
      part: "badge",
      cx: width - BADGE_INSET,
      cy: BADGE_INSET,
      r: BADGE_RADIUS,
    };
    const next: TDefaultLook = {
      view,
      full: Object.freeze([halo, body, border, title, badge]),
      detailed: Object.freeze([halo, body, border, badge]),
    };
    this.defaultLookCache = next;
    return next;
  }

  private createViewState(): ReadonlySignal<BlockViewState> {
    let last: BlockViewState | undefined;
    return computed(
      (): BlockViewState => {
        // Per-id rank values, not the rank map's identity: a flush builds a new map whenever anything was dirty.
        const order = this.context.graph.scene.delegatedRanks.rankOf(this.getSceneElementId());
        if (last && last.order === order) return last;
        last = { zIndex: 0, order };
        return last;
      },
      {
        watched: (): void => this.context.graph.scene.delegatedRanks.track(this.getSceneElementId(), true),
        unwatched: (): void => this.context.graph.scene.delegatedRanks.track(this.getSceneElementId(), false),
      }
    );
  }

  protected override unmount(): void {
    this.connectedStateUnsubscribers.forEach((unsub) => unsub());
    this.connectedStateUnsubscribers = [];

    // Release ownership of all ports owned by this block
    const connectionsList = this.context.graph.rootStore.connectionsList;

    connectionsList.releasePort(createBlockPointPortId(this.state.id, true), this);
    connectionsList.releasePort(createBlockPointPortId(this.state.id, false), this);

    this.state.anchors?.forEach((anchor) => {
      connectionsList.releasePort(createAnchorPortId(this.state.id, anchor.id), this);
    });
    // After the ports: the connections' endpoint computeds then read the released ports, and follow the component
    // that claims them next (a block added back with this id after a frame).
    this.unbindConnectedState(this.connectedState);

    this.unwatchLevel?.();
    this.unwatchLevel = undefined;
    this.htmlViews = undefined;

    super.unmount();
  }

  /**
   * The state no longer names this component: on a rebind to a new state (`subscribe`) and on unmount. A state that
   * another component already took is left alone.
   */
  private unbindConnectedState(state: BlockState<T>): void {
    if (state.getViewComponent() === this) state.unsetViewComponent();
  }
}
