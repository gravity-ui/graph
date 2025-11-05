import { computed, signal } from "@preact/signals-core";
import cloneDeep from "lodash/cloneDeep";
import merge from "lodash/merge";

import { Block } from "../components/canvas/blocks/Block";
import { BaseConnection } from "../components/canvas/connections";
import { Component } from "../lib";
import { Constructor } from "../utils";

import { RootStore } from "./index";

export enum ECanChangeBlockGeometry {
  ALL = "all",
  ONLY_SELECTED = "onlySelected",
  NONE = "none",
}

export type TGraphSettingsConfig = {
  canDragCamera: boolean;
  canZoomCamera: boolean;
  canChangeBlockGeometry: ECanChangeBlockGeometry;
  canCreateNewConnections: boolean;
  scaleFontSize: number;
  showConnectionArrows: boolean;
  /*
   * @deprecated Use connection component instead
   * This flag will be removed in the future
   * Please use connection component instead
   */
  useBezierConnections: boolean;
  /**
   * @deprecated Use connection component instead
   * This flag will be removed in the future
   * Please use connection component instead
   */
  bezierConnectionDirection: "vertical" | "horizontal";
  useBlocksAnchors: boolean;
  /**
   * @deprecated Use connection component instead
   * This flag will be removed in the future
   * Please use connection component instead
   */
  showConnectionLabels: boolean;
  blockComponents: Record<string, Constructor<Block>>;
  connection?: Constructor<BaseConnection>;
  background?: typeof Component;
  /**
   * Constrain camera movement and zoom to keep the graph content visible.
   * When enabled, prevents the user from panning or zooming out to a point
   * where the graph is no longer visible.
   * @default false
   */
  constrainCameraToGraph: boolean;
};

const getInitState: TGraphSettingsConfig = {
  canDragCamera: true,
  canZoomCamera: true,
  canChangeBlockGeometry: ECanChangeBlockGeometry.NONE,
  canCreateNewConnections: false,
  showConnectionArrows: true,
  scaleFontSize: 1,
  useBezierConnections: true,
  bezierConnectionDirection: "horizontal",
  useBlocksAnchors: true,
  showConnectionLabels: false,
  blockComponents: {},
  constrainCameraToGraph: true,
};

export class GraphEditorSettings {
  public $settings = signal(getInitState);

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
    this.$settings.value = merge({}, this.$settings.value, config);
  }

  public setConfigFlag<K extends keyof TGraphSettingsConfig>(flagPath: K, value: TGraphSettingsConfig[K]) {
    if (typeof this.$settings.value[flagPath] === typeof value) {
      this.$settings.value[flagPath] = value;
    }
  }

  public getConfigFlag<K extends keyof TGraphSettingsConfig>(flagPath: K): TGraphSettingsConfig[K] {
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

  public toJSON() {
    return cloneDeep(this.$settings.toJSON());
  }

  public get asConfig(): TGraphSettingsConfig {
    return this.toJSON();
  }

  public reset() {
    this.setupSettings(getInitState);
  }
}
