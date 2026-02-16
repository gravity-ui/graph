import { batch, computed, signal } from "@preact/signals-core";

import { AnchorState } from "../anchor/Anchor";

import { TAnchor, TAnchorId } from "../../components/canvas/anchors";
import { Block, TBlock, isTBlock } from "../../components/canvas/blocks/Block";
import { generateRandomId } from "../../components/canvas/blocks/generate";
import { Graph } from "../../graph";
import { MultipleSelectionBucket } from "../../services/selection/MultipleSelectionBucket";
import { SingleSelectionBucket } from "../../services/selection/SingleSelectionBucket";
import { ESelectionStrategy } from "../../services/selection/types";
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

/**
 * Storage for managing blocks state
 */
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
   * Resolves IDs to BlockState instances (not GraphComponent)
   */
  public readonly blockSelectionBucket: MultipleSelectionBucket<TBlockId, BlockState>;

  /**
   * Computed signal that returns selected blocks as Block GraphComponent instances
   * Automatically resolves BlockState to Block components via getViewComponent()
   * Use this when you need to work with rendered Block components
   */
  public $selectedBlockComponents = computed(() => {
    // Use the built-in $selectedComponents from BaseSelectionBucket
    return this.blockSelectionBucket.$selectedComponents.value as Block[];
  });

  public readonly anchorSelectionBucket: SingleSelectionBucket<TAnchorId, AnchorState>;

  /**
   * @deprecated Use blockSelectionBucket.$selectedEntities instead
   * Computed signal that returns the currently selected blocks
   */
  public $selectedBlocks = computed(() => {
    return this.blockSelectionBucket.$selectedEntities.value;
  });

  /**
   * @deprecated Use anchorSelectionBucket.$selectedEntities instead
   * Computed signal that returns the currently selected anchor
   */
  public $selectedAnchor = computed(() => {
    const entities = this.anchorSelectionBucket.$selectedEntities.value;
    return entities.length > 0 ? entities[0] : undefined;
  });

  constructor(
    public rootStore: RootStore,
    protected graph: Graph
  ) {
    this.blockSelectionBucket = new MultipleSelectionBucket<TBlockId, BlockState>(
      "block",
      (payload, defaultAction) => {
        return this.graph.executеDefaultEventAction("blocks-selection-change", payload, defaultAction);
      },
      (element) => element instanceof Block,
      (ids) => ids.map((id) => this.getBlockState(id)).filter((block): block is BlockState => block !== undefined)
    );

    this.anchorSelectionBucket = new SingleSelectionBucket<TAnchorId, AnchorState>(
      "anchor",
      (diff, defaultAction) => {
        if (diff.changes.add.length > 0) {
          const anchorId = diff.changes.add[0];
          const anchor = this.$blocks.value
            .flatMap((block) => block.$anchorStates.value)
            .find((a) => a.id === anchorId);
          if (anchor) {
            return this.graph.executеDefaultEventAction(
              "block-anchor-selection-change",
              { anchor: anchor.asTAnchor(), selected: true },
              defaultAction
            );
          }
        }
        if (diff.changes.removed.length > 0) {
          const anchorId = diff.changes.removed[0];
          const anchor = this.$blocks.value
            .flatMap((block) => block.$anchorStates.value)
            .find((a) => a.id === anchorId);
          if (anchor) {
            return this.graph.executеDefaultEventAction(
              "block-anchor-selection-change",
              { anchor: anchor.asTAnchor(), selected: false },
              defaultAction
            );
          }
        }
        return defaultAction();
      },
      undefined,
      (ids) => {
        if (!this.rootStore.settings.getConfigFlag("useBlocksAnchors")) return [];
        const result: AnchorState[] = [];
        for (const block of this.$blocks.value) {
          for (const anchor of block.$anchorStates.value) {
            if (ids.includes(anchor.id)) {
              result.push(anchor);
            }
          }
        }
        return result;
      }
    );

    this.blockSelectionBucket.attachToManager(this.rootStore.selectionService);
    this.anchorSelectionBucket.attachToManager(this.rootStore.selectionService);
  }

  /**
   * Sets anchor selection
   *
   * @param blockId {BlockState["id"]} Block id
   * @param anchorId {AnchorState["id"]} Anchor id
   * @param selected {boolean} Selected
   * @returns void
   */
  public setAnchorSelection(blockId: BlockState["id"], anchorId: AnchorState["id"], selected: boolean) {
    const blockState = this.$blocksMap.value.get(blockId);
    if (!blockState) {
      return;
    }
    const anchor = blockState.getAnchorById(anchorId);
    if (!anchor) {
      return;
    }

    if (selected) {
      this.anchorSelectionBucket.select([anchorId], ESelectionStrategy.REPLACE);
    } else {
      this.anchorSelectionBucket.deselect([anchorId]);
    }
  }

  /**
   * Checks if a block is selected
   *
   * @param blockId {BlockState["id"]} Block id
   * @returns {boolean} Is selected
   */
  public isSelectedBlock(blockId: BlockState["id"]): boolean {
    return this.blockSelectionBucket.$selected.value.has(blockId);
  }

  protected unsetAnchorsSelection() {
    this.anchorSelectionBucket.reset();
  }

  /**
   * Updates block position
   *
   * @event block-change
   * @param id {BlockState["id"]} Block id
   * @param nextState {{x: number, y: number}} Next state
   * @returns void
   */
  public updatePosition(id: BlockState["id"], nextState: Pick<TBlock, "x" | "y">) {
    const blockState = this.$blocksMap.value.get(id);
    if (!blockState) {
      return;
    }
    this.graph.executеDefaultEventAction("block-change", { block: blockState.asTBlock() }, () => {
      blockState.updateBlock(nextState);
    });
  }

  protected updateBlocksMap(blocks: Map<BlockState["id"], BlockState> | [BlockState["id"], BlockState][]) {
    this.$blocksMap.value = new Map(blocks);
    this.$blocks.value = Array.from(this.$blocksMap.value.values());
  }

  /**
   * Adds block
   *
   * If a block with this id already exists, it will be updated.
   * If id is not provided, a random id will be generated.
   *
   * @param block {Omit<TBlock, "id"> & { id?: TBlockId }} Block to add
   * @returns void
   */
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

  /**
   * Deletes blocks
   *
   * @param blocks {TBlock["id"] | TBlock} Blocks to delete
   * @returns void
   */
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

  /**
   * Updates blocks state
   *
   * If block with this id already exists, it will be updated.
   * Otherwise, a new block will be created.
   *
   * @param blocks {TBlock[]} Blocks to update
   * @returns void
   */
  public updateBlocks(blocks: TBlock[]) {
    this.updateBlocksMap(
      blocks.reduce((acc, block) => {
        const state = this.getOrCraeateBlockState(block);
        acc.set(block.id, state);
        return acc;
      }, this.$blocksMap.value)
    );
  }

  /**
   * Sets blocks state
   *
   * @param blocks {TBlock[]} Blocks to set
   * @returns void
   */
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
   *
   * @param ids Block IDs to update selection for
   * @param selected Whether to select or deselect
   * @param strategy The selection strategy to apply
   *
   * @returns void
   */
  public updateBlocksSelection(
    ids: TBlockId[],
    selected: boolean,
    strategy: ESelectionStrategy = ESelectionStrategy.REPLACE
  ) {
    if (selected) {
      this.blockSelectionBucket.select(ids, strategy);
    } else {
      this.blockSelectionBucket.deselect(ids);
    }
  }

  /**
   * Gets connections of a block
   *
   * Method search connection with source/target block id.
   * If you connect blocks via custom ports, this method will not work.
   *
   * @param blockId {TBlockId} Block id
   * @returns {ConnectionState[]} Connections
   */
  public getBlockConnections(blockId: TBlockId) {
    return this.rootStore.connectionsList.$connections.value.filter((connection) =>
      [connection.targetBlockId, connection.sourceBlockId].includes(blockId)
    );
  }

  /**
   * Resets block selection
   *
   * @returns void
   */
  public resetSelection() {
    batch(() => {
      this.unsetAnchorsSelection();
      this.blockSelectionBucket.reset();
    });
  }

  /**
   * Deletes selected blocks
   *
   * @returns void
   */
  public deleteSelectedBlocks() {
    const selectedBlocks = this.$selectedBlocks.value;
    selectedBlocks.forEach((block) => {
      this.deleteAllBlockConnections(block.id);
    });
    const newBlocks = this.$blocks.value.filter((block) => !selectedBlocks.includes(block));
    this.applyBlocksState(newBlocks);
  }

  /**
   * Deletes all connections of a block
   *
   * Method search connection with source/target block id.
   * If you connect blocks via custom ports, this method will not work.
   *
   * @param blockId {TBlockId} Block id
   * @returns void
   */
  public deleteAllBlockConnections(blockId: TBlockId) {
    const connections = this.getBlockConnections(blockId);
    this.rootStore.connectionsList.deleteConnections(connections);
  }

  public reset() {
    this.applyBlocksState([]);
  }

  /**
   * Gets blocks as JSON
   *
   * @returns {TBlock[]} Blocks
   */
  public toJSON() {
    return this.$blocks.value.map((block) => block.asTBlock());
  }

  /**
   * Gets block state by id
   *
   * @param id {TBlockId} Block id
   * @returns {BlockState | undefined} Block state
   */
  public getBlockState(id: TBlockId) {
    return this.$blocksMap.value.get(id);
  }

  /**
   * Gets block by id
   *
   * @param id {TBlockId} Block id
   * @returns {TBlock | undefined} Block
   */
  public getBlock(id: TBlockId): TBlock | undefined {
    return this.getBlockState(id)?.asTBlock();
  }

  /**
   * Gets blocks by ids
   *
   * If block with this id does not exist, it will filtered out.
   *
   * @param ids {BlockState["id"][]} Block ids
   * @returns {TBlock[]} Blocks
   */
  public getBlocks(ids: BlockState["id"][]) {
    return this.getBlockStates(ids).map((block) => block.asTBlock());
  }

  /**
   * Gets block states by ids
   *
   * If block with this id does not exist, it will filtered out.
   *
   * @param ids {BlockState["id"][]} Block ids
   * @returns {BlockState[]} Block states
   */
  public getBlockStates(ids: BlockState["id"][]) {
    return ids.map((id) => this.getBlockState(id)).filter((block): block is BlockState => block !== undefined);
  }
}
