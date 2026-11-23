import type { Signal } from "@preact/signals-core";
import { batch, computed, signal } from "@preact/signals-core";
import cloneDeep from "lodash/cloneDeep";

import { TAnchor, TAnchorId } from "../../components/canvas/anchors";
import { Block, TBlock } from "../../components/canvas/blocks/Block";
import { ESelectionStrategy, ISelectionBucket } from "../../services/selection/types";
import { AnchorState } from "../anchor/Anchor";

import { BlockListStore } from "./BlocksList";

export type TBlockId = string | number;

export const IS_BLOCK_TYPE = "Block" as const;

export class BlockState<T extends TBlock = TBlock> {
  public static fromTBlock(store: BlockListStore, block: TBlock): BlockState<TBlock> {
    return new BlockState(store, block, store.blockSelectionBucket);
  }

  protected $rawState: Signal<T>;

  /**
   * Block state signal
   *
   * @returns {ReadonlySignal<T>} Block state
   */
  public $state = computed(() => ({
    ...this.$rawState.value,
  }));

  /**
   * Block id
   */
  public get id() {
    return this.$state.value.id;
  }

  /**
   * Block x position
   */
  public get x() {
    return this.$state.value.x;
  }

  /**
   * Block y position
   */
  public get y() {
    return this.$state.value.y;
  }

  /**
   * Block width
   */
  public get width() {
    return this.$state.value.width;
  }

  /**
   * Block height
   */
  public get height() {
    return this.$state.value.height;
  }

  /**
   * Block selected
   */
  public get selected() {
    return this.$selected.value;
  }

  /**
   * Computed signal that reactively determines if this block is selected
   * by checking if its ID exists in the selection bucket
   */
  public readonly $selected = computed(() => this.blockSelectionBucket.isSelected(this.$rawState.value.id));

  public readonly $anchorStates: Signal<AnchorState[]> = signal([]);

  /**
   * Block geometry signal
   *
   * Pay attention!! x and y are rounded to integer
   *
   * @returns {ReadonlySignal<{x: number, y: number, width: number, height: number}>} Block geometry
   */
  public readonly $geometry = computed(() => {
    const state = this.$state.value;
    return {
      x: state.x | 0,
      y: state.y | 0,
      width: state.width,
      height: state.height,
    };
  });

  /**
   * Block anchor indexes signal
   *
   * @returns {ReadonlySignal<Map<string, number>>} Block anchor indexes
   */
  public $anchorIndexs = computed(() => {
    const typeIndex = new Map<string, number>();
    return new Map(
      this.$anchorStates.value
        ?.sort((a, b) => (a.state.index || 0) - (b.state.index || 0))
        .map((anchorState) => {
          const type = anchorState.state.type;
          const index = typeIndex.get(type) ?? 0;
          typeIndex.set(type, index + 1);
          return [anchorState.id, index];
        }) || []
    );
  });

  /**
   * Block anchors signal
   *
   * @returns {ReadonlySignal<TAnchor[]>} Block anchors
   */
  public $anchors = computed(() => {
    return this.$anchorStates.value?.map((anchorState) => anchorState.asTAnchor()) || [];
  });

  /**
   * The selected anchors of this block (the anchor selection bucket holds block-qualified ids, see `anchorEntityId`)
   *
   * @returns {AnchorState[]} Block selected anchors
   */
  public $selectedAnchors = computed(() => {
    const selected = this.store.anchorSelectionBucket.$selected.value;
    return this.$anchorStates.value?.filter((anchorState) => selected.has(anchorState.entityId)) || [];
  });

  public readonly $viewComponent = signal<Block | undefined>(undefined);

  private pendingHidden?: boolean;

  /** Reactive flag that mirrors the canvas component's hidden state. */
  public readonly $hidden = signal<boolean>(false);

  constructor(
    public readonly store: BlockListStore,
    block: T,
    private readonly blockSelectionBucket: ISelectionBucket<string | number>
  ) {
    this.$rawState = signal(block);
    this.$anchorStates.value = block.anchors?.map((anchor) => new AnchorState(this, anchor)) ?? [];
  }

  public onAnchorSelected(anchorId: AnchorState["id"], selected: boolean) {
    if (!this.isAttached()) return;
    this.store.setAnchorSelection(this.id, anchorId, selected);
  }

  /** Whether this state is still the entity registered under its ID. */
  public isAttached(): boolean {
    return this.store.getBlockState(this.id) === this;
  }

