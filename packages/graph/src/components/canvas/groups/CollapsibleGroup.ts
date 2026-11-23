import { batch, computed, signal } from "@preact/signals-core";
import type { ReadonlySignal, Signal } from "@preact/signals-core";

import { DragContext, DragDiff } from "../../../services/drag";
import { EAnchorType } from "../../../store/anchor/Anchor";
import { BlockState } from "../../../store/block/Block";
import type { TBlockId } from "../../../store/block/Block";
import { PortState } from "../../../store/connection/port/Port";
import { TGroup, TGroupId } from "../../../store/group/Group";
import { track } from "../../../utils/functions/track";
import { TRect } from "../../../utils/types/shapes";
import type { Block } from "../blocks/Block";

import { BlockGroups } from "./BlockGroups";
import { Group, TGroupGeometry, TGroupProps, TGroupStyle } from "./Group";

// ---------------------------------------------------------------------------
// Event declaration
// ---------------------------------------------------------------------------

declare module "../../../graphEvents" {
  interface GraphEventsDefinitions {
    "group-collapse-change": (
      event: CustomEvent<{
        groupId: TGroupId;
        collapsed: boolean;
        currentRect: TRect;
        nextRect: TRect;
      }>
    ) => void;
  }
}

/** A single collapse direction axis value. */
export type TCollapseDirection = "start" | "center" | "end";

// ---------------------------------------------------------------------------
// TCollapsibleGroup interface
// ---------------------------------------------------------------------------

export interface TCollapsibleGroup extends TGroup {
  /** Whether this group is currently collapsed */
  collapsed?: boolean;
  /**
   * The visual rect used when collapsed. When set, the group renders and
   * responds to hit-tests using this rect instead of the normal `rect`.
   *
   * `rect` itself continues to be managed by `withBlockGrouping` (or
   * manually) and always reflects the real block bounding box.
   */
  collapsedRect?: TRect;
  /**
   * Where the collapsed header appears relative to the full group rect.
   *
   * - `x`: `"start"` → left edge  |  `"center"` → centered  |  `"end"` → right edge
   * - `y`: `"start"` → top edge   |  `"center"` → centered  |  `"end"` → bottom edge
   *
   * Defaults to `{ x: "start", y: "start" }` (top-left corner).
   *
   * Only used by the default collapse rect computation. Ignored when
   * {@link getCollapseRect} is provided.
   */
  collapseDirection?: { x?: TCollapseDirection; y?: TCollapseDirection };
  /**
   * User-defined function to compute the collapsed rect from the expanded rect.
   *
   * When not provided, a default implementation computes a
   * {@link DEFAULT_COLLAPSED_WIDTH}×{@link DEFAULT_COLLAPSED_HEIGHT} rect
   * pinned at the position determined by {@link collapseDirection}.
   *
   * @example
   * ```typescript
   * const group: TCollapsibleGroup = {
   *   id: "my-group",
   *   rect: { x: 0, y: 0, width: 400, height: 300 },
   *   component: CollapsibleGroup,
   *   getCollapseRect: (_group, rect) => ({
   *     x: rect.x + rect.width / 2 - 100,
   *     y: rect.y,
   *     width: 200,
   *     height: 48,
   *   }),
   * };
   * ```
   */
  getCollapseRect?: (group: TCollapsibleGroup, expandedRect: TRect) => TRect;
}

const DEFAULT_COLLAPSED_WIDTH = 200;
const DEFAULT_COLLAPSED_HEIGHT = 48;

const DIRECTION_FACTOR: Record<TCollapseDirection, number> = { start: 0, center: 0.5, end: 1 };

/**
 * Default collapse rect computation. Produces a rect of the given size
 * pinned at the position determined by `direction`.
 *
 * Exported so users can call it from their custom `getCollapseRect` and
 * extend or modify the default behavior.
 *
 * @param expandedRect - The full group rect before collapsing.
 * @param direction - Where the header is pinned (defaults to top-left).
 * @param collapsedWidth - Header width (defaults to 200).
 * @param collapsedHeight - Header height (defaults to 48).
 */
