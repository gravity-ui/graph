import { computed, signal } from "@preact/signals-core";

import type { Block, TBlock } from "../components/canvas/blocks/Block";
import { BlockConnection } from "../components/canvas/connections/BlockConnection";

import { TConnection } from "./connection/ConnectionState";

import { RootStore } from "./index";

export enum ECanChangeBlockGeometry {
  ALL = "all",
  ONLY_SELECTED = "onlySelected",
  NONE = "none",
}

export type TGraphSettingsConfig<Block extends TBlock = TBlock, Connection extends TConnection = TConnection> = {
  canDragCamera: boolean;
  canZoomCamera: boolean;
  canDuplicateBlocks: boolean;
  canChangeBlockGeometry: ECanChangeBlockGeometry;
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
};

const getInitState: TGraphSettingsConfig = {
  canDragCamera: true,
  canZoomCamera: true,
  canDuplicateBlocks: false,
  canChangeBlockGeometry: ECanChangeBlockGeometry.NONE,
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
  public $settings = signal(getInitState);

  public $blockComponents = computed(() => {
    return this.$settings.value.blockComponents;
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

  public get asConfig(): TGraphSettingsConfig {
    return this.$settings.value;
  }

  public reset() {
    this.setupSettings(getInitState);
  }
}
