import { signal, computed, type Signal } from "@preact/signals-core";
import { BlockListStore } from "./BlocksList";
import { Block, TBlock } from "../../components/canvas/blocks/Block";
import { AnchorState } from "../anchor/Anchor";
import { ESelectionStrategy } from "../../utils/types/types";

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

  public $anchors = computed(() => {
    return this.$anchorStates.value?.map((anchorState) => anchorState.asTAnchor()) || [];
  });

  public $selectedAnchors = computed(() => {
    return this.$anchorStates.value?.filter((anchorState) => anchorState.$selected.value) || [];
  });

  private blockView: Block;

  public readonly dispose;

  public constructor(
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

  public updateXY(x: number, y: number) {
    this.store.updatePosition(this.id, { x, y });
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

  public $geometry = computed(() => {
    const state = this.$state.value;
    return {
      x: state.x | 0,
      y: state.y | 0,
      width: state.width,
      height: state.height,
    };
  });

  public updateBlock(block: Partial<TBlock>): void {
    this.$state.value = Object.assign({}, this.$state.value, block);
    this.getViewComponent()?.updateHitBox(this.$geometry.value, true);
  }

  public getAnchorById(anchorId: string) {
    return this.$anchorStates.value.find((anchor) => anchor.id === anchorId);
  }

  public asTBlock(): TBlock {
    return this.$state.value;
  }
}

export function mapToTBlock(blockState: BlockState) {
  return blockState.asTBlock();
}
export function mapToBlockId(blockState: BlockState) {
  return blockState.id;
}
