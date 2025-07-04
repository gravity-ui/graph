import { batch } from "@preact/signals-core";

import { TBlock } from "../components/canvas/blocks/Block";
import { Graph } from "../graph";
import { TGraphColors, TGraphConstants } from "../graphConfig";
import { TBlockId } from "../store/block/Block";
import { selectBlockById } from "../store/block/selectors";
import { TConnection, TConnectionId } from "../store/connection/ConnectionState";
import { selectConnectionById } from "../store/connection/selectors";
import { TGraphSettingsConfig } from "../store/settings";
import { getUsableRectByBlockIds, startAnimation } from "../utils/functions";
import { TRect } from "../utils/types/shapes";
import { ESelectionStrategy } from "../utils/types/types";

export type ZoomConfig = {
  transition?: number;
  padding?: number;
};

export class PublicGraphApi {
  constructor(public graph: Graph) {
    // noop
  }

  public zoomToBlocks(blockIds: TBlockId[], zoomConfig?: ZoomConfig) {
    const blocksRect = getUsableRectByBlockIds(this.graph.rootStore.blocksList.$blocks.value, blockIds);

    this.zoomToRect(blocksRect, zoomConfig);
  }

  /**
   * Zooms to fit all blocks in the viewport. This method is asynchronous and waits
   * for the usableRect to be ready before performing the zoom operation.
   *
   * @param zoomConfig - Configuration for zoom transition and padding
   * @returns Promise that resolves when zoom operation is complete
   */
  public zoomToViewPort(zoomConfig?: ZoomConfig) {
    this.graph.hitTest.waitUsableRectUpdate((rect) => {
      this.zoomToRect(rect, zoomConfig);
    });
  }

  public zoomToRect(rect: TRect, zoomConfig?: ZoomConfig) {
    const transition = zoomConfig?.transition || 0;
    const padding = zoomConfig?.padding || 0;
    const cameraRectInit = this.graph.cameraService.getCameraRect();
    const cameraScaleInit = this.graph.cameraService.getCameraScale();

    const endScale = this.graph.cameraService.getScaleRelativeDimensions(
      rect.width + padding * 2,
      rect.height + padding * 2
    );

    const xyPosition = this.graph.cameraService.getXYRelativeCenterDimensions(
      {
        x: rect.x - padding,
        y: rect.y - padding,
        width: rect.width + padding * 2,
        height: rect.height + padding * 2,
      },
      endScale
    );

    if (!transition) {
      this.graph.cameraService.set({ ...xyPosition, scale: endScale });
      return;
    }

    startAnimation(transition, (progress) => {
      const x = cameraRectInit.x + (xyPosition.x - cameraRectInit.x) * progress;
      const y = cameraRectInit.y + (xyPosition.y - cameraRectInit.y) * progress;
      const scale = cameraScaleInit + (endScale - cameraScaleInit) * progress;

      this.graph.cameraService.set({ x, y, scale });
    });
  }

  public getGraphColors(): TGraphColors {
    return this.graph.graphColors;
  }

  public updateGraphColors(colors: TGraphColors) {
    this.graph.setColors(colors);
  }

  public getGraphConstants(): TGraphConstants {
    return this.graph.graphConstants;
  }

  public updateGraphConstants(constants: TGraphConstants) {
    this.graph.setConstants(constants);
  }

  public isGraphEmpty() {
    return this.graph.rootStore.blocksList.$blocksMap.value.size === 0;
  }

  public setSetting(flagPath: keyof TGraphSettingsConfig, value: boolean | number) {
    this.graph.rootStore.settings.setConfigFlag(flagPath, value);
  }

  public setCurrentConfigurationName(newName: string) {
    this.graph.rootStore.configurationName = newName;
  }

  public deleteSelected() {
    batch(() => {
      this.graph.rootStore.connectionsList.deleteSelectedConnections();
      this.graph.rootStore.blocksList.deleteSelectedBlocks();
    });
  }

  public selectBlocks(
    blockIds: TBlockId[],
    selected: boolean,
    strategy: ESelectionStrategy = ESelectionStrategy.REPLACE
  ) {
    this.graph.rootStore.blocksList.updateBlocksSelection(blockIds, selected, strategy);
  }

  public updateBlock(block: { id: TBlockId } & Partial<Omit<TBlock, "id">>) {
    const blockStore = selectBlockById(this.graph, block.id);
    blockStore?.updateBlock(block);
  }

  public addBlock(
    block: Omit<TBlock, "id"> & { id?: TBlockId },
    selectionOptions?: {
      selected?: boolean;
      strategy?: ESelectionStrategy;
    }
  ): TBlockId {
    const newBlockId = this.graph.rootStore.blocksList.addBlock(block);

    if (selectionOptions !== undefined) {
      this.graph.rootStore.blocksList.updateBlocksSelection(
        [newBlockId],
        selectionOptions.selected !== undefined ? selectionOptions.selected : true,
        selectionOptions.strategy
      );
    }

    return newBlockId;
  }

  public setAnchorSelection(blockId: TBlockId, anchorId: string, selected: boolean) {
    this.graph.rootStore.blocksList.setAnchorSelection(blockId, anchorId, selected);
  }

  public selectConnections(
    connectionIds: TConnectionId[],
    selected: boolean,
    strategy: ESelectionStrategy = ESelectionStrategy.REPLACE
  ) {
    batch(() => {
      this.graph.rootStore.connectionsList.setConnectionsSelection(connectionIds, selected, strategy);
    });
  }

  public updateConnection(id: TConnectionId, connection: Partial<TConnection>) {
    const connectionStore = selectConnectionById(this.graph, id);
    connectionStore.updateConnection(connection);
  }

  public addConnection(connection: TConnection) {
    return this.graph.rootStore.connectionsList.addConnection(connection);
  }

  public getBlockById(blockId: TBlockId) {
    return selectBlockById(this.graph, blockId)?.asTBlock();
  }

  public getUsableRect() {
    return this.graph.hitTest.getUsableRect();
  }

  public unsetSelection() {
    batch(() => {
      this.graph.rootStore.blocksList.resetSelection();
      this.graph.rootStore.groupsList.resetSelection();
      this.graph.rootStore.connectionsList.resetSelection();
    });
  }
}