export function computeDefaultCollapseRect(
  expandedRect: TRect,
  direction?: { x?: TCollapseDirection; y?: TCollapseDirection },
  collapsedWidth?: number,
  collapsedHeight?: number
): TRect {
  const w = collapsedWidth ?? DEFAULT_COLLAPSED_WIDTH;
  const h = collapsedHeight ?? DEFAULT_COLLAPSED_HEIGHT;
  const ax = DIRECTION_FACTOR[direction?.x ?? "start"];
  const ay = DIRECTION_FACTOR[direction?.y ?? "start"];
  return {
    x: expandedRect.x + ax * (expandedRect.width - w),
    y: expandedRect.y + ay * (expandedRect.height - h),
    width: w,
    height: h,
  };
}

/**
 * A Group component that supports collapsing and expanding.
 *
 * When collapsed:
 * - All blocks in the group are hidden (not deleted from the store)
 * - Connection ports of hidden blocks are redirected to the group edges
 * - The group renders as a compact header using `collapsedRect`
 * - The real `rect` (block bounding box) is NOT locked — `withBlockGrouping`
 *   continues to track block positions normally
 *
 * When expanded, all of the above is reversed.
 *
 * Collapse/expand is triggered programmatically via {@link collapse} and
 * {@link expand}. There is no built-in UI trigger — subscribe to graph
 * events (e.g. `dblclick`) and call these methods from your handler.
 *
 * A cancelable `group-collapse-change` event is emitted before each
 * transition. Call `event.preventDefault()` to cancel the operation.
 *
 * ### Collapse rect
 *
 * Provide `getCollapseRect` on the TCollapsibleGroup data to control
 * where the group collapses to. If not provided, the default
 * implementation uses `collapseDirection` to pin a 200×48 header.
 *
 * ### Usage
 * ```typescript
 * const group: TCollapsibleGroup = {
 *   id: "my-group",
 *   rect: { x: 0, y: 0, width: 0, height: 0 },
 *   component: CollapsibleGroup,
 *   collapsed: false,
 *   collapseDirection: { x: "start", y: "start" },
 * };
 * ```
 *
 * Blocks must carry `group: "my-group"` in their TBlock data.
 */
/** Port ID suffix for the group's left-edge delegation target. */
const GROUP_PORT_LEFT = "_left";
/** Port ID suffix for the group's right-edge delegation target. */
const GROUP_PORT_RIGHT = "_right";

const defaultStyle: TGroupStyle = {
  background: "rgba(100, 100, 100, 0.1)",
  border: "rgba(100, 100, 100, 0.3)",
  borderWidth: 2,
  selectedBackground: "rgba(100, 100, 100, 1)",
  selectedBorder: "rgba(100, 100, 100, 1)",
  highlightedBackground: "rgba(100, 200, 100, 0.3)",
  highlightedBorder: "rgba(100, 200, 100, 0.8)",
};

const defaultGeometry: TGroupGeometry = {
  padding: [20, 20, 20, 20],
};

/**
 * Cached result of {@link CollapsibleGroup.getPortDelegationCounts}; invalidated
 * when delegation membership changes (delegate/undelegate), not when rects move.
 */
type TPortDelegationCounts = { left: number; right: number };

/** What a collapse applied to one block: the state it hid, and the ports it delegated to the group's edge ports. */
type TCollapseMember = {
  readonly state: BlockState;
  /** The group the block's data names, read reactively: another value means the block left. */
  readonly group: ReadonlySignal<string | undefined>;
  readonly ports: PortState[];
  /** The component whose ports were last delegated (`delegateMemberPorts`): a bind of the same one is skipped. */
  delegatedFor?: Block;
  /** Ends the record's watch of its state's component binding (`watchMemberView`). */
  stopViewWatch?: () => void;
};

