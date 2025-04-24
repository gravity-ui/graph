import { batch, computed, effect, signal } from "@preact/signals-core";
import throttle from "lodash/throttle";

import { AnchorState } from "store/anchor/Anchor";

import { TAnchor } from "../../components/canvas/anchors";
import { TBlock, isTBlock } from "../../components/canvas/blocks/Block";
import { generateRandomId } from "../../components/canvas/blocks/generate";
import { Graph } from "../../graph";
import { MultipleSelectionBucket } from "../../services/selection/MultipleSelectionBucket";
import { ESelectionStrategy, ISelectionBucket } from "../../services/selection/types";
import { getUsableRectByBlockIds } from "../../utils/functions";
import { TRect } from "../../utils/types/shapes";
import { selectConnectionsByBlockId } from "../connection/selectors";
import { RootStore } from "../index";

import { BlockState, TBlockId } from "./Block";

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

  /**
   * Bucket for managing block selection state
   */
  public readonly blockSelectionBucket: ISelectionBucket<string | number>;

  /**
   * Computed signal that returns the currently selected blocks
   */
  public $selectedBlocks = computed(() => {
    const selectedIds = this.blockSelectionBucket.$selectedIds.value;
    return this.$blocksReactiveState.value.filter((block) => {
      // Only string and number IDs are supported in the selection bucket
      const id = block.id;
      return typeof id === "string" || typeof id === "number" ? selectedIds.has(id) : false;
    });
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

  protected isDirtyRect = true;

  public $usableRect = signal<TRect>({ x: 0, y: 0, height: 0, width: 0 });

  constructor(
    public rootStore: RootStore,
    protected graph: Graph
  ) {
    // Create and register a selection bucket for blocks
    this.blockSelectionBucket = new MultipleSelectionBucket<string | number>(graph, "block", "blocks-selection-change");

    this.rootStore.selectionService.registerBucket(this.blockSelectionBucket);

    effect(() => {
      this.recalcUsableRect();
    });
  }

  /*
   * Returns usable rectangles with guaranteed that the rectangle is calculated.
   *
   * This method is useful because the usable rectangle is automatically recalculated by throttling with 50ms delay,
   * so sometimes the usable rectangle might not be accurate.
   */
  public getUsableRect() {
    if (this.isDirtyRect || (this.$usableRect.value.x === 0 && this.$usableRect.value.width === 0)) {
      this.forceRecalcUsableRect();
    }
    return this.$usableRect.value;
  }

  protected forceRecalcUsableRect(blocks = this.$blocks.value) {
    this.recalcUsableRect.cancel();
    this.$usableRect.value = blocks.length ? getUsableRectByBlockIds(blocks) : { x: 0, y: 0, height: 0, width: 0 };
    this.isDirtyRect = false;
  }

  protected recalcUsableRect = throttle((blocks = this.$blocks.value) => {
    this.forceRecalcUsableRect(blocks);
  }, 50);

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
      batch(() => {
        blockState.updateBlock(nextState);
        this.isDirtyRect = true;
        this.recalcUsableRect(this.$blocks.value);
      });
    });
  }

  protected updateBlocksMap(blocks: Map<BlockState["id"], BlockState> | [BlockState["id"], BlockState][]) {
    this.$blocksMap.value = new Map(blocks);
    this.$blocks.value = Array.from(this.$blocksMap.value.values());
    this.isDirtyRect = true;
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

  /**
   * Updates block selection using the SelectionService
   * @param ids Block IDs to update selection for
   * @param selected Whether to select or deselect
   * @param strategy The selection strategy to apply
   */
  public updateBlocksSelection(
    ids: TBlockId[],
    selected: boolean,
    strategy: ESelectionStrategy = ESelectionStrategy.REPLACE
  ) {
    console.log("select", ids, selected, strategy);
    // Filter out symbol ids since SelectionService only supports string and number ids
    const validIds = ids.filter((id) => typeof id === "string" || typeof id === "number") as (string | number)[];

    batch(() => {
      this.unsetAnchorsSelection();

      if (selected) {
        this.rootStore.selectionService.select("block", validIds, strategy);
      } else {
        this.rootStore.selectionService.deselect("block", validIds);
      }
    });
  }

  public getBlockConnections(blockId: TBlockId) {
    return this.rootStore.connectionsList.$connections.value.filter((connection) =>
      [connection.targetBlockId, connection.sourceBlockId].includes(blockId)
    );
  }

  public resetSelection() {
    batch(() => {
      this.unsetAnchorsSelection();
      this.rootStore.selectionService.resetSelection("block");
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
