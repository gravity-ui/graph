import type { Signal } from "@preact/signals-core";
import { computed, signal } from "@preact/signals-core";
import cloneDeep from "lodash/cloneDeep";

import { TAnchor } from "../../components/canvas/anchors";
import { Block, TBlock } from "../../components/canvas/blocks/Block";
import { ESelectionStrategy } from "../../utils/types/types";
import { AnchorState } from "../anchor/Anchor";

import { BlockListStore } from "./BlocksList";

export type TBlockId = string | number | symbol;

export const IS_BLOCK_TYPE = "Block" as const;

export class BlockState<T extends TBlock = TBlock> {
  public static fromTBlock(store: BlockListStore, block: TBlock): BlockState<TBlock> {
    return new BlockState(store, block);
  }

  public $state = signal<T>(undefined);

  public get id() {
    return this.$state.value.id;
  }
  public get x() {
    return this.$state.value.x;
  }
  public get y() {
    return this.$state.value.y;
  }

  public get width() {
    return this.$state.value.width;
  }

  public get height() {
    return this.$state.value.height;
  }

  public get selected() {
    return this.$state.value.selected;
  }

  public readonly $anchorStates: Signal<AnchorState[]> = signal([]);

  public readonly $geometry = computed(() => {
    const state = this.$state.value;
    return {
      x: state.x | 0,
      y: state.y | 0,
      width: state.width,
      height: state.height,
    };
  });

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

  public $anchors = computed(() => {
    return this.$anchorStates.value?.map((anchorState) => anchorState.asTAnchor()) || [];
  });

  public $selectedAnchors = computed(() => {
    return this.$anchorStates.value?.filter((anchorState) => anchorState.$selected.value) || [];
  });

  private blockView: Block;

  constructor(
    public readonly store: BlockListStore,
    block: T
  ) {
    this.$state.value = block;

    this.$anchorStates.value = block.anchors?.map((anchor) => new AnchorState(this, anchor)) ?? [];
  }

  public onAnchorSelected(anchorId: AnchorState["id"], selected: boolean) {
    this.store.setAnchorSelection(this.id, anchorId, selected);
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

  public setSelection(selected: boolean, strategy: ESelectionStrategy = ESelectionStrategy.REPLACE) {
    this.store.updateBlocksSelection([this.id], selected, strategy);
  }

  public clearAnchorsSelection() {
    this.$anchorStates.value.forEach((anchor) => anchor.setSelection(false));
  }

  public setName(newName: string) {
    this.$state.value.name = newName;
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

  public updateBlock(block: Partial<TBlock>): void {
    // Update anchors first to ensure they have correct state when geometry changes
    if (block.anchors) {
      this.updateAnchors(block.anchors);
    }

    this.$state.value = Object.assign({}, this.$state.value, block);
    this.getViewComponent()?.updateHitBox(this.$geometry.value, true);
  }

  public getAnchorById(anchorId: string) {
    return this.$anchorStates.value.find((anchor) => anchor.id === anchorId);
  }

  public asTBlock(): TBlock {
    return cloneDeep(this.$state.toJSON());
  }
}

export function mapToTBlock(blockState: BlockState) {
  return blockState.asTBlock();
}
export function mapToBlockId(blockState: BlockState) {
  return blockState.id;
}
