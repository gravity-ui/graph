import { batch, computed, signal } from "@preact/signals-core";

import { AnchorState } from "store/anchor/Anchor";

import { TAnchor } from "../../components/canvas/anchors";
import { TBlock, isTBlock } from "../../components/canvas/blocks/Block";
import { generateRandomId } from "../../components/canvas/blocks/generate";
import { Graph } from "../../graph";
import { ESelectionStrategy } from "../../utils/types/types";
import { selectConnectionsByBlockId } from "../connection/selectors";
import { RootStore } from "../index";

import { BlockState, TBlockId, mapToBlockId } from "./Block";

declare module "../../graphEvents" {
  interface GraphEventsDefinitions {
    /**
     *
     * Emited when selection of blocks changes.
     * Preventing the event will prevent selection change.
     *
     */
    "blocks-selection-change": (event: SelectionEvent<TBlockId>) => void;

    /**
     * Emited when selection of block's anchor changes.
     * Preventing the event will prevent selection change.
     *
     */
    "block-anchor-selection-change": (
      event: CustomEvent<{
        /** Block anchor */
        anchor: TAnchor;
        /** Is anchor selected */
        selected: boolean;
      }>
    ) => void;

    /**
     * Emited when block changes.
     *
     * Preventing the event will prevent block change.
     */
    "block-change": (
      event: CustomEvent<{
        /** Changed block */
        block: TBlock;
      }>
    ) => void;
  }
}

export class BlockListStore {
  public $blocksMap = signal<Map<BlockState["id"], BlockState>>(new Map());

  public $blocks = signal<BlockState[]>([]);

  /**
   * This signal is used to store blocks in reactive state.
   * this signal fired for each change of the block state.
   *
   * NOTE: Please do not use it before you know what you are doing.
   */
  public $blocksReactiveState = computed(() => {
    return Array.from(this.$blocksMap.value.values());
  });

  public $selectedBlocks = computed(() => {
    return this.$blocksReactiveState.value.filter((block) => block.selected);
  });

  public $selectedAnchor = computed(() => {
    if (!this.rootStore.settings.getConfigFlag("useBlocksAnchors")) return undefined;
    const block = this.$blocks.value.find((block) => {
      return Boolean(block.getSelectedAnchor());
    });
    if (block) {
      return block.getSelectedAnchor();
    }
    return undefined;
  });

  constructor(
    public rootStore: RootStore,
    protected graph: Graph
  ) {}

  public setAnchorSelection(blockId: BlockState["id"], anchorId: AnchorState["id"], selected: boolean) {
    const blockState = this.$blocksMap.value.get(blockId);
    if (!blockState) {
      return;
    }
    const anchor = blockState.getAnchorById(anchorId);
    if (!anchor) {
      return;
    }

    if (selected !== anchor.$selected.value) {
      this.graph.executеDefaultEventAction(
        "block-anchor-selection-change",
        { anchor: anchor.asTAnchor(), selected },
        () => {
          const currentSelected = this.$selectedAnchor.value;
          if (currentSelected && currentSelected !== anchor) {
            currentSelected.setSelection(false, true);
          }
          anchor.setSelection(selected, true);
        }
      );
    }
  }

  protected unsetAnchorsSelection() {
    this.$selectedAnchor.value?.setSelection(false);
  }

  public updatePosition(id: BlockState["id"], nextState: Pick<TBlock, "x" | "y">) {
    const blockState = this.$blocksMap.value.get(id);
    if (!blockState) {
      return;
    }
    this.graph.executеDefaultEventAction("block-change", { block: blockState.asTBlock() }, () => {
      blockState.updateBlock(nextState);
    });
  }

  protected setBlockSelection(
    block: BlockState | BlockState["id"],
    selected: boolean,
    params?: { ignoreChanges?: boolean }
  ): boolean {
    const blockState = block instanceof BlockState ? block : this.$blocksMap.value.get(block);
    if (!blockState) {
      return false;
    }
    if (selected !== Boolean(blockState.selected)) {
      if (!params?.ignoreChanges) {
        blockState.updateBlock({ selected });
      }
      return true;
    }
    return false;
  }

  protected updateBlocksMap(blocks: Map<BlockState["id"], BlockState> | [BlockState["id"], BlockState][]) {
    this.$blocksMap.value = new Map(blocks);
    this.$blocks.value = Array.from(this.$blocksMap.value.values());
  }

  public addBlock(block: Omit<TBlock, "id"> & { id?: TBlockId }) {
    const id = block.id || (generateRandomId("block") as TBlockId);

    this.$blocksMap.value.set(
      id,
      this.getOrCraeateBlockState({
        id,
        ...block,
      })
    );

    this.updateBlocksMap(this.$blocksMap.value);

    return id;
  }

