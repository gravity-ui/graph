import { computed, signal } from "@preact/signals-core";
import type { ReadonlySignal } from "@preact/signals-core";
import cloneDeep from "lodash/cloneDeep";

import type { Block, TBlock } from "../components/canvas/blocks/Block";
import { BlockConnection } from "../components/canvas/connections/BlockConnection";
import { Component } from "../lib";
import type { ISceneBackendModule } from "../lib/scene/renderer/backendTypes";
import type { TSceneRenderer } from "../lib/scene/types";
import { defaultGetCameraBlockScaleLevel } from "../services/camera/defaultGetCameraBlockScaleLevel";
import type { TGetCameraBlockScaleLevel } from "../services/camera/defaultGetCameraBlockScaleLevel";
import { mergeDefined } from "../utils/functions/mergeDefined";
import type { EWheelIntent, TResolveWheelIntent, TResolveWheelIntentOptions } from "../utils/functions/wheelIntent";
import { createWheelIntentResolver } from "../utils/functions/wheelIntent";

import { TConnection } from "./connection/ConnectionState";

import { RootStore } from "./index";

/** Whether two records hold the same keys with identical values. */
function sameEntries(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const keys = Object.keys(a);
  return (
    keys.length === Object.keys(b).length &&
    keys.every((key) => Object.prototype.hasOwnProperty.call(b, key) && a[key] === b[key])
  );
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
  /** Controls which components can be dragged */
  canDrag: ECanDrag;
  /**
   * Minimum distance in CSS pixels the pointer must move before a drag operation starts.
   * Helps prevent accidental drags during clicks. Default: 5
   */
  dragThreshold: number;
  /** Maximum movement during a click, in CSS pixels. */
  clickTolerance: number;
  /** "exclusive" waits for the double-click window before delivering a single click and its default action. */
  clickPolicy: "immediate" | "exclusive";
  /** Maximum time between two clicks on one target, in milliseconds. */
  doubleClickInterval: number;
  /** Maximum distance between two clicks on one target, in CSS pixels. */
  doubleClickDistance: number;
  /** Time a stationary touch or pen must be held before longpress, in milliseconds. */
  longPressDuration: number;
  /** Defaults to "page" for host scrolling. Editors opt into one-finger dragging and two-finger navigation. */
  touchPolicy: "page" | "editor";
  scaleFontSize: number;
  showConnectionArrows: boolean;
  useBezierConnections: boolean;
  bezierConnectionDirection: "vertical" | "horizontal";
  /**
   * Experimental fallback for Bezier connection bounds calculation.
   * Set to false to use the legacy control-point bounds instead of calculating
   * the tight bounds of the rendered curve.
   */
  EXP_USE_TIGHT_BEZIER_BOUNDS: boolean;
  /**
   * Cull canvas components by the viewport: layers walk and paint only the components near it. Set to false for no
   * viewport culling: every component is walked, a graph component paints when the camera sees its hit box and
   * connection batches draw every chunk. The lifecycle rules shared with culling still apply (an offscreen component is
   * not painted on mount; visibility is decided after preparation), so the switch rules out spatial culling only, for
   * example while investigating a rendering problem.
   */
  viewportCulling: boolean;
  useBlocksAnchors: boolean;
  connectivityComponentOnClickRaise: boolean;
  showConnectionLabels: boolean;
  blockComponents: Record<string, typeof Block<Block>>;
  connection: typeof BlockConnection<Connection> | undefined;
  background: typeof Component | undefined;
  /**
   * Re-evaluate the hover target when the camera moves under a stationary mouse or pen.
   * A target change sends pointerleave and pointerenter with cause "scene".
   * Default: false
   */
  retargetHoverOnCameraChange: boolean;
  /**
   * Classifies wheel input as pan or zoom intent so Camera can route without knowing device type.
   * Receives `mouseWheelBehavior` and `wheelInputDevice` from camera constants so wheel policy
   * stays in the input layer, not Camera.
   *
   * @default {@link createWheelIntentResolver} — gesture-shape heuristics (pan vs zoom intent).
   */
  resolveWheelIntent: TResolveWheelIntent;
  /**
   * Maps camera scale to block zoom tier (minimalistic / schematic / detailed).
   * Always set at runtime; `setupSettings` falls back to the exported `defaultGetCameraBlockScaleLevel` when omitted.
   */
  getCameraBlockScaleLevel: TGetCameraBlockScaleLevel;
  /**
   * Scene renderer: `"canvas"` draws through Canvas 2D, `"webgl"` draws the scene through the WebGL backend.
   * @default "canvas"
   */
  renderer: TSceneRenderer;
  /** Give loading UI a paint before the first scene frame, a full replacement or a renderer switch. */
  yieldBeforeSceneLoad?: boolean;
  /**
   * Whether scene texts may follow the camera (`cameraAware` texts keep a fixed screen size and re-fit their box as
   * the camera zooms). `false` makes every scene text world-sized, whatever its primitive and the styles say: the
   * switch for weak devices, which an app may hand to its users. A change redraws; no block rebuilds its look.
   * @default true
   */
  cameraAwareText: boolean;
  /**
   * Loader of the WebGL backend module. Used when `renderer` is `"webgl"`.
   * When omitted, the built-in dynamic import is used.
   */
  webglBackend?: () => Promise<ISceneBackendModule>;
};

