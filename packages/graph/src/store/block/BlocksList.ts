import { batch, computed, signal } from "@preact/signals-core";

import { TAnchor } from "../../components/canvas/anchors";
import { Block, TBlock, isTBlock } from "../../components/canvas/blocks/Block";
import { Graph } from "../../graph";
import { MultipleSelectionBucket } from "../../services/selection/MultipleSelectionBucket";
import { SingleSelectionBucket } from "../../services/selection/SingleSelectionBucket";
import { ESelectionStrategy } from "../../services/selection/types";
import { generateRandomId } from "../../utils/functions/generateRandomId";
import { AnchorState } from "../anchor/Anchor";
import { parseAnchorEntityId } from "../anchor/anchorEntityId";
import { RootStore } from "../index";

import { BlockState, TBlockId } from "./Block";

/** Lightweight block bounds for the `blocks-geometry-change` event. */
export type TBlockGeometrySnapshot = {
  id: TBlockId;
  x: number;
  y: number;
  width: number;
  height: number;
};

declare module "../../graphEvents" {
  interface GraphEventsDefinitions {
    /**
     *
     * Emitted when selection of blocks changes.
     * Preventing the event will prevent selection change.
     *
     */
    "blocks-selection-change": (event: SelectionEvent<TBlockId>) => void;

    /**
     * Emitted when selection of block's anchor changes.
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
     * Emitted when block position is about to update via {@link BlockListStore.updatePosition}.
     *
     * `detail.block` is a shallow snapshot (see {@link BlockState.asTBlockShallow}); do not mutate nested fields.
     * Preventing the event skips the store update and excludes the block from the next `blocks-geometry-change` batch.
     */
    "block-change": (
      event: CustomEvent<{
        /** Shallow snapshot; nested fields are shared with the store — read-only. */
        block: Readonly<TBlock>;
      }>
    ) => void;

