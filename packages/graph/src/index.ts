export {
  Anchor,
  type TAnchor,
  type TAnchorClass,
  type TAnchorProps,
  type TAnchorView,
} from "./components/canvas/anchors";
export {
  Block as CanvasBlock,
  isTBlock,
  type BlockViewState,
  type TBlock,
  type TBlockComponentState,
  type TBlockLook,
  type TBlockProps,
  type TBlockView,
  type TBlockViewOptions,
  type THtmlViewRequest,
} from "./components/canvas/blocks/Block";
export { LegacyCanvasBlock } from "./components/canvas/blocks/LegacyCanvasBlock";
export { GraphComponent, type TGraphComponentProps } from "./components/canvas/GraphComponent";
export {
  isWithinComponent,
  pointerTargetAfter,
  type TGraphHoverDetail,
} from "./components/canvas/EventedComponent/EventedComponent";
export { getEventTarget } from "./components/canvas/EventedComponent/eventTarget";
export * from "./components/canvas/connections";
export * from "./graph";
export { layerConfig, type LayerConfig } from "./services/LayerConfig";
export type {
  GraphComponentConstructor,
  TGraphColorsPatch,
  TGraphConstantsPatch,
  TGraphColors,
  TGraphConstants,
  TMouseWheelBehavior,
} from "./graphConfig";
export type {
  TResolveWheelIntent,
  TResolveWheelIntentOptions,
  TWheelIntentDebugEntry,
  TWheelInputDevice,
  TWheelIntentRule,
} from "./utils/functions/wheelIntent";
export {
  createWheelIntentResolver,
  enableWheelIntentDebug,
  isPinchZoomGesture,
  isI3WheelIntentRule,
  isI4WheelIntentRule,
  EWheelIntent,
  WHEEL_INTENT_RULE,
} from "./utils/functions/wheelIntent";
export {
  type UnwrapGraphEventsDetail,
  type SelectionEvent,
  type GraphEventsDefinitions,
  type UnwrapGraphEvents,
} from "./graphEvents";
export {
  defaultGetCameraBlockScaleLevel,
  ECameraScaleLevel,
  type TGetCameraBlockScaleLevel,
  type ICamera,
  type TCameraState,
} from "./services/camera/CameraService";
export * from "./services/Layer";
export type { CameraPoint } from "./services/camera/CameraPoint";
export * from "./store";
export { EAnchorType } from "./store/anchor/Anchor";
export type { BlockState, TBlockId } from "./store/block/Block";
export type { ConnectionState, TConnection, TConnectionId } from "./store/connection/ConnectionState";
export type { AnchorState } from "./store/anchor/Anchor";
export { anchorEntityId, parseAnchorEntityId, type TAnchorAddress } from "./store/anchor/anchorEntityId";
export type { PortState, TPort, TPortId } from "./store/connection/port/Port";
export { createAnchorPortId, createBlockPointPortId, createPortId } from "./store/connection/port/utils";
export { ECanDrag } from "./store/settings";
export { getFontSize, measureText, type TMeasureTextOptions, type TWrapText } from "./utils/functions/text";
export type { TBlockGeometrySnapshot } from "./store/block/BlocksList";
export { ESchedulerPriority } from "./lib/Scheduler";
export { computeCssVariable, debounce, throttle, schedule } from "./utils/functions";
export { GRAPH_INSTANCE_SYMBOL_KEY, GRAPH_ROOT_CLASS_NAME } from "./utils/graphInstance";
export * from "./utils/renderers/text";
export { EVENTS } from "./utils/types/events";
export { Point, Rect, type TPoint, type TRect } from "./utils/types/shapes";
export { ESelectionStrategy } from "./services/selection/types";
export type {
  IGraphScene,
  ITextMeasurer,
  TSceneImageOptions,
  TSceneElementView,
  TSceneLevel,
  TSceneQueryOptions,
  TSceneRenderer,
  TSceneRendererState,
  TSceneState,
} from "./services/scene/types";
export type { ISceneKeyed, TSceneKey } from "./services/scene/sceneKey";
export { SceneComponent } from "./components/canvas/scene";
export type { TSceneParent } from "./components/canvas/scene";
export {
  defineTag,
  entityKey,
  selectedTag,
  hoveredTag,
  draggingTag,
  dropTargetTag,
  connectionSourceTag,
  connectionTargetTag,
  getEntityAddress,
} from "./services/tags";
// Types only: the graph creates its own tag store and stylesheet (`graph.scene.tags`, `graph.scene.styles`).
export type { TagStore } from "./services/tags/TagStore";
export type {
  TEntityAddress,
  TEntityId,
  TEntityType,
  TTag,
  TTagIds,
  TTagMembers,
  TTagSet,
} from "./services/tags/types";
export type { SceneStyleSheet, TOrderedRule } from "./services/styles/SceneStyleSheet";
export { createThemeRules } from "./services/styles/themeRules";
export type {
  TPartsOf,
  TRuleStyle,
  TStyleExplanation,
  TStyleParts,
  TStyleRule,
  TStyleScope,
  TStyleTarget,
  TTagValues,
} from "./services/styles/types";
export type {
  TSceneCameraAware,
  TSceneMotion,
  TSceneOutline,
  TScenePartStyle,
  TScenePrimitive,
  TSceneSize,
  TSceneSpriteEffect,
  TSceneStroke,
  TSceneStyle,
  TSceneElement,
  TSceneStyleChange,
  TSceneTextPolicy,
} from "./lib/scene/types";
/** @internal Shared with the React block view. */
export { blockOutlineSegments, blockOutlineStrokes } from "./lib/scene/blockOutline";
export type { ISceneBackendModule, TSceneBackendStats, TSceneTextFrame } from "./lib/scene/webgl/backendTypes";
export * from "./utils/shapes";
export { applyAlpha, clearColorCache } from "./utils/functions/color";

export * from "./components/canvas/groups";

export * from "./lib/Component";

export * from "./services/selection/index.public";

export type { PublicGraphApi, ZoomConfig } from "./api/PublicGraphApi";
export type { RecursivePartial } from "./utils/types/helpers";
export type { TDebounceOptions, TScheduleOptions } from "./utils/utils/schedule";

export type { GraphClassConstructor, Class, Interface } from "./utils/types/classes";
export { CoreComponent } from "./lib/CoreComponent";
export type {
  ComponentOptions,
  ComponentConstructor,
  ComponentProps,
  ComponentDescriptor,
  ChildDescriptor,
} from "./lib/CoreComponent";
export type { TComponentMode } from "./lib/CoreComponent";
export type { TTreeCullingOptions } from "./lib/culling/TreeCulling";
export type { TTileRect } from "./lib/culling/TileIndex";