export class CollapsibleGroup<T extends TCollapsibleGroup = TCollapsibleGroup> extends Group<T> {
  /** Snapshot of `collapsedRect` at drag start; see {@link handleDrag}. */
  private dragStartCollapsedRect: TRect | null = null;

  /**
   * Lazily computed delegation counts for {@link renderCollapsedView}; cleared when
   * delegation changes (delegate/undelegate ports).
   */
  private portDelegationCountsCache: TPortDelegationCounts | undefined;

  /**
   * What the collapse applied, per block id (`hideMembers`). Declared, not initialized: the Group constructor binds,
   * and may collapse, before this class's fields are set; `getCollapseMembers` creates it.
   */
  private declare collapseMembers: Map<TBlockId, TCollapseMember> | undefined;

  /** Bumped when a record is added, so that the membership watch reads it (`watchMembers`). */
  private declare collapseRevision: Signal<number> | undefined;

  public static define(config: {
    style?: Partial<TGroupStyle>;
    geometry?: Partial<TGroupGeometry>;
  }): typeof CollapsibleGroup {
    return class SpecificGroup<T extends TCollapsibleGroup = TCollapsibleGroup> extends this<T> {
      constructor(props: TGroupProps, parent: BlockGroups) {
        super(
          {
            ...props,
            style: {
              ...defaultStyle,
              ...config.style,
              ...props.style,
            },
            geometry: {
              ...defaultGeometry,
              ...config.geometry,
              ...props.geometry,
            },
          },
          parent
        );
      }
    };
  }
  /**
   * Extend base subscription to also react to collapsed state on init.
   * subscribeSignal fires immediately with the current value, so a group
   * that starts with collapsed: true will hide its blocks on mount.
   *
   * Also handles external collapse state changes: if setGroups() is called
   * with collapsed: false while the group is currently collapsed, it expands.
   */
  protected override subscribeToGroup(): void {
    super.subscribeToGroup();

    this.subscribeGroupSignal(this.groupState.$state, (group: T) => {
      if (group.collapsed) {
        this.hideMembers();
        const rect = group.collapsedRect ?? this.computeCollapsedRect(group.rect);
        if (!group.collapsedRect) {
          this.groupState.updateGroup({
            collapsedRect: rect,
          } as Partial<T>);
        }
        this.delegatePorts(rect);
        // Correct the hitbox immediately. super.subscribeToGroup already ran
        // updateHitBox(group.rect) but at that point state.collapsedRect may
        // not yet be populated, so getRect() used the expanded rect.
        // Passing the collapsed rect here forces the correct visual rect regardless
        // of whether state.collapsedRect is set yet (getRect falls through to
        // super.getRect(rect) when state.collapsedRect is undefined).
        this.updateHitBox(rect);
      } else if (this.collapseMembers?.size || (this.state as T).collapsed) {
        // Transition: collapsed → expanded triggered externally (e.g. via setGroups), also before a frame applied the
        // collapse to the component's state.
        this.releaseMembers();
        this.updateHitBox(group.rect);
      }
    });

    this.watchMembers();
  }

  /**
   * The group stops being bound to its state: on a rebind to a new state (a re-add with its id before a frame) and on
   * unmount. Whatever its collapse applied ends here, through the one release path: its blocks are shown and their
   * ports undelegated. A new state that is collapsed applies its own collapse when it binds (`subscribeToGroup`).
   */
  protected override leaveGroupState(): void {
    super.leaveGroupState();
    this.releaseMembers();
    this.invalidatePortDelegationCountsCache();
  }

  // ---------------------------------------------------------------------------
  // Overrides — use collapsedRect for rendering and hit-testing when collapsed
  // ---------------------------------------------------------------------------

  /**
   * Returns the visual rect. When collapsed, returns `collapsedRect`
   * (with padding) so the group renders as a compact header.
   */
  protected override getRect(rect?: TRect): TRect {
    const state = this.getState() as T;
    if (state.collapsed && state.collapsedRect) {
      return super.getRect(state.collapsedRect);
    }
    return super.getRect(rect);
  }