/** Partial public settings input. Undefined never resets or clears a value. */
export type TGraphSettingsPatch<B extends TBlock = TBlock, C extends TConnection = TConnection> = Omit<
  Partial<TGraphSettingsConfig<B, C>>,
  "blockComponents"
> & {
  blockComponents?: Partial<TGraphSettingsConfig<B, C>["blockComponents"]>;
};

export const DefaultSettings: TGraphSettingsConfig = {
  canDragCamera: true,
  canZoomCamera: true,
  canDrag: ECanDrag.NONE,
  dragThreshold: 5,
  clickTolerance: 3,
  clickPolicy: "immediate",
  doubleClickInterval: 350,
  doubleClickDistance: 12,
  longPressDuration: 500,
  touchPolicy: "page",
  retargetHoverOnCameraChange: false,
  showConnectionArrows: true,
  scaleFontSize: 1,
  useBezierConnections: true,
  bezierConnectionDirection: "horizontal",
  EXP_USE_TIGHT_BEZIER_BOUNDS: true,
  viewportCulling: true,
  useBlocksAnchors: true,
  connectivityComponentOnClickRaise: true,
  showConnectionLabels: false,
  blockComponents: {},
  connection: undefined,
  background: undefined,
  resolveWheelIntent: createWheelIntentResolver(),
  getCameraBlockScaleLevel: defaultGetCameraBlockScaleLevel,
  renderer: "canvas",
  yieldBeforeSceneLoad: false,
  cameraAwareText: true,
};

export class GraphEditorSettings {
  private initialSettings = cloneDeep(DefaultSettings);

  public $settings = signal(cloneDeep(DefaultSettings));

  private lastBlockComponents?: TGraphSettingsConfig["blockComponents"];

  /**
   * The block classes by type. Every settings update copies the record, so it keeps the last one while the classes
   * are the same: a settings change that registers no block class does not reconcile every block.
   */
  public $blockComponents = computed((): TGraphSettingsConfig["blockComponents"] => {
    const next = this.$settings.value.blockComponents;
    const last = this.lastBlockComponents;
    if (last && sameEntries(last, next)) return last;
    this.lastBlockComponents = next;
    return next;
  });

  public $background = computed(() => {
    return this.$settings.value.background;
  });

  public $connection = computed(() => {
    return this.$settings.value.connection;
  });

  constructor(public rootStore: RootStore) {}

  /** @internal Capture the complete constructor configuration before subsequent updates. */
  public captureInitialSettings() {
    this.initialSettings = cloneDeep(this.$settings.value);
  }

  public setupSettings(config: TGraphSettingsPatch = {}) {
    const current = this.$settings.value;
    const { blockComponents, ...settings } = config;
    this.$settings.value = {
      ...mergeDefined(current, settings),
      blockComponents: mergeDefined(current.blockComponents, blockComponents),
    };
  }

  public setConfigFlag<K extends keyof TGraphSettingsConfig>(key: K, value: TGraphSettingsPatch[K]) {
    if (value === undefined) return;
    const patch: TGraphSettingsPatch = {};
    patch[key] = value;
    this.setupSettings(patch);
  }

  public getConfigFlag<K extends keyof TGraphSettingsConfig>(key: K): TGraphSettingsConfig[K] {
    return this.$settings.value[key];
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
      showConnectionArrows: this.$settings.value.showConnectionArrows,
      bezierConnectionDirection: this.$settings.value.bezierConnectionDirection,
      useTightBezierBounds: this.$settings.value.EXP_USE_TIGHT_BEZIER_BOUNDS,
    };
  });

  public $canDrag = computed(() => this.$settings.value.canDrag);

  public $useBlocksAnchors = computed(() => this.$settings.value.useBlocksAnchors);

  public $renderer: ReadonlySignal<"canvas" | "webgl"> = computed(() => this.$settings.value.renderer);

  /** The `cameraAwareText` setting. */
  public $cameraAwareText: ReadonlySignal<boolean> = computed(() => this.$settings.value.cameraAwareText);

  public $webglBackend: ReadonlySignal<(() => Promise<ISceneBackendModule>) | undefined> = computed(
    () => this.$settings.value.webglBackend
  );

  public $dragThreshold = computed(() => this.$settings.value.dragThreshold);

  public toJSON() {
    return cloneDeep(this.$settings.toJSON());
  }

  public get asConfig(): TGraphSettingsConfig {
    return this.toJSON();
  }

  public reset(keys?: readonly (keyof TGraphSettingsConfig)[]) {
    if (keys === undefined) {
      this.$settings.value = cloneDeep(this.initialSettings);
      return;
    }
    if (keys.length === 0) return;
    const initial = cloneDeep(this.initialSettings);
    const next = { ...this.$settings.value };
    const restore = <K extends keyof TGraphSettingsConfig>(key: K) => {
      next[key] = initial[key];
    };
    keys.forEach(restore);
    this.$settings.value = next;
  }
}