  public deleteBlocks(blocks: (TBlock["id"] | TBlock)[]) {
    const map = new Map(this.$blocksMap.value);
    blocks.forEach((bId) => {
      const id = isTBlock(bId) ? bId.id : bId;
      const block = map.get(id);
      if (!block) {
        return;
      }
      map.delete(id);
    });
    this.updateBlocksMap(map);
  }

  public updateBlocks(blocks: TBlock[]) {
    this.updateBlocksMap(
      blocks.reduce((acc, block) => {
        const state = this.getOrCraeateBlockState(block);
        acc.set(block.id, state);
        return acc;
      }, this.$blocksMap.value)
    );
  }

  public setBlocks(blocks: TBlock[]) {
    const blockStates = blocks.map((block) => this.getOrCraeateBlockState(block));
    this.applyBlocksState(blockStates);
  }

  protected getOrCraeateBlockState(block: TBlock) {
    const blockState = this.$blocksMap.value.get(block.id);
    if (blockState) {
      blockState.updateBlock(block);
      return blockState;
    }
    return BlockState.fromTBlock(this, block);
  }

  protected applyBlocksState(blocks: BlockState[]) {
    this.updateBlocksMap(blocks.map((block) => [block.id, block]));
  }

  protected computeSelectionChange(
    ids: TBlockId[],
    selected: boolean,
    strategy: ESelectionStrategy = ESelectionStrategy.REPLACE
  ) {
    const list = new Set(this.$selectedBlocks.value);
    let add: Set<BlockState>;
    let removed: Set<BlockState>;

    if (!selected) {
      removed = new Set(
        this.getBlockStates(ids).filter((block: BlockState) => {
          if (this.setBlockSelection(block.id, false, { ignoreChanges: true })) {
            list.delete(block);
            return true;
          }
          return false;
        })
      );
    } else {
      if (strategy === ESelectionStrategy.REPLACE) {
        removed = new Set(
          this.$selectedBlocks.value.filter((block) => {
            return this.setBlockSelection(block.id, false, { ignoreChanges: true });
          })
        );
        list.clear();
      }
      add = new Set(
        this.getBlockStates(ids).filter((block: BlockState) => {
          if (
            this.setBlockSelection(block.id, true, { ignoreChanges: true }) ||
            strategy === ESelectionStrategy.REPLACE
          ) {
            removed?.delete(block);
            list.add(block);
            return true;
          }
          return false;
        })
      );
    }
    return { add: Array.from(add || []), removed: Array.from(removed || []), list: Array.from(list) };
  }

  public updateBlocksSelection(
    ids: TBlockId[],
    selected: boolean,
    strategy: ESelectionStrategy = ESelectionStrategy.REPLACE
  ) {
    const { add, removed, list } = this.computeSelectionChange(ids, selected, strategy);

    if (add.length || removed.length) {
      this.graph.executеDefaultEventAction(
        "blocks-selection-change",
        {
          list: list.map(mapToBlockId),
          changes: {
            add: add.map(mapToBlockId),
            removed: removed.map(mapToBlockId),
          },
        },
        () => {
          batch(() => {
            this.unsetAnchorsSelection();
            /**
             * Order is important here
             * If we first add and then remove, we will lose selection
             */
            removed.forEach((block) => {
              this.setBlockSelection(block.id, false);
            });
            add.forEach((block) => {
              this.setBlockSelection(block.id, true);
            });
          });
        }
      );
    }
  }

  public getBlockConnections(blockId: TBlockId) {
    return this.rootStore.connectionsList.$connections.value.filter((connection) =>
      [connection.targetBlockId, connection.sourceBlockId].includes(blockId)
    );
  }

  public resetSelection() {
    batch(() => {
      this.unsetAnchorsSelection();
      this.updateBlocksSelection(this.$selectedBlocks.value.map(mapToBlockId), false);
    });
  }

  public deleteSelectedBlocks() {
    const selectedBlocks = this.$selectedBlocks.value;
    selectedBlocks.forEach((block) => {
      this.deleteAllBlockConnections(block.id);
    });
    const newBlocks = this.$blocks.value.filter((block) => !selectedBlocks.includes(block));
    this.applyBlocksState(newBlocks);
  }

  public deleteAllBlockConnections(blockId: TBlockId) {
    const connections = selectConnectionsByBlockId(this.graph, blockId);
    this.rootStore.connectionsList.deleteConnections(connections);
  }

  public reset() {
    this.applyBlocksState([]);
  }

  public toJSON() {
    return this.$blocks.value.map((block) => block.asTBlock());
  }

  public getBlockState(id: TBlockId) {
    return this.$blocksMap.value.get(id);
  }

  public getBlock(id: TBlockId): TBlock | undefined {
    return this.getBlockState(id)?.asTBlock();
  }

  public getBlocks(ids: BlockState["id"][]) {
    return this.getBlockStates(ids);
  }

  public getBlockStates(ids: BlockState["id"][]) {
    return ids.map((id) => this.getBlockState(id)).filter(Boolean);
  }
}