  /**
   * Sets the hitbox to the collapsed rect when collapsed, or the expanded
   * rect otherwise. Passes the raw inner rect to super so that base Group's
   * updateHitBox can apply padding exactly once.
   */
  protected override updateHitBox(rect: TRect): void {
    const state = this.getState() as T;
    super.updateHitBox(state.collapsed && state.collapsedRect ? state.collapsedRect : rect);
  }

  /**
   * Remember inner rect and collapsed rect so {@link handleDrag} can translate
   * `collapsedRect` by the same snapped delta as `rect` (grid snapping in Group).
   */
  public override handleDragStart(context: DragContext): void {
    super.handleDragStart(context);
    // Use store snapshot — component `this.state` can lag behind after collapse/expand.
    const group = this.groupState.$state.value as T;
    if (group.collapsed && group.collapsedRect) {
      this.dragStartCollapsedRect = { ...group.collapsedRect };
    } else {
      this.dragStartCollapsedRect = null;
    }
  }

  public override handleDragEnd(context: DragContext): void {
    this.dragStartCollapsedRect = null;
    super.handleDragEnd(context);
  }

  /**
   * When dragging a collapsed group, move `collapsedRect` in lockstep with the snapped
   * `rect` movement computed by {@link Group.handleDrag} (not per-frame mouse deltas).
   */
  public override handleDrag(diff: DragDiff, context: DragContext): void {
    if (!this.dragStartRect || !this.lastSnappedPos) {
      return;
    }
    super.handleDrag(diff, context);
    const group = this.groupState.$state.value as T;
    if (!group.collapsed || !group.collapsedRect || !this.dragStartCollapsedRect || !this.dragStartRect) {
      return;
    }
    // Same snapped inner position Group uses (see Group.handleDrag) — avoids relying on
    // store vs component state timing with withBlockGrouping during drag.
    const { x: newInnerX, y: newInnerY } = this.snapPosition(
      this.dragStartRect.x + diff.diffX,
      this.dragStartRect.y + diff.diffY
    );
    const dx = newInnerX - this.dragStartRect.x;
    const dy = newInnerY - this.dragStartRect.y;
    if (dx === 0 && dy === 0) {
      return;
    }
    const newCollapsedRect = {
      x: this.dragStartCollapsedRect.x + dx,
      y: this.dragStartCollapsedRect.y + dy,
      width: this.dragStartCollapsedRect.width,
      height: this.dragStartCollapsedRect.height,
    };
    this.groupState.updateGroup({
      collapsedRect: newCollapsedRect,
    } as Partial<T>);
    this.updateGroupPortPositions(this.getRect(newCollapsedRect));
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /** Whether this group is currently in the collapsed state. */
  public isCollapsed(): boolean {
    return this.groupState.$state.value.collapsed ?? false;
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  protected getGroupBlocks(): BlockState[] {
    return this.context.graph.rootStore.groupsList.$blockGroups.value[this.props.id] ?? [];
  }

  /**
   * Returns the number of ports currently delegated to the left and right
   * group edge ports. Only meaningful when the group is collapsed.
   *
   * Cost is O(blocks × anchors) per call when the cache is cold — typical group
   * sizes keep this cheap. The result is cached until delegation changes
   * ({@link delegatePorts} / {@link undelegatePorts}); override {@link renderCollapsedView}
   * and call a custom counter if you need different invalidation rules.
   */
  protected getPortDelegationCounts(): TPortDelegationCounts {
    if (this.portDelegationCountsCache !== undefined) {
      return this.portDelegationCountsCache;
    }
    let left = 0;
    let right = 0;
    this.getGroupBlocks().forEach((blockState) => {
      const canvasBlock = blockState.getViewComponent();
      if (!canvasBlock) return;

      const inputPort = canvasBlock.getInputPort();
      if (inputPort?.isDelegated) left++;

      const outputPort = canvasBlock.getOutputPort();
      if (outputPort?.isDelegated) right++;

      blockState.$anchors.value.forEach((anchor) => {
        const port = canvasBlock.getAnchorPort(anchor.id);
        if (port?.isDelegated) {
          if (anchor.type === EAnchorType.OUT) right++;
          else left++;
        }
      });
    });
    this.portDelegationCountsCache = { left, right };
    return this.portDelegationCountsCache;
  }

  private invalidatePortDelegationCountsCache(): void {
    this.portDelegationCountsCache = undefined;
  }

  /**
   * Compute the collapsed rect for a given full rect.
   *
   * Uses the user-provided `getCollapseRect` if available, otherwise falls
   * back to the direction-based default.
   */
  private computeCollapsedRect(fullRect: TRect): TRect {
    const state = this.groupState.$state.value;
    if (state.getCollapseRect) {
      return state.getCollapseRect(state, fullRect);
    }
    return computeDefaultCollapseRect(fullRect, state.collapseDirection);
  }

  // ---------------------------------------------------------------------------
  // Collapse
  // ---------------------------------------------------------------------------

  /**
   * Collapse the group: set collapsedRect, hide member blocks,
   * and redirect their ports to the group edges.
   *
   * Emits a cancelable `group-collapse-change` event before applying changes.
   * If a listener calls `event.preventDefault()`, the collapse is cancelled.
   */
  public collapse(): void {
    const currentRect = this.groupState.$state.value.rect;
    const nextRect = this.computeCollapsedRect(currentRect);

    this.context.graph.executеDefaultEventAction(
      "group-collapse-change",
      {
        groupId: this.props.id as TGroupId,
        collapsed: true,
        currentRect,
        nextRect,
      },
      () => {
        batch(() => {
          this.hideMembers();
          this.delegatePorts(nextRect);
          this.groupState.updateGroup({
            collapsed: true,
            collapsedRect: nextRect,
          } as Partial<T>);
        });

        // Explicitly update hitbox to the collapsed rect.
        this.updateHitBox(nextRect);
      }
    );
  }

  // ---------------------------------------------------------------------------
  // Expand
  // ---------------------------------------------------------------------------

  /**
   * Expand the group: remove collapsedRect, show member blocks, and let
   * them resume managing their own ports.
   *
   * Emits a cancelable `group-collapse-change` event before applying changes.
   * If a listener calls `event.preventDefault()`, the expand is cancelled.
   */
  public expand(): void {
    const state = this.groupState.$state.value as T;
    const currentRect = state.collapsedRect ?? state.rect;
    const nextRect = state.rect;

    this.context.graph.executеDefaultEventAction(
      "group-collapse-change",
      {
        groupId: this.props.id as TGroupId,
        collapsed: false,
        currentRect,
        nextRect,
      },
      () => {
        batch(() => {
          this.releaseMembers();
          this.groupState.updateGroup({
            collapsed: false,
            collapsedRect: undefined,
          } as Partial<T>);
        });

        // Explicitly update hitbox to the full rect. The signal
        // subscription also calls updateHitBox, but getRect() may see stale
        // `this.state.collapsed` during the batch.
        this.updateHitBox(this.groupState.$state.value.rect);
      }
    );
  }

  // ---------------------------------------------------------------------------
  // What a collapse applies to its members
  // ---------------------------------------------------------------------------
  //
  // A collapse hides the group's blocks and delegates their ports to the group's edge ports. It records what it did,
  // per block id (`collapseMembers`), and one release path (`releaseMembers`) gives it back: when a block leaves the
  // group (its data names another group or none, or it is removed), when the group expands, and when the group binds
  // to a new state or unmounts (`leaveGroupState`). A move to another collapsed group transfers the record's effects
  // to that group in the same batch.

  /** Hides the group's blocks (`requestHidden`) and records them. */
  private hideMembers(states: readonly BlockState[] = this.getGroupBlocks()): ReadonlyMap<TBlockId, TCollapseMember> {
    const members = this.getCollapseMembers();
    let added = false;
    for (const state of states) {
      state.requestHidden(true);
      const member = members.get(state.id);
      if (member?.state === state) continue;
      // A state that replaced the recorded one before the membership watch saw it: the block's component and its
      // ports are the same, so the recorded delegations carry over.
      member?.stopViewWatch?.();
      const next: TCollapseMember = {
        state,
        group: computed(() => state.$state.value.group),
        ports: member?.ports ?? [],
      };
      next.stopViewWatch = this.watchMemberView(next);
      members.set(state.id, next);
      added = true;
    }
    // The membership watch reads the new records.
    if (added) this.getCollapseRevision().value += 1;
    return members;
  }

  /**
   * Releases the recorded delegations and visibility of the given members or of all of them. If a retained block
   * moved to another collapsed group, that group takes over before the batch publishes the new port positions.
   */
  private releaseMembers(ids?: readonly TBlockId[]): void {
    const members = this.collapseMembers;
    if (!members || members.size === 0) return;
    this.invalidatePortDelegationCountsCache();
    batch(() => {
      for (const id of ids ?? Array.from(members.keys())) {
        const member = members.get(id);
        if (!member) continue;
        members.delete(id);
        member.stopViewWatch?.();
        member.ports.forEach((port) => {
          if (port.isDelegated) port.undelegate();
        });
        if (!member.state.isAttached()) continue;
        const groupId = member.group.peek();
        const destination =
          groupId === undefined || groupId === this.props.id
            ? undefined
            : this.context.graph.rootStore.groupsList.getGroupState(groupId)?.getViewComponent();
        if (destination instanceof CollapsibleGroup && destination.isCollapsed()) {
          const transferred = destination.hideMembers([member.state]).get(id);
          if (transferred) destination.delegateMemberPorts(transferred);
          destination.performRender();
        } else {
          member.state.requestHidden(false);
        }
      }
    });
  }

  /**
   * Follows the recorded blocks while the group is bound to its state: a block whose id is removed, or whose data
   * names another group, left, and its record is released at once. A record's component binding is followed by the
   * record itself (`watchMemberView`), so a bind costs one record's work, not a pass over the group.
   */
  private watchMembers(): void {
    const watch = computed((): TBlockId[] => {
      track(this.getCollapseRevision());
      const blocks = this.context.graph.rootStore.blocksList.$blocksMap.value;
      const left: TBlockId[] = [];
      this.collapseMembers?.forEach((member, id) => {
        if (blocks.get(id) !== member.state || member.group.value !== this.props.id) left.push(id);
      });
      return left;
    });
    this.subscribeGroupSignal(watch, (left) => {
      if (left.length === 0) return;
      this.releaseMembers(left);
      this.performRender();
    });
  }

  /**
   * Delegates a record's ports when a component binds to its state after the collapse: the block was added back (its
   * component binds in the frame) or its class changed. Each bind is one record's work: a component its ports were
   * already delegated for is skipped (`delegatedFor`). The record's creation is not a bind: `delegatePorts` delegates
   * the members that have a component then. Returns the unsubscribe function that the record's release calls.
   */
  private watchMemberView(member: TCollapseMember): () => void {
    let created = true;
    return member.state.$viewComponent.subscribe((view) => {
      if (created) {
        created = false;
        return;
      }
      if (!view || view === member.delegatedFor || this.collapseMembers?.get(member.state.id) !== member) return;
      this.delegateMemberPorts(member);
    });
  }

  /** The records of the collapse, created on first use: the Group constructor binds before this class's fields. */
  private getCollapseMembers(): Map<TBlockId, TCollapseMember> {
    if (!this.collapseMembers) this.collapseMembers = new Map();
    return this.collapseMembers;
  }

  private getCollapseRevision(): Signal<number> {
    if (!this.collapseRevision) this.collapseRevision = signal(0);
    return this.collapseRevision;
  }

  // ---------------------------------------------------------------------------
  // Port delegation
  // ---------------------------------------------------------------------------

  /**
   * Get (or create) the group's left-edge port used as a delegation target.
   * Input ports and IN anchors delegate to this port when collapsed.
   */
  private getLeftEdgePort(): PortState {
    return this.getPort(`${String(this.props.id)}${GROUP_PORT_LEFT}`);
  }

  /**
   * Get (or create) the group's right-edge port used as a delegation target.
   * Output ports and OUT anchors delegate to this port when collapsed.
   */
  private getRightEdgePort(): PortState {
    return this.getPort(`${String(this.props.id)}${GROUP_PORT_RIGHT}`);
  }

  /**
   * Update the group's edge port positions to match the given rect.
   */
  private updateGroupPortPositions(rect: TRect): void {
    const midY = rect.y + rect.height / 2;
    this.getLeftEdgePort().setPoint(rect.x, midY);
    this.getRightEdgePort().setPoint(rect.x + rect.width, midY);
  }

  /**
   * Delegate all ports of group blocks to the group's edge ports.
   *
   * - Input port  → left-edge port
   * - Output port → right-edge port
   * - IN anchors  → left-edge port
   * - OUT anchors → right-edge port
   *
   * While delegated, block ports mirror the group edge positions.
   * When the group is dragged, only the group edge ports need to be
   * updated — all delegated ports follow automatically.
   */
  private delegatePorts(targetRect?: TRect): void {
    this.invalidatePortDelegationCountsCache();
    const rect = this.getRect(targetRect);
    this.updateGroupPortPositions(rect);

    const members = this.collapseMembers;
    this.getGroupBlocks().forEach((blockState) => {
      const member = members?.get(blockState.id);
      if (member?.state === blockState) this.delegateMemberPorts(member);
    });
  }

  /**
   * Delegates the ports of one recorded block that are not delegated yet, and records them: its component's input and
   * output ports and its anchors' ports. A block without a component yet is delegated once its component binds
   * (`watchMembers`).
   */
  private delegateMemberPorts(member: TCollapseMember): void {
    const canvasBlock = member.state.getViewComponent();
    if (!canvasBlock) return;
    member.delegatedFor = canvasBlock;
    const leftPort = this.getLeftEdgePort();
    const rightPort = this.getRightEdgePort();
    const delegate = (port: PortState | undefined, target: PortState): void => {
      if (!port || port.isDelegated) return;
      port.delegate(target);
      member.ports.push(port);
      this.invalidatePortDelegationCountsCache();
    };
    delegate(canvasBlock.getInputPort(), leftPort);
    delegate(canvasBlock.getOutputPort(), rightPort);
    member.state.$anchors.peek().forEach((anchor) => {
      delegate(canvasBlock.getAnchorPort(anchor.id), anchor.type === EAnchorType.OUT ? rightPort : leftPort);
    });
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------

  protected override render(): void {
    const collapsed = (this.state as T).collapsed ?? false;
    if (collapsed) {
      this.renderCollapsedView(this.context.ctx);
    } else {
      super.render();
    }
  }

  /**
   * Render the compact header shown when the group is collapsed.
   * Override this method to customise the collapsed appearance.
   */
  protected renderCollapsedView(ctx: CanvasRenderingContext2D): void {
    const rect = this.getRect();

    if (this.isHighlighted()) {
      ctx.strokeStyle = this.style.highlightedBorder;
      ctx.fillStyle = this.style.highlightedBackground;
    } else if (this.state.selected) {
      ctx.strokeStyle = this.style.selectedBorder;
      ctx.fillStyle = this.style.selectedBackground;
    } else {
      ctx.strokeStyle = this.style.border;
      ctx.fillStyle = this.style.background;
    }

    ctx.lineWidth = this.style.borderWidth;

    ctx.beginPath();
    ctx.roundRect(rect.x, rect.y, rect.width, rect.height, 8);
    ctx.fill();
    ctx.stroke();

    // Label with collapse indicator
    const label = `[−] ${String(this.props.id)}`;
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 12px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, rect.x + rect.width / 2, rect.y + rect.height / 2, rect.width - 16);
  }
}
