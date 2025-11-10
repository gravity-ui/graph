import { batch } from "@preact/signals-core";

import { GraphComponent } from "../components/canvas/GraphComponent";
import { TBlock } from "../components/canvas/blocks/Block";
import { Graph } from "../graph";
import { TGraphColors, TGraphConstants } from "../graphConfig";
import { ESelectionStrategy } from "../services/selection/types";
import { TBlockId } from "../store/block/Block";
import { selectBlockById } from "../store/block/selectors";
import { TConnection, TConnectionId } from "../store/connection/ConnectionState";
import { selectConnectionById } from "../store/connection/selectors";
import { TGraphSettingsConfig } from "../store/settings";
import { getElementsRect, startAnimation } from "../utils/functions";
import { TRect } from "../utils/types/shapes";

export type ZoomConfig = {
  transition?: number;
  padding?: number;
};

export class PublicGraphApi {
  constructor(public graph: Graph) {
    // noop
  }

  /**
   * Zooms to blocks
   * @param blockIds - block ids to zoom to
   * @param zoomConfig - {@link ZoomConfig} zoom config
   * @returns {boolean} true if zoom is successful, false otherwise
   *
   * @example
   * ```typescript
   * graph.zoomToBlocks([block1.id, block2.id]);
   * graph.zoomToBlocks([block1.id, block2.id], { transition: 1000, padding: 50 });
   * ```
   */
  public zoomToBlocks(blockIds: TBlockId[], zoomConfig?: ZoomConfig) {
    return this.zoomToElements(
      this.graph.rootStore.blocksList.getBlockStates(blockIds).map((blockState) => blockState.getViewComponent()),
      zoomConfig
    );
  }

  /**
   * Zooms to GraphComponent instances
   * @param instances -  {@link GraphComponent} instances to zoom to
   * @param zoomConfig - {@link ZoomConfig} zoom config
   * @returns {boolean} true if zoom is successful, false otherwise
   *
   * @example
   * ```typescript
   * graph.zoomToElements([component1, component2]);
   * graph.zoomToElements([component1, component2], { transition: 1000, padding: 50 });
   * ```
   */
  public zoomToElements<T extends GraphComponent = GraphComponent>(elements: T[], zoomConfig?: ZoomConfig) {
    if (elements.length === 0) {
      return false;
    }
    const elementsRect = getElementsRect(elements);
    this.zoomToRect(elementsRect, zoomConfig);
    return true;
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
      let zoomRect = rect;
      // if rect is empty we need apply usable rect gap
      // or zoom to center will be applied at position {0,0} with width/height 0/0
      if (rect.width === 0 && rect.height === 0 && rect.x === 0 && rect.y === 0) {
        zoomRect = {
          x: 0 - this.graph.graphConstants.system.USABLE_RECT_GAP,
          y: 0 - this.graph.graphConstants.system.USABLE_RECT_GAP,
          width: 0 + this.graph.graphConstants.system.USABLE_RECT_GAP * 2,
          height: 0 + this.graph.graphConstants.system.USABLE_RECT_GAP * 2,
        };
      }
      this.zoomToRect(zoomRect, zoomConfig);
    });
  }

  /**
   * Zooms to the specified rectangle in camera coordinates
   *
   * Zooms the camera to fit the specified rectangle in the viewport. The rectangle will be scaled
   * to fill the visible area (respecting camera insets) and centered in the viewport.
   *
   * @param rect - {@link TRect} rectangle to zoom to in camera coordinates
   * @param zoomConfig - {@link ZoomConfig} zoom config
   * @returns {undefined}
   *
   * @example
   * ```typescript
   * graph.zoomToRect({ x: 0, y: 0, width: 100, height: 100 });
   * graph.zoomToRect({ x: 0, y: 0, width: 100, height: 100 }, { transition: 1000, padding: 50 });
   */
  public zoomToRect(rect: TRect, zoomConfig?: ZoomConfig) {
    const transition = zoomConfig?.transition || 0;
    const padding = zoomConfig?.padding || 0;
    const cameraRectInit = this.graph.cameraService.getCameraRect();
    const cameraScaleInit = this.graph.cameraService.getCameraScale();

    // Compute scale against visible viewport (respectInsets) so content fits actual visible area
    const endScale = this.graph.cameraService.getScaleRelativeDimensions(
      rect.width + padding * 2,
      rect.height + padding * 2,
      { respectInsets: true }
    );

    const xyPosition = this.graph.cameraService.getXYRelativeCenterDimensions(
      {
        x: rect.x - padding,
        y: rect.y - padding,
        width: rect.width + padding * 2,
        height: rect.height + padding * 2,
      },
      endScale,
      { respectInsets: true }
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
    this.graph.rootStore.selectionService.resetAllSelections();
  }
}