  public setSelection(selected: boolean, strategy: ESelectionStrategy = ESelectionStrategy.REPLACE) {
    if (!this.isAttached()) return;
    this.store.updateBlocksSelection([this.id], selected, strategy);
  }

  public getSelectedAnchor(): AnchorState | undefined {
    return this.$selectedAnchors.value[0];
  }

  public getAnchorState(id: AnchorState["id"]) {
    return this.$anchorStates.value.find((state) => state.id === id);
  }

  public updateXY(x: number, y: number, forceUpdate = false) {
    if (!this.isAttached()) return;
    this.store.updatePosition(this.id, { x, y });
    if (forceUpdate) {
      this.$viewComponent.value?.updatePosition(x, y, true);
    }
  }

  public setViewComponent(blockComponent: Block): void {
    this.$viewComponent.value = blockComponent;
    if (this.pendingHidden !== undefined) {
      blockComponent.setHiddenBlock(this.pendingHidden);
      this.pendingHidden = undefined;
    }
  }

  /**
   * The block's component no longer shows this state: the block was removed and added back with its id before a
   * frame, and its kept component bound to the new state. This state then names no component.
   */
  public unsetViewComponent(): void {
    this.$viewComponent.value = undefined;
  }

  /**
   * Request to hide or show this block's canvas component.
   * Safe to call before the canvas component is mounted — the request is
   * deferred and applied automatically in setViewComponent().
   */
  public requestHidden(hidden: boolean): void {
    this.$hidden.value = hidden;
    const canvasBlock = this.getViewComponent();
    if (canvasBlock) {
      canvasBlock.setHiddenBlock(hidden);
    } else {
      this.pendingHidden = hidden;
    }
  }

  public getViewComponent(): Block | undefined {
    return this.$viewComponent.value;
  }

  public getConnections() {
    return this.store.getBlockConnections(this.id);
  }

  public clearAnchorsSelection() {
    this.store.anchorSelectionBucket.reset();
  }

  public setName(newName: string) {
    this.$rawState.value = {
      ...this.$rawState.value,
      name: newName,
    };
  }

  public updateAnchors(anchors: TAnchor[]) {
    const anchorsMap = new Map(this.$anchorStates.value.map((a) => [a.id, a]));
    this.$anchorStates.value = anchors.map((anchor) => {
      const anchorState = anchorsMap.get(anchor.id);
      if (anchorState) {
        anchorState.update(anchor);
        return anchorState;
      }
      return new AnchorState(this, anchor);
    });
  }

  /**
   * Updates block state
   *
   * @param block {Partial<TBlock>} Block to update
   * @returns void
   */
  public updateBlock(block: Partial<T>): void {
    // Update anchors first to ensure they have correct state when geometry changes
    if (block.anchors) this.updateAnchors(block.anchors);
    const previous = this.$rawState.value;
    this.applyBlock(Object.assign({}, previous, block, { id: previous.id }));
  }

  /** @internal Replaces the data of a retained block when applying a complete snapshot. */
  public replaceBlock(block: T): void {
    this.getViewComponent()?.clearRemovedData(this.$state.peek(), block);
    if (block.anchors || this.$anchorStates.peek().length) this.updateAnchors(block.anchors ?? []);
    this.applyBlock({ ...block, id: this.$rawState.value.id });
  }

  private applyBlock(next: T): void {
    const previous = this.$rawState.peek();
    if (next.is !== previous.is) this.store.noteViewClassChange();
    if (next.group !== previous.group && this.isAttached()) {
      batch(() => {
        this.$rawState.value = next;
        this.store.noteGroupChange();
      });
    } else {
      this.$rawState.value = next;
    }
    this.getViewComponent()?.updateHitBox(this.$geometry.value, true);
  }

  /** The anchor state of an anchor id; data read from JSON can carry number anchor ids (`TAnchorId`). */
  public getAnchorById(anchorId: TAnchorId): AnchorState | undefined {
    return this.$anchorStates.value.find((anchor) => anchor.id === anchorId);
  }

  /**
   * Converts the block state to a TBlock
   *
   * @returns {TBlock} TBlock
   */
  public asTBlock(): T {
    return cloneDeep({
      ...this.$rawState.toJSON(),
    });
  }

  /**
   * Cheap snapshot for graph events (e.g. `block-change`): one object spread, no deep clone.
   * Nested values (`anchors`, `meta`, `settings`, …) are shared with the live store — treat as read-only.
   */
  public asTBlockShallow(): Readonly<T> {
    return {
      ...this.$rawState.value,
    };
  }
}
