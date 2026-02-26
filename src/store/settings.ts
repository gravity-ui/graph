import { computed, signal } from "@preact/signals-core";
import cloneDeep from "lodash/cloneDeep";

import type { Block, TBlock } from "../components/canvas/blocks/Block";
import { BlockConnection } from "../components/canvas/connections/BlockConnection";
import { Component } from "../lib";

import { TConnection } from "./connection/ConnectionState";

import { RootStore } from "./index";

/** @deprecated Use ECanDrag and setting canDrag instead */
export enum ECanChangeBlockGeometry {
  ALL = "all",
  ONLY_SELECTED = "onlySelected",
  NONE = "none",
}

export enum ECanDrag {
  /** Any component can be dragged. If component is in selection, all selected draggable components move together */
  ALL = "all",
  /** Only selected components can be dragged */
  ONLY_SELECTED = "onlySelected",
  /** Drag is disabled for all components (except manual drag via startDrag) */
  NONE = "none",
}

export type TGraphSettingsConfig<Block extends TBlock = TBlock, Connection extends TConnection = TConnection> = {
  canDragCamera: boolean;
  canZoomCamera: boolean;
  /** @deprecated Use NewBlockLayer parameters instead */
  canDuplicateBlocks?: boolean;
  /** @deprecated Use canDrag instead */
  canChangeBlockGeometry?: ECanChangeBlockGeometry;
  /** Controls which components can be dragged */
  canDrag?: ECanDrag;
  /**
   * Minimum distance in pixels the mouse must move before a drag operation starts.
   * Helps prevent accidental drags during clicks. Default: 3
   */
  dragThreshold?: number;
  /**
   * Controls if connections can be created via anchors
   * If this connection is enabled, then anchors are not draggable and connection creation is handled by ConnectionLayer.
   * */
  canCreateNewConnections: boolean;
  scaleFontSize: number;
  showConnectionArrows: boolean;
  useBezierConnections: boolean;
  bezierConnectionDirection: "vertical" | "horizontal";
  useBlocksAnchors: boolean;
  connectivityComponentOnClickRaise: boolean;
  showConnectionLabels: boolean;
  blockComponents: Record<string, typeof Block<Block>>;
  connection?: typeof BlockConnection<Connection>;
  background?: typeof Component;
  /**
   * When enabled, mouseenter/mouseleave events are re-evaluated after each camera change.
   * Useful for trackpads where panning does not trigger native mousemove events,
   * so hovering over elements requires this emulation to work correctly.
   * Default: false
   */
  emulateMouseEventsOnCameraChange?: boolean;
};

export const DefaultSettings: TGraphSettingsConfig = {
  canDragCamera: true,
  canZoomCamera: true,
  canDuplicateBlocks: false,
  canDrag: ECanDrag.NONE,
  dragThreshold: 5,
  canCreateNewConnections: false,
  showConnectionArrows: true,
  scaleFontSize: 1,
  useBezierConnections: true,
  bezierConnectionDirection: "horizontal",
  useBlocksAnchors: true,
  connectivityComponentOnClickRaise: true,
  showConnectionLabels: false,
  blockComponents: {},
};

export class GraphEditorSettings {
  public $settings = signal(DefaultSettings);

  public $blockComponents = computed(() => {
    return this.$settings.value.blockComponents;
  });

  public $background = computed(() => {
    return this.$settings.value.background;
  });

  public $connection = computed(() => {
    return this.$settings.value.connection;
  });

  constructor(public rootStore: RootStore) {}

  public setupSettings(config: Partial<TGraphSettingsConfig>) {
    this.$settings.value = Object.assign({}, this.$settings.value, config);
  }

  public setConfigFlag<K extends keyof TGraphSettingsConfig>(flagPath: K, value: TGraphSettingsConfig[K]) {
    if (typeof this.$settings.value[flagPath] === typeof value) {
      this.$settings.value[flagPath] = value;
    }
  }

  public getConfigFlag(flagPath: keyof TGraphSettingsConfig) {
    return this.$settings.value[flagPath];
  }

  public $connectionsSettings = computed(() => {
    return {
      useBezierConnections: this.$settings.value.useBezierConnections,
      showConnectionLabels: this.$settings.value.showConnectionLabels,
      canCreateNewConnections: this.$settings.value.canCreateNewConnections,
      showConnectionArrows: this.$settings.value.showConnectionArrows,
      bezierConnectionDirection: this.$settings.value.bezierConnectionDirection,
    };
  });

  /**
   * Computed canDrag setting with backward compatibility.
   * Priority: canChangeBlockGeometry (deprecated, for existing users) > canDrag > default ALL
   */
  public $canDrag = computed((): ECanDrag => {
    const settings = this.$settings.value;

    // 1. If deprecated canChangeBlockGeometry is set, use it (don't break existing users)
    // Both enums have the same string values, so we can cast directly
    if (settings.canChangeBlockGeometry !== undefined) {
      return settings.canChangeBlockGeometry as unknown as ECanDrag;
    }

    // 2. Use canDrag if explicitly set (new users)
    if (settings.canDrag !== undefined) {
      return settings.canDrag;
    }

    // 3. Default to ALL if neither is set
    return ECanDrag.ALL;
  });

  /**
   * Drag threshold in pixels. Default: 3
   */
  public $dragThreshold = computed((): number => {
    return this.$settings.value.dragThreshold ?? 3;
  });

  public toJSON() {
    return cloneDeep(this.$settings.toJSON());
  }

  public get asConfig(): TGraphSettingsConfig {
    return this.toJSON();
  }

  public reset() {
    this.setupSettings(DefaultSettings);
  }
}
