import { computed, signal } from "@preact/signals-core";
import cloneDeep from "lodash/cloneDeep";

import type { Block, TBlock } from "../components/canvas/blocks/Block";
import { BlockConnection } from "../components/canvas/connections/BlockConnection";
import { Component } from "../lib";
import { defaultGetCameraBlockScaleLevel } from "../services/camera/defaultGetCameraBlockScaleLevel";
import type { TGetCameraBlockScaleLevel } from "../services/camera/defaultGetCameraBlockScaleLevel";
import { mergeDefined } from "../utils/functions/mergeDefined";
import type { EWheelIntent, TResolveWheelIntent, TResolveWheelIntentOptions } from "../utils/functions/wheelIntent";
import { createWheelIntentResolver } from "../utils/functions/wheelIntent";

import { TConnection } from "./connection/ConnectionState";

import { RootStore } from "./index";

export enum ECanDrag {
  /** Any component can be dragged. If component is in selection, all selected draggable components move together */
  ALL = "all",
  /** Only selected components can be dragged */
  ONLY_SELECTED = "onlySelected",
  /** Drag is disabled for all components (except manual drag via startDrag) */
  NONE = "none",
}

export type TResolvedGraphSettings<Block extends TBlock = TBlock, Connection extends TConnection = TConnection> = {
  canDragCamera: boolean;
  canZoomCamera: boolean;
  /** @deprecated Use NewBlockLayer parameters instead */
  canDuplicateBlocks: boolean;
  /** Controls which components can be dragged */
  canDrag: ECanDrag;
  /**
   * Minimum distance in pixels the mouse must move before a drag operation starts.
   * Helps prevent accidental drags during clicks. Default: 5
   */
  dragThreshold: number;
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
  emulateMouseEventsOnCameraChange: boolean;
  /**
   * Classifies wheel input as pan or zoom intent so Camera can route without knowing device type.
   * Receives `mouseWheelBehavior` and `wheelInputDevice` from camera constants so wheel policy
   * stays in the input layer, not Camera.
   *
   * Transitional: today Camera calls {@link GraphEditorSettings.wheelIntentFromEvent} from a raw
   * `wheel` listener. A future input layer will normalize DOM events and emit semantic graph events
   * (`camera:pan`, `camera:zoom`, …); this callback is the classification hook until then.
   *
   * @default {@link createWheelIntentResolver} — gesture-shape heuristics (pan vs zoom intent).
   */
  resolveWheelIntent: TResolveWheelIntent;
  /**
   * Maps camera scale to block zoom tier (minimalistic / schematic / detailed).
   * Always set at runtime; `setupSettings` falls back to the exported `defaultGetCameraBlockScaleLevel` when omitted.
   */
  getCameraBlockScaleLevel: TGetCameraBlockScaleLevel;
};

/** Partial public settings input. Undefined never resets or clears a value. */
export type TGraphSettingsConfig<B extends TBlock = TBlock, C extends TConnection = TConnection> = Omit<
  Partial<TResolvedGraphSettings<B, C>>,
  "blockComponents"
> & {
  blockComponents?: Partial<TResolvedGraphSettings<B, C>["blockComponents"]>;
};

export const DefaultSettings: TResolvedGraphSettings = {
  canDragCamera: true,
  canZoomCamera: true,
  canDuplicateBlocks: false,
  canDrag: ECanDrag.NONE,
  dragThreshold: 5,
  emulateMouseEventsOnCameraChange: false,
  canCreateNewConnections: false,
  showConnectionArrows: true,
  scaleFontSize: 1,
  useBezierConnections: true,
  bezierConnectionDirection: "horizontal",
  useBlocksAnchors: true,
  connectivityComponentOnClickRaise: true,
  showConnectionLabels: false,
  blockComponents: {},
  resolveWheelIntent: createWheelIntentResolver(),
  getCameraBlockScaleLevel: defaultGetCameraBlockScaleLevel,
};

export class GraphEditorSettings {
  public $settings = signal(cloneDeep(DefaultSettings));

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

  public setupSettings(config: TGraphSettingsConfig = {}) {
    const current = this.$settings.value;
    const { blockComponents, ...settings } = config;
    this.$settings.value = {
      ...mergeDefined(current, settings),
      blockComponents: mergeDefined(current.blockComponents, blockComponents),
    };
  }

  public setConfigFlag<K extends keyof TResolvedGraphSettings>(key: K, value: TGraphSettingsConfig[K]) {
    if (value === undefined) return;
    const patch: TGraphSettingsConfig = {};
    patch[key] = value;
    this.setupSettings(patch);
  }

  public getConfigFlag<K extends keyof TResolvedGraphSettings>(key: K): TResolvedGraphSettings[K] {
    return this.$settings.value[key];
  }

  public resetSetting<K extends keyof TResolvedGraphSettings>(key: K) {
    this.$settings.value = {
      ...this.$settings.value,
      [key]: cloneDeep(DefaultSettings)[key],
    };
  }

  /**
   * Resolves wheel intent using {@link TGraphSettingsConfig.resolveWheelIntent} (typed; prefer over getConfigFlag).
   */
  public wheelIntentFromEvent(event: WheelEvent, options: TResolveWheelIntentOptions): EWheelIntent {
    return this.$settings.value.resolveWheelIntent(event, options);
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

  public $canDrag = computed(() => this.$settings.value.canDrag);

  public $dragThreshold = computed(() => this.$settings.value.dragThreshold);

  public toJSON() {
    return cloneDeep(this.$settings.toJSON());
  }

  public get asConfig(): TResolvedGraphSettings {
    return this.toJSON();
  }

  public reset() {
    this.$settings.value = cloneDeep(DefaultSettings);
  }
}
