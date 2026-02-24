import type { Signal } from "@preact/signals-core";
import { computed, signal } from "@preact/signals-core";
import cloneDeep from "lodash/cloneDeep";

import { TAnchor } from "../../components/canvas/anchors";
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

  protected $rawState = signal<T>(undefined);

  /**
   * Block state signal
   *
   * @returns {ReadonlySignal<T>} Block state
   */
  public $state = computed(() => ({
    ...this.$rawState.value,
    selected: this.$selected.value,
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
    const typeIndex = {};
    return new Map(
      this.$anchorStates.value
        ?.sort((a, b) => (a.state.index || 0) - (b.state.index || 0))
        .map((anchorState) => {
          if (!typeIndex[anchorState.state.type]) {
            typeIndex[anchorState.state.type] = 0;
          }
          return [anchorState.id, typeIndex[anchorState.state.type]++];
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
   * Block selected anchors signal
   *
   * @returns {TAnchor[]} Block selected anchors
   */
  public $selectedAnchors = computed(() => {
    return (
      this.$anchorStates.value?.filter((anchorState) =>
        this.store.anchorSelectionBucket.$selected.value.has(anchorState.id)
      ) || []
    );
  });

  private blockView: Block;

  constructor(
    public readonly store: BlockListStore,
    block: T,
    private readonly blockSelectionBucket: ISelectionBucket<string | number>
  ) {
    this.$rawState.value = block;
    this.$anchorStates.value = block.anchors?.map((anchor) => new AnchorState(this, anchor)) ?? [];
  }

  public onAnchorSelected(anchorId: AnchorState["id"], selected: boolean) {
    this.store.setAnchorSelection(this.id, anchorId, selected);
  }

  public setSelection(selected: boolean, strategy: ESelectionStrategy = ESelectionStrategy.REPLACE) {
    this.store.updateBlocksSelection([this.id], selected, strategy);
  }

  public getSelectedAnchor() {
    return this.$selectedAnchors.value[0];
  }

  public getAnchorState(id: AnchorState["id"]) {
    return this.$anchorStates.value.find((state) => state.id === id);
  }

  public updateXY(x: number, y: number, forceUpdate = false) {
    this.store.updatePosition(this.id, { x, y });
    if (forceUpdate) {
      this.blockView.updatePosition(x, y, true);
    }
  }

  public setViewComponent(blockComponent: Block) {
    this.blockView = blockComponent;
  }

  public getViewComponent() {
    return this.blockView;
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
      if (anchorsMap.has(anchor.id)) {
        const anchorState = anchorsMap.get(anchor.id);
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
  public updateBlock(block: Partial<TBlock>): void {
    // Update anchors first to ensure they have correct state when geometry changes
    if (block.anchors) {
      this.updateAnchors(block.anchors);
    }

    this.$rawState.value = Object.assign({}, this.$rawState.value, block);
    this.getViewComponent()?.updateHitBox(this.$geometry.value, true);
  }

  public getAnchorById(anchorId: string) {
    return this.$anchorStates.value.find((anchor) => anchor.id === anchorId);
  }

  /**
   * Converts the block state to a TBlock
   *
   * @returns {TBlock} TBlock
   */
  public asTBlock(): TBlock {
    return cloneDeep({
      ...this.$rawState.toJSON(),
      selected: this.$selected.value,
    });
  }
}
