import { computed, effect, signal, untracked } from "@preact/signals-core";

import { Component } from "../../../lib/Component";
import { CoreComponent } from "../../../lib/CoreComponent";
import { isOnLevel, unionLevelMasks } from "../../../lib/scene/levels";
import type { TSceneExportRequest, TSceneLevel } from "../../../services/scene/types";
import { BlockState } from "../../../store/block/Block";
import { TGraphSettingsConfig } from "../../../store/settings";
import { track } from "../../../utils/functions/track";
import { TGraphLayerContext } from "../layers/graphLayer/GraphLayer";

import {
  Block,
  anchorLevelsOf,
  anchorOverflowOf,
  anchorReachOf,
  resetAnchorLevels,
  resetAnchorOverflow,
  resetAnchorReach,
} from "./Block";

/**
 * @internal Bench counters of the lazy anchors' view test (Task 17c): how often it ran, its time, and how many blocks
 * it asked to create their anchors. Off by default.
 */
export const anchorViewStats = {
  enabled: false,
  runs: 0,
  ms: 0,
  requested: 0,
  reset(): void {
    this.runs = 0;
    this.ms = 0;
    this.requested = 0;
  },
};

/**
 * @internal Bench counters of exports' anchor preparation (Task 17g): the blocks that created anchors for the last
 * export and the anchors they created. Off by default.
 */
export const exportAnchorStats = {
  enabled: false,
  blocks: 0,
  anchors: 0,
  reset(): void {
    this.blocks = 0;
    this.anchors = 0;
  },
};

const RELEASE_FAILED = "graph.scene.toImage(): dropping the anchors an export created failed";

export class Blocks extends Component {
  protected blocks: BlockState[] = [];
  protected blocksView: TGraphSettingsConfig["blockComponents"] = {};

  public declare context: TGraphLayerContext;

  protected readonly unsubscribe: (() => void)[];

  /** Disposes the lazy anchors' view test (`watchAnchorView`) on unmount. */
  private anchorViewAbort?: AbortController;

  /** Removes the export preparer (`prepareExport`) on unmount. */
  private removeExportPreparer?: () => void;

  /** Set when the block list changes: the next reconcile recomputes the graph's largest anchor overflow. */
  private blocksChanged = false;

  private readonly $usesCustomParentProps = signal(false);

  private font: string;

  constructor(props: {}, context: CoreComponent) {
    super(props, context);

    this.unsubscribe = this.subscribe();

    this.font = this.prepareFont(this.getFontScale());
  }

  protected getFontScale() {
    return this.context.graph.rootStore.settings.getConfigFlag("scaleFontSize");
  }

  protected rerender() {
    this.shouldRenderChildren = true;
    this.shouldUpdateChildren = true;
    this.performRender();
  }

  protected subscribe() {
    const { blocksList: store, settings } = this.context.graph.rootStore;
    this.blocks = store.$blocks.value;
    this.blocksView = settings.getConfigFlag("blockComponents");
    const viewBlocks = computed(() => {
      // Extensions that decide what parent props to create or apply keep the list-driven lifecycle.
      if (
        this.$usesCustomParentProps.value ||
        Object.values(settings.$blockComponents.value).some((type) => type && type.create !== Block.create)
      ) {
        return store.$blocks.value;
      }
      track(store.$viewRevision);
      return store.$blocks.peek();
    });
    return [
      viewBlocks.subscribe((blocks) => {
        this.blocks = blocks;
        this.blocksChanged = true;
        this.rerender();
      }),
      settings.$blockComponents.subscribe((blockComponents) => {
        this.blocksView = blockComponents;
        this.blocksChanged = true;
        this.rerender();
      }),
    ];
  }

  protected willMount(): void {
    super.willMount();
    this.watchAnchorView();
    this.removeExportPreparer?.();
    this.removeExportPreparer = this.context.graph.scene.addExportPreparer((request) => this.prepareExport(request));
  }

  /**
   * Prepares `graph.scene.toImage()` (option A′, Task 17g): the blocks whose anchors would show in the export's rect at
   * its level and have no anchor components create them for the export (`Block.createExportAnchors`), so the picture
   * does not depend on where the camera has been. The returned function drops them again. Blocks are tested by their
   * live geometry, widened by their anchor overflow and by the `LOOK_EXTENT` of their anchor classes: not through the
   * debounced hit-test index, and not by anything an earlier export saw.
   */
  private prepareExport(request: TSceneExportRequest): (() => void) | undefined {
    const graph = this.context.graph;
    if (exportAnchorStats.enabled) exportAnchorStats.reset();
    if (!graph.rootStore.settings.getConfigFlag("useBlocksAnchors")) return undefined;
    const created: Block[] = [];
    // Drops them all; the first failure is thrown, the later ones are logged.
    const release = (): void => {
      let failed = false;
      let failure: unknown;
      for (const block of created.splice(0)) {
        try {
          block.releaseExportAnchors();
        } catch (error) {
          if (failed) console.error(RELEASE_FAILED, error);
          else {
            failed = true;
            failure = error;
          }
        }
      }
      if (failed) throw failure;
    };
    const { rect, level } = request;
    const tileRect = { minX: rect.x, minY: rect.y, maxX: rect.x + rect.width, maxY: rect.y + rect.height };
    try {
      for (const state of this.blocks) {
        const block = state.getViewComponent();
        if (block?.createExportAnchors(tileRect, level)) created.push(block);
      }
    } catch (error) {
      try {
        release();
      } catch (cleanupError) {
        console.error(RELEASE_FAILED, cleanupError);
      }
      throw error;
    }
    if (exportAnchorStats.enabled) {
      exportAnchorStats.blocks = created.length;
      exportAnchorStats.anchors = created.reduce((sum, block) => sum + block.connectedState.$anchors.peek().length, 0);
    }
    return created.length > 0 ? release : undefined;
  }