    /**
     * Coalesced geometry updates after {@link BlockListStore.updatePosition} (at most once per animation frame).
     * Payload is `{ id, x, y, width, height }` per block only.
     */
    "blocks-geometry-change": (
      event: CustomEvent<{
        blocks: TBlockGeometrySnapshot[];
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

  /** @internal A publication that needs to reconcile block views. */
  public readonly $viewRevision = signal(0);

  private viewClassChanged = false;

  private batchedGeometryPending = new Map<BlockState["id"], { state: BlockState; geometry: TBlockGeometrySnapshot }>();

  private batchedGeometryRaf: number | null = null;

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

  /**
   * Bucket for anchor selection. Anchor ids are unique only within their block, so it holds block-qualified ids:
   * `anchorEntityId(blockId, anchorId)` (read one back with `parseAnchorEntityId`).
   */
  public readonly anchorSelectionBucket: SingleSelectionBucket<string, AnchorState>;

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

    this.anchorSelectionBucket = new SingleSelectionBucket<string, AnchorState>(
      "anchor",
      (diff, defaultAction) => {
        if (diff.changes.add.length > 0) {
          const anchor = this.getAnchorStateByEntityId(diff.changes.add[0]);
          if (anchor) {
            return this.graph.executеDefaultEventAction(
              "block-anchor-selection-change",
              { anchor: anchor.asTAnchor(), selected: true },
              defaultAction
            );
          }
        }
        if (diff.changes.removed.length > 0) {
          const anchor = this.getAnchorStateByEntityId(diff.changes.removed[0]);
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
        return ids
          .map((id) => this.getAnchorStateByEntityId(id))
          .filter((anchor): anchor is AnchorState => anchor !== undefined);
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
      this.anchorSelectionBucket.select([anchor.entityId], ESelectionStrategy.REPLACE);
    } else {
      this.anchorSelectionBucket.deselect([anchor.entityId]);
    }
  }

  /** The anchor state an anchor entity id names (see `anchorEntityId`); undefined for a missing block or anchor. */
  private getAnchorStateByEntityId(entityId: string): AnchorState | undefined {
    const address = parseAnchorEntityId(entityId);
    return address ? this.getBlockState(address.blockId)?.getAnchorById(address.anchorId) : undefined;
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

    this.graph.executеDefaultEventAction("block-change", { block: blockState.asTBlockShallow() }, () => {
      if (!blockState.isAttached()) return;
      blockState.updateBlock(nextState);
      const geometry = blockState.$geometry.value;
      this.batchedGeometryPending.set(id, { state: blockState, geometry: { id, ...geometry } });
      this.scheduleBatchedBlocksGeometryFlush();
    });
  }

  /**
   * Flushes pending `blocks-geometry-change` immediately (cancels a scheduled rAF if any).
   * Called when a graph drag ends so the last frame is not lost.
   */
  public flushBatchedBlocksGeometryEmit(): void {
    this.clearGeometryRaf();
    this.emitPendingBlocksGeometry();
  }

  private scheduleBatchedBlocksGeometryFlush(): void {
    if (this.batchedGeometryRaf !== null) {
      return;
    }
    this.batchedGeometryRaf = requestAnimationFrame(() => {
      this.batchedGeometryRaf = null;
      this.emitPendingBlocksGeometry();
    });
  }

  private clearGeometryRaf(): void {
    if (this.batchedGeometryRaf !== null) {
      cancelAnimationFrame(this.batchedGeometryRaf);
      this.batchedGeometryRaf = null;
    }
  }

  private emitPendingBlocksGeometry(): void {
    if (this.batchedGeometryPending.size === 0) {
      return;
    }
    const blocks = Array.from(this.batchedGeometryPending.values())
      .filter(({ state }) => state.isAttached())
      .map(({ geometry }) => geometry);
    this.batchedGeometryPending.clear();
    if (blocks.length) this.graph.emit("blocks-geometry-change", { blocks });
  }

  private cancelBatchedBlocksGeometry(): void {
    this.clearGeometryRaf();
    this.batchedGeometryPending.clear();
  }

  /** @internal A class changed in block data. Reconcile it on the next list publication. */
  public noteViewClassChange(): void {
    this.viewClassChanged = true;
  }

  protected updateBlocksMap(
    blocks: Map<BlockState["id"], BlockState> | [BlockState["id"], BlockState][],
    reconcileViews = true
  ) {
    const updateViews = reconcileViews || this.viewClassChanged;
    this.viewClassChanged = false;
    this.$blocksMap.value = new Map(blocks);
    this.$blocks.value = Array.from(this.$blocksMap.value.values());
    if (updateViews) this.$viewRevision.value = this.$viewRevision.peek() + 1;
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
    const id = block.id ?? generateRandomId("block");

    this.$blocksMap.value.set(
      id,
      this.getOrCraeateBlockState({
        ...block,
        id,
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
    const map = this.$blocksMap.value;
    let reconcileViews = blocks.length === 0;
    blocks.forEach((block) => {
      const state = this.getOrCraeateBlockState(block);
      const id = block.id;
      if (map.get(id) !== state) {
        map.set(id, state);
        reconcileViews = true;
      }
      // A failed constructor can mount again once its row is corrected.
      reconcileViews ||= !state.getViewComponent()?.isMounted();
    });
    this.updateBlocksMap(map, reconcileViews);
  }

  /**
   * Sets blocks state
   *
   * @param blocks {TBlock[]} Blocks to set
   * @returns void
   */
  public setBlocks(blocks: TBlock[]) {
    const blockStates = blocks.map((block) => this.getOrCraeateBlockState(block, "replace"));
    this.applyBlocksState(blockStates);
    // A snapshot can supersede a drag before its coalesced geometry event runs.
    for (const [id, { state, geometry }] of this.batchedGeometryPending) {
      const { x, y, width, height } = state.$geometry.peek();
      if (x !== geometry.x || y !== geometry.y || width !== geometry.width || height !== geometry.height) {
        this.batchedGeometryPending.delete(id);
      }
    }
  }

  protected getOrCraeateBlockState(block: TBlock, mode: "update" | "replace" = "update") {
    const blockState = this.$blocksMap.value.get(block.id);
    if (blockState) {
      if (mode === "replace") blockState.replaceBlock(block);
      else blockState.updateBlock(block);
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
    if (!selectedBlocks.length) return;
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
    this.cancelBatchedBlocksGeometry();
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
  public getBlockState(id: TBlockId): BlockState | undefined {
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