  /**
   * Lazy anchors: runs the camera's view test on every camera change and every level change, and on every update of
   * the hit-test index, so a block whose hit box was not indexed yet when the camera moved is found once the index
   * catches up. Set up at mount and disposed on unmount through `anchorViewAbort`. Its first run is skipped: no block
   * is mounted yet, and blocks check themselves when they mount.
   */
  private watchAnchorView(): void {
    this.anchorViewAbort?.abort();
    const controller = new AbortController();
    this.anchorViewAbort = controller;
    const graph = this.context.graph;
    const onHitTestUpdate = (): void => this.createAnchorsInView(graph.scene.$level.peek());
    graph.hitTest.on("update", onHitTestUpdate);
    let first = true;
    const dispose = effect(() => {
      const level = graph.scene.$level.value;
      track(graph.$camera);
      if (first) {
        first = false;
        return;
      }
      untracked(() => this.createAnchorsInView(level));
    });
    controller.signal.addEventListener(
      "abort",
      () => {
        dispose();
        graph.hitTest.off("update", onHitTestUpdate);
      },
      { once: true }
    );
  }

  /**
   * The camera's view test of the lazy anchors (user decision, 2026-11-14): at a level on which the graph's blocks
   * create anchors (`anchorLevelsOf`: the anchor classes' `CREATION_LEVELS`), every block the camera shows creates its
   * anchor components (`Block.requestAnchors`). It reuses the hit-test index, so it costs
   * one search of the view per camera change. Blocks that mount, move or are shown check themselves in their update.
   */
  protected createAnchorsInView(level: TSceneLevel): void {
    const graph = this.context.graph;
    if (!isOnLevel(anchorLevelsOf(graph), level) || !graph.rootStore.settings.getConfigFlag("useBlocksAnchors")) return;
    const start = anchorViewStats.enabled ? performance.now() : 0;
    let requested = 0;
    const { relativeX, relativeY, relativeWidth, relativeHeight } = this.context.camera.getCameraState();
    if (relativeWidth <= 0 || relativeHeight <= 0) {
      // A camera without a size counts as showing every block (Block.shouldCreateAnchors).
      for (const block of this.blocks) {
        if (block.getViewComponent()?.requestAnchors()) requested++;
      }
    } else {
      // Widened by the farthest anchor point outside its block and by the farthest reach of an anchor's look: a block
      // whose anchors alone are in view, or only their dots at the view's edge, is found too.
      const out = anchorOverflowOf(this.context.graph) + anchorReachOf(this.context.graph);
      const items = this.context.graph.hitTest.testBox({
        minX: -relativeX - out,
        minY: -relativeY - out,
        maxX: -relativeX + relativeWidth + out,
        maxY: -relativeY + relativeHeight + out,
      });
      for (const item of items) {
        if (item instanceof Block && item.requestAnchors()) requested++;
      }
    }
    if (anchorViewStats.enabled) {
      anchorViewStats.runs++;
      anchorViewStats.ms += performance.now() - start;
      anchorViewStats.requested += requested;
    }
  }

  private prepareFont(scaleFontSize: number) {
    return `bold ${Math.round(this.context.constants.text.BASE_FONT_SIZE * scaleFontSize)}px sans-serif`;
  }

  protected unmount() {
    this.anchorViewAbort?.abort();
    this.anchorViewAbort = undefined;
    this.removeExportPreparer?.();
    this.removeExportPreparer = undefined;
    super.unmount();
    this.unsubscribe.forEach((cb) => cb());
  }

  /**
   * After a reconcile that followed a block list change (data replaced, blocks added or removed): the graph's largest
   * anchor overflow and anchor look reach become the largest of the blocks it now has, and its anchor creation levels
   * their union, so a removed outlier stops widening view searches.
   */
  protected didUpdateChildren(): void {
    super.didUpdateChildren();
    if (!this.blocksChanged) return;
    this.blocksChanged = false;
    let overflow = 0;
    let reach = 0;
    let levels = 0;
    let usesCustomParentProps = false;
    for (const state of this.blocks) {
      const block = state.getViewComponent();
      if (!block) continue;
      overflow = Math.max(overflow, block.getAnchorOverflow());
      reach = Math.max(reach, block.getAnchorReach());
      levels = unionLevelMasks(levels, block.getAnchorLevels());
      usesCustomParentProps ||= Component.hasParentPropsOverrides(block, Block.prototype);
    }
    resetAnchorOverflow(this.context.graph, overflow);
    resetAnchorReach(this.context.graph, reach);
    resetAnchorLevels(this.context.graph, levels);
    this.$usesCustomParentProps.value = usesCustomParentProps;
  }

  protected updateChildren() {
    return this.blocks.map((block, index) => {
      return (this.blocksView[block.$state.value.is] || Block).create(
        {
          id: block.id,
          initialIndex: index,
          font: this.font,
        },
        {
          key: block.id,
        }
      );
    });
  }
}
