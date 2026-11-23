import { batch, computed, effect, signal, untracked } from "@preact/signals-core";
import type { ReadonlySignal, Signal } from "@preact/signals-core";

import type { Graph } from "../../graph";
import { Component } from "../../lib/Component";
import type { CoreComponent } from "../../lib/CoreComponent";
import type { TTileRect } from "../../lib/culling/TileIndex";
import { drawElements } from "../../lib/scene/canvas/drawPrimitives";
import { watchSceneLimits } from "../../lib/scene/diagnostics/sceneLimits";
import { SceneRendererLayer } from "../../lib/scene/renderer/SceneRendererLayer";
import type { ISceneBackendModule } from "../../lib/scene/renderer/backendTypes";
import { SceneStore } from "../../lib/scene/store/SceneStore";
import { ignoresCameraAware, styleLookKey } from "../../lib/scene/styles/style";
import { clearSceneTextMetrics } from "../../lib/scene/text/textMetrics";
import type { TSceneChange, TSceneElement, TSceneStyle, TSceneTextPolicy } from "../../lib/scene/types";
import { elementBounds } from "../../lib/scene/utils/elementBounds";
import { HAS_NODE_ENV } from "../../utils/development";
import { noop } from "../../utils/functions";
import { clearMeasureTextCache } from "../../utils/functions/text";
import { track } from "../../utils/functions/track";
import { clearTextCache } from "../../utils/renderers/text";
import type { TRect } from "../../utils/types/shapes";
import type { TCameraState } from "../camera/CameraService";
import { SceneStyleSheet } from "../styles/SceneStyleSheet";
import { StyleResolver } from "../styles/StyleResolver";
import { computeStyle, isStateRule } from "../styles/computeStyle";
import { createThemeRules } from "../styles/themeRules";
import type { TStyleExplanation, TStyleTarget } from "../styles/types";
import { TagStore, entityKey } from "../tags/TagStore";
import type { TEntityAddress, TEntityId, TEntityType, TTagSet } from "../tags/types";
import { cameraWorldViewport } from "../visibilityCulling";

import { DelegatedRanks } from "./DelegatedRanks";
import { SceneClock } from "./SceneClock";
import { isSceneKeyed } from "./sceneKey";
import { createSceneLevel } from "./sceneLevel";
import type {
  IGraphScene,
  ITextMeasurer,
  TSceneElementView,
  TSceneExportPreparer,
  TSceneImageOptions,
  TSceneLevel,
  TSceneQueryOptions,
  TSceneRenderer,
  TSceneRendererState,
  TSceneState,
} from "./types";
import { afterScenePaint } from "./utils/afterScenePaint";
import { createPrimitiveSnapshot } from "./utils/snapshotPrimitive";

/** Canvas limits that hold in current browsers (side and area); larger outputs come back blank, so toImage throws. */
const MAX_IMAGE_SIDE = 16384;
const MAX_IMAGE_AREA = 2 ** 26;

/** The text policies of the `cameraAwareText` setting. */
const TEXT_POLICIES: Readonly<Record<"on" | "off", TSceneTextPolicy>> = Object.freeze({
  on: Object.freeze({ cameraAware: true }),
  off: Object.freeze({ cameraAware: false }),
});

/** One export, resolved from its options: the world rect, the scales, the level and the output size. */
type TSceneImage = {
  readonly rect: TRect;
  readonly scale: number;
  readonly ratio: number;
  readonly level: TSceneLevel;
  readonly currentView: boolean;
  readonly background: string | undefined;
  readonly width: number;
  readonly height: number;
};

/** Whether a step of an export threw, and what. */
type TCameraFrame = { camera: TCameraState; level: TSceneLevel; canvasDpr: number | undefined };

type TOutcome = { failed: boolean; error: unknown };

const UNDO_FAILED = "graph.scene.toImage(): undoing an export's preparation failed";

/**
 * @internal Bench counters of the last `toImage()` (Task 17g): the time its preparers took (the anchors an export
 * creates), the draw and the cleanup. Off by default.
 */
export const sceneExportStats = {
  enabled: false,
  prepareMs: 0,
  drawMs: 0,
  cleanupMs: 0,
};

const defaultLoader = (): Promise<ISceneBackendModule> => import("../../lib/scene/webgl/WebGLSceneBackend");

/** The fields of an update from a row change (`SceneStore.useRow`): the row, its encode key and its raise. */
const ROW_FIELDS: ReadonlySet<keyof TSceneElement> = new Set<keyof TSceneElement>(["styleId", "primitives", "zIndex"]);

/**
 * Whether an update changes the query result of what is nested in the element, which gets no update of its own: its
 * hidden flag, its owner's place (`order`, its bucket) or its place among its siblings. An update without fields may
 * change any of them.
 */
function movesNested(fields: ReadonlySet<keyof TSceneElement> | undefined): boolean {
  return (
    fields === undefined ||
    fields.has("hidden") ||
    fields.has("order") ||
    fields.has("zIndex") ||
    fields.has("childOrder")
  );
}

/**
 * The scene runtime of a graph: the element store, the renderer layer (Canvas2D interpreter or lazily loaded
 * WebGL backend), the scene level and the clock. The graph's frame task updates it after all layers.
 */
export class GraphScene implements IGraphScene {
  /** Tags of graph entities; rules of the stylesheet read them. */
  public readonly tags = new TagStore();

  /** Style rules: target classes, tags, root tags and scopes mapped to part values. */
  public readonly styles = new SceneStyleSheet();

  /** @internal The element store; plan 3's components write to it. */
  public readonly store = new SceneStore();

  /** @internal React ranks (spec §10). */
  public readonly delegatedRanks: DelegatedRanks;

  /** Stops the development errors for the scene limits. */
  private readonly unwatchLimits =
    HAS_NODE_ENV && process.env.NODE_ENV !== "production" ? watchSceneLimits(this.store) : undefined;

  /** Scene time in seconds. */
  public readonly clock: { now(): number };

  public readonly $level: ReadonlySignal<TSceneLevel>;

  public readonly $renderer: ReadonlySignal<TSceneRendererState>;

  private presentationState?: TSceneState;
  private contentPaint?: Promise<void>;

  /** @internal Shared by the frame task and lazy WebGL preparation; entity writes remain synchronous. */
  public get pendingPresentation(): Promise<void> | undefined {
    return this.contentPaint;
  }

  private yieldForContentPaint(): void {
    const doc = this.graph.layers.$root?.ownerDocument;
    if (!this.graph.rootStore.settings.$settings.peek().yieldBeforeSceneLoad || this.contentPaint || !doc || doc.hidden)
      return;
    const pending = afterScenePaint(doc);
    this.contentPaint = pending;
    pending.then(() => {
      if (this.contentPaint === pending) {
        this.contentPaint = undefined;
        this.layer.performRender();
      }
    });
  }

  private transition = 0;
  private attachment = 0;
  private drawnCamera?: TCameraState;
  private replacement = 0;

  /** @internal The snapshot the graph layer starts a frame with. */
  public get contentRevision(): number {
    return this.replacement;
  }

  public get state(): TSceneState {
    return this.presentationState ?? "init";
  }

  private readonly cameraFrame = signal<TCameraFrame | undefined>(undefined);

  /** @internal Camera and pixel grid used by the scene. HTML presents these together at the end of a draw. */
  public readonly $cameraFrame: ReadonlySignal<TCameraFrame | undefined> = this.cameraFrame;

  /** Increments when computed styles may have changed: rules, root tags, the level or a crossed scale threshold. */
  public readonly $styleGeneration: ReadonlySignal<number>;

  /** @internal Global changes that can affect a bound style or an HTML view's cascade. */
  public readonly $styleCascadeGeneration: ReadonlySignal<number>;

  /**
   * The `cameraAwareText` setting: `false` makes every scene text world-sized, whatever its primitive and the styles
   * say. A change redraws the scene; no block rebuilds its look.
   */
  public readonly $cameraAwareText: ReadonlySignal<boolean>;

  /** The text policy renderers and exports draw with, from `$cameraAwareText`. */
  private readonly $textPolicy: ReadonlySignal<TSceneTextPolicy>;

  /** @internal The renderer layer. */
  public readonly layer: SceneRendererLayer;

  private readonly sceneClock = new SceneClock();

  private readonly $scale: ReadonlySignal<number>;

  private readonly resolver: StyleResolver;

  /** Style bindings by entity key, latest last; `explain` reads the target of the latest. */
  private readonly styleBindings = new Map<string, { readonly target: TStyleTarget; readonly elementId: string }[]>();

  /** Unbind functions of live style bindings; dispose() calls them. */
  private readonly styleUnbinds = new Set<() => void>();

  private unsubscribeRenderer?: () => void;
  private readonly stopConfiguredStyles: () => void;

  private readonly unsubscribeBackendState: () => void;

  private stopTheme?: () => void;

  private unfollowVisibility?: () => void;

  /** Components whose level methods measured text; late web fonts run them again. */
  private readonly textMeasurers = new Set<ITextMeasurer>();

  /** What prepares an export before it queries (`Blocks`: the anchors that do not exist yet), in the order added. */
  private readonly exportPreparers = new Set<TSceneExportPreparer>();

  /** Set while `toImage()` prepares, draws and cleans up: a nested call throws. */
  private exporting = false;

  /** Listener to unsubscribe function. Copy on registration changes so a frame visits its original subscriptions. */
  private frameEndListeners = new Map<() => void, () => void>();

  /** One counter per entity type a caller asked for (`revisionOf`); "" for elements without a type. */
  private readonly revisions = new Map<string, Signal<number>>();

  /**
   * Types whose elements changed since the last frame end, whether or not a counter exists yet: a counter first asked
   * for during a frame steps for that frame's earlier changes. "" for elements without a type.
   */
  private readonly changedTypes = new Set<string>();

  /** The type `changedTypes` got last: a run of changes of one type costs one comparison each. */
  private lastChangedType: string | undefined;

  /**
   * Elements whose update moved what is nested in them (`movesNested`) since the last frame end. The types of what is
   * nested in them are resolved once, at the frame's end (`resolveNested`): a store change costs one set insert, and
   * repeated updates of one element walk its nesting once.
   */
  private readonly movedNestings = new Set<string>();

  /** Set by a row rewrite or a dim change since the last frame end: every counter steps. */
  private everyTypeChanged = false;

  /** Stops following the store's element and style changes for `revisions`. */
  private readonly unsubscribeChanges: () => void;

  private disposed = false;

  constructor(private readonly graph: Graph) {
    // The graph's frame task runs every frame while started and calls flush(), so nothing needs waking.
    this.delegatedRanks = new DelegatedRanks(this.store, noop);
    const stopElements = this.store.subscribe((change) => this.noteChange(change));
    const stopStyles = this.store.subscribeStyles((change) => {
      // A rule, level or root-tag change rewrites rows of any type, and the dim colour paints them all.
      if (change === "replace" || change === "dim") this.everyTypeChanged = true;
    });
    this.unsubscribeChanges = (): void => {
      stopElements();
      stopStyles();
    };
    const { settings } = graph.rootStore;
    this.clock = this.sceneClock;
    this.$level = createSceneLevel(graph);
    this.$cameraAwareText = computed(() => settings.$cameraAwareText.value);
    this.$textPolicy = computed(() => (this.$cameraAwareText.value ? TEXT_POLICIES.on : TEXT_POLICIES.off));
    this.layer = graph.layers.createLayer(
      SceneRendererLayer,
      {
        store: this.store,
        clock: this.clock,
        level: this.$level,
        textPolicy: this.$textPolicy,
        onDraw: () => this.frameDrawn(),
        onFontsLoaded: () => this.onFontsLoaded(),
        pendingPresentation: () => this.pendingPresentation,
        renderer: settings.$renderer.value,
        loadBackend: (): Promise<ISceneBackendModule> => (settings.$webglBackend.value ?? defaultLoader)(),
        camera: graph.cameraService,
        graph,
      },
      { selfUpdated: true }
    );
    this.$renderer = this.layer.$state;
    this.unsubscribeBackendState = this.$renderer.subscribe(() => {
      // Includes context loss, restoration, failed draws and font-triggered backend recreation.
      this.drawnCamera = undefined;
      if (this.state === "ready") this.setState("switch");
    });
    this.$scale = computed(() => graph.$camera.value.scale);
    this.resolver = new StyleResolver({
      store: this.store,
      sheet: this.styles,
      tags: this.tags,
      $level: this.$level,
      $scale: this.$scale,
    });
    this.$styleGeneration = this.resolver.$generation;
    this.$styleCascadeGeneration = this.resolver.$cascadeGeneration;

    this.stopConfiguredStyles = effect(() => {
      const targets: (TStyleTarget | undefined)[] = Object.values(settings.$blockComponents.value);
      targets.push(settings.$connection.value);
      untracked(() => this.styles.setConfiguredClasses(targets));
    });
    this.stopTheme = effect(() => {
      const colors = graph.$graphColors.value;
      this.styles.setThemeRules(createThemeRules(colors));
      // `dim` fades elements into the background they are drawn on.
      this.store.setDimColor(colors.canvas.layerBackground);
    });
    let current = settings.$renderer.value;
    this.unsubscribeRenderer = settings.$renderer.subscribe((value) => {
      if (value === current) return;
      current = value;
      if (this.state !== "init") this.setState("switch");
      this.layer.setRenderer(value);
    });
    this.setState("init");
  }

  private setState(state: TSceneState): void {
    this.drawnCamera = undefined;
    if (this.disposed || this.presentationState === state) return;
    this.presentationState = state;
    const transition = ++this.transition;
    const attachment = this.attachment;
    // A subscriber may do application work. Keep it outside rendering and discard obsolete ready events.
    setTimeout(() => {
      if (this.disposed || this.attachment !== attachment || (state === "ready" && this.transition !== transition))
        return;
      this.graph.emit("scene-state-change", { state });
    }, 0);
    if (state === "switch" && this.store.size > 0) this.yieldForContentPaint();
  }

  /** @internal A full snapshot needs its own presented frame, even when both snapshots are empty. */
  public entitiesReplacing(): void {
    if (this.state === "init" || this.disposed) return;
    this.replacement++;
    this.setState("initialize");
    this.yieldForContentPaint();
    this.layer.performRender();
  }

  private frameDrawn(): void {
    if (this.pendingPresentation || (this.state !== "initialize" && this.state !== "switch")) return;
    const camera = this.graph.$camera.peek();
    if (camera.width > 0 && camera.height > 0) this.drawnCamera = camera;
  }

  private readonly finishPresentation = (): void => {
    if (!this.drawnCamera || this.disposed) return;
    // A fit waiting on hit boxes can change the camera after the scene draws, at the end of the scheduler tick.
    if (this.drawnCamera !== this.graph.$camera.peek()) this.drawnCamera = undefined;
    else if (!this.graph.hitTest.hasPendingUpdates()) this.setState("ready");
  };

  /** @internal The physical pixel grid used by the active Canvas2D renderer. WebGL uses fractional positions. */
  public get canvasDpr(): number | undefined {
    return this.$renderer.peek() === "webgl" ? undefined : this.layer.getDRP();
  }

  /** @internal Called by Graph's frame task after layers.update(). */
  public update(contentRevision = this.replacement): void {
    if (this.disposed) return;
    this.delegatedRanks.flush();
    const camera = this.graph.$camera.peek();
    const level = this.$level.peek();
    Component.update(this.layer);
    // A failed WebGL draw can switch to Canvas2D in this very frame.
    const canvasDpr = this.canvasDpr;
    const previous = this.cameraFrame.peek();
    if (previous?.camera !== camera || previous.level !== level || previous.canvasDpr !== canvasDpr) {
      this.cameraFrame.value = { camera, level, canvasDpr };
    }
    // Before the frame-end listeners: a change they make steps at the next frame's end.
    this.stepRevisions();
    this.frameEndListeners.forEach((unsubscribe, listener) => {
      if (this.frameEndListeners.get(listener) !== unsubscribe) return;
      try {
        listener();
      } catch (error) {
        console.error("graph.scene.onFrameEnd: a listener threw", error);
      }
    });
    if (this.drawnCamera) {
      if (contentRevision === this.replacement) queueMicrotask(this.finishPresentation);
      else {
        // A later layer replaced the snapshot after the graph layer had already reconciled the previous one.
        this.drawnCamera = undefined;
        this.layer.performRender();
      }
    }
  }

  public onFrameEnd(listener: () => void): () => void {
    const existing = this.frameEndListeners.get(listener);
    if (existing) return existing;
    const unsubscribe = (): void => {
      if (this.frameEndListeners.get(listener) !== unsubscribe) return;
      this.frameEndListeners = new Map(this.frameEndListeners);
      this.frameEndListeners.delete(listener);
    };
    this.frameEndListeners = new Map(this.frameEndListeners).set(listener, unsubscribe);
    return unsubscribe;
  }

  public revisionOf(entityType: string): ReadonlySignal<number> {
    let counter = this.revisions.get(entityType);
    if (!counter) {
      counter = signal(0);
      this.revisions.set(entityType, counter);
    }
    return counter;
  }

  /**
   * Notes a store change in constant time: the element's type and, for an update that moves what is nested in the
   * element (`movesNested`), the element, whose nesting `resolveNested` reads at the frame's end. A row change between
   * rows that look the same notes nothing; a child-only change never notes its owner.
   */
  private noteChange(change: TSceneChange): void {
    if (change.type === "update" && this.looksTheSame(change)) return;
    const type = change.element.entityType ?? "";
    if (type !== this.lastChangedType) {
      this.lastChangedType = type;
      this.changedTypes.add(type);
    }
    if (change.type === "update" && movesNested(change.fields)) this.movedNestings.add(change.element.id);
  }

  /**
   * An update from a row change (`previousStyleId`, row fields only) whose old and new rows draw the same, whatever the
   * order of their properties and parts (`styleLookKey`): nothing a query reader sees changed. A `primitives` field
   * there is the rows' encode keys differing, which a part order alone can do.
   */
  private looksTheSame(change: TSceneChange): boolean {
    const { fields, previousStyleId } = change;
    if (previousStyleId === undefined || !fields) return false;
    for (const field of fields) {
      if (!ROW_FIELDS.has(field)) return false;
    }
    const styles = this.store.getStyles();
    return styleLookKey(styles[previousStyleId]) === styleLookKey(styles[change.element.styleId]);
  }

  /**
   * Adds the types of what is nested in the moved elements to `changedTypes`, one walk per element; it stops once every
   * counter's type is in, and walks nothing without a counter that needs it. Reads the nesting as it is at the frame's
   * end: what was added, removed or moved meanwhile has changes of its own.
   */
  private resolveNested(): void {
    let missing = 0;
    this.revisions.forEach((_counter, type) => {
      if (!this.changedTypes.has(type)) missing += 1;
    });
    if (missing === 0) return;
    for (const id of this.movedNestings) {
      for (const nested of this.store.childrenOf(id)) {
        const type = nested.entityType ?? "";
        if (!this.revisions.has(type) || this.changedTypes.has(type)) continue;
        this.changedTypes.add(type);
        missing -= 1;
        if (missing === 0) return;
      }
    }
  }

  /**
   * Steps, once and in one batch, the counter of every type that changed since the last frame end (every counter after
   * a row rewrite or a dim change), and clears what was noted first: what the counters' subscribers change steps at the
   * next frame's end. A subscriber that throws is reported; the frame goes on.
   */
  private stepRevisions(): void {
    const every = this.everyTypeChanged;
    if (!every && this.changedTypes.size === 0 && this.movedNestings.size === 0) return;
    if (!every) this.resolveNested();
    const due: Signal<number>[] = [];
    this.revisions.forEach((counter, type) => {
      if (every || this.changedTypes.has(type)) due.push(counter);
    });
    this.everyTypeChanged = false;
    this.changedTypes.clear();
    this.lastChangedType = undefined;
    this.movedNestings.clear();
    if (due.length === 0) return;
    try {
      batch(() => {
        for (const counter of due) counter.value = counter.peek() + 1;
      });
    } catch (error) {
      console.error("graph.scene.revisionOf: a subscriber threw", error);
    }
  }

  /** @internal */
  public start(): void {
    this.setState("initialize");
    this.yieldForContentPaint();
    this.layer.performRender();
    this.sceneClock.resume();
  }

  /** @internal */
  public stop(): void {
    this.contentPaint = undefined;
    if (this.state !== "init") {
      this.attachment++;
      this.setState("init");
    }
    this.sceneClock.pause();
    this.cameraFrame.value = undefined;
  }

  /** @internal Makes the clock follow document visibility until dispose(). */
  public followVisibility(): void {
    if (this.disposed || this.unfollowVisibility || typeof document === "undefined") return;
    this.unfollowVisibility = this.sceneClock.followVisibility(document);
  }

  /** @internal */
  public trackTextMeasure(component: ITextMeasurer): void {
    this.textMeasurers.add(component);
  }

  /** @internal */
  public untrackTextMeasure(component: ITextMeasurer): void {
    this.textMeasurers.delete(component);
  }

  /**
   * @internal Late web fonts (`document.fonts` `loadingdone`): measured widths are stale, so the caches are cleared
   * (widths, the scene's shared text metrics, whose layouts are then laid out again on their next draw, and the wrapped
   * lines of `cachedMeasureText`) and every component that measured text runs its level methods again (spec §4,
   * decision 5). Elements with a heightless text grow their bounds to its lines in the loaded font (`growTextBounds`).
   * The renderer layer redraws or recreates its backend on the same event.
   */
  public onFontsLoaded(): void {
    if (this.disposed) return;
    clearMeasureTextCache();
    clearSceneTextMetrics();
    clearTextCache();
    for (const component of [...this.textMeasurers]) component.invalidateTextMeasures();
    this.growTextBounds();
  }

  /**
   * The bounds of a heightless text cover the lines it had in the metrics of its element's last write; a wider web font
   * can give it more lines. Grows the bounds of every element with a heightless text to cover them in the current
   * metrics (never shrinks them: a writer may have given more).
   */
  private growTextBounds(): void {
    const grown: { id: string; bounds: TTileRect }[] = [];
    this.store.forEach((element) => {
      if (!element.primitives.some((primitive) => primitive.kind === "text" && primitive.height === undefined)) return;
      const text = elementBounds(element.primitives);
      const { bounds } = element;
      const next = {
        minX: Math.min(bounds.minX, text.minX),
        minY: Math.min(bounds.minY, text.minY),
        maxX: Math.max(bounds.maxX, text.maxX),
        maxY: Math.max(bounds.maxY, text.maxY),
      };
      if (next.minX < bounds.minX || next.minY < bounds.minY || next.maxX > bounds.maxX || next.maxY > bounds.maxY) {
        grown.push({ id: element.id, bounds: next });
      }
    });
    for (const { id, bounds } of grown) this.store.update(id, { bounds });
  }

  public setRenderer(renderer: TSceneRenderer): void {
    this.graph.rootStore.settings.setupSettings({ renderer });
  }

  /**
   * @internal Keeps an element's style row on its entity's tags: the element is styled as `target` with the entity's
   * current tags. Returns a function that releases the row, resets the element to row 0 and forgets the binding.
   * A mounted writer binds its record by identity, so releasing it cannot reset a replacement with the same id.
   */
  public bindStyle(
    record: string | TSceneElement,
    entity: TEntityAddress,
    target: TStyleTarget,
    onStyleChange?: (style: TSceneStyle) => void
  ): () => void {
    if (this.disposed) return noop;
    const elementId = typeof record === "string" ? record : record.id;
    const key = entityKey(entity.type, entity.id);
    const binding = { target, elementId };
    const $tags = this.tags.$of(entity.type, entity.id);
    let current = 0;
    let previousTags: TTagSet | undefined;
    let previousStyle: TSceneStyle | undefined;
    const stop = effect(() => {
      const tags = $tags.value;
      if (onStyleChange) track(this.$styleCascadeGeneration);
      untracked(() => {
        const element = this.store.get(elementId);
        if (typeof record !== "string" && element !== record) return;
        if (tags !== previousTags) {
          // Acquire before release: a row both signatures share is not freed and defined again.
          const next = this.resolver.acquire(target, tags);
          // A child's styleId is its drawn row; the row bound here is its own row.
          if (element && this.store.ownStyleOf(elementId) !== next) this.store.setStyle(elementId, next);
          if (current !== 0) this.resolver.release(current);
          current = next;
          previousTags = tags;
        }
        if (element && onStyleChange) {
          const style = this.store.getStyles()[current];
          if (style !== previousStyle) {
            previousStyle = style;
            onStyleChange(style);
          }
        }
      });
    });
    // Recorded after effect(): a throwing first run leaves no binding.
    const bindings = this.styleBindings.get(key) ?? [];
    bindings.push(binding);
    this.styleBindings.set(key, bindings);
    const unbind = (): void => {
      if (!this.styleUnbinds.delete(unbind)) return;
      stop();
      const element = this.store.get(elementId);
      if (element && (typeof record === "string" || element === record)) this.store.setStyle(elementId, 0);
      if (current !== 0) this.resolver.release(current);
      current = 0;
      const list = this.styleBindings.get(key) ?? [];
      const index = list.indexOf(binding);
      if (index >= 0) list.splice(index, 1);
      if (list.length === 0) this.styleBindings.delete(key);
    };
    this.styleUnbinds.add(unbind);
    return unbind;
  }

  /**
   * Why an entity looks the way it does: its tags, the root tags, the class its element is styled as and the matched
   * rules in application order. Without a bound element there is no target, no rules and no style. Reads no signal.
   */
  public explain(entityType: TEntityType, id: TEntityId): TStyleExplanation {
    return untracked((): TStyleExplanation => {
      const tags = this.tags.peekOf(entityType, id);
      const root = this.tags.$root.peek();
      const explanation = {
        tags: [...tags].sort(([a], [b]) => a.id - b.id).map(([tag, value]) => ({ name: tag.name, value })),
        root: [...root].map((tag) => tag.name),
      };
      const bindings = this.styleBindings.get(entityKey(entityType, id));
      const target = bindings?.[bindings.length - 1]?.target;
      // The setting wins over every style: say so, or a reported `cameraAware: true` would mislead.
      const forced = this.$cameraAwareText.peek() ? {} : { cameraAwareText: "forced-off" as const };
      if (!target) return { ...explanation, ...forced, rules: [] };
      const style = this.resolver.styleFor(target, tags);
      // A style's `cameraAware: true` that a heightless text of the element does not take: say so too.
      const element = this.store.get(bindings?.[bindings.length - 1]?.elementId ?? "");
      const ignored = [
        ...new Set(
          (element?.primitives ?? [])
            .filter((primitive) => ignoresCameraAware(primitive, style))
            .map((primitive) => primitive.part as string)
        ),
      ];
      const notApplied = ignored.length > 0 ? { cameraAwareNotApplied: ignored } : {};
      const { matched } = computeStyle({
        rules: this.styles.$rules.peek(),
        target,
        tags,
        root,
        level: this.$level.peek(),
        scale: this.$scale.peek(),
      });
      return {
        ...explanation,
        target: target.name,
        rules: matched.map((ordered) => ({
          theme: ordered.theme,
          priority: ordered.priority,
          layer: isStateRule(ordered.rule) ? "state" : "base",
          tags: (ordered.rule.tags ?? []).map((tag) => tag.name),
        })),
        style,
        ...forced,
        ...notApplied,
      };
    });
  }

  /** The computed style of a target class with the given tags under the current rules, level and scale. */
  public styleFor(target: TStyleTarget, tags: TTagSet): TSceneStyle {
    return this.resolver.styleFor(target, tags);
  }

  private raiseBatches = 0;

  private readonly pendingRaises = new Set<string>();

  /**
   * @internal Gives an element's owner a new highest `order` (spec V3): at once, or at the end of the running
   * `batchRaises`, where all requested owners are raised in their current scene order.
   */
  public requestRaise(elementId: string): void {
    if (this.raiseBatches > 0) this.pendingRaises.add(elementId);
    else this.store.raiseMany([elementId]);
  }

  /** @internal Collects the raises `run` requests and applies them once, in the current scene order. */
  public batchRaises(run: () => void): void {
    this.raiseBatches++;
    try {
      run();
    } finally {
      this.raiseBatches--;
      if (this.raiseBatches === 0 && this.pendingRaises.size > 0) {
        const ids = [...this.pendingRaises];
        this.pendingRaises.clear();
        this.store.raiseMany(ids);
      }
    }
  }

  /**
   * Scene order of two components (spec section 9), the key drawing and hit-testing share: negative when `a` draws
   * below `b`. Components with a scene key compare by their elements' scene order (a child element right above its
   * parent), then by the key's sub-order; other components (groups and layer components) by
   * (zIndex, renderOrder), above scene components of the same zIndex.
   */
  public compareOrder(a: CoreComponent, b: CoreComponent): number {
    const left = this.sceneElementOf(a);
    const right = this.sceneElementOf(b);
    if (left && right) return this.store.compareOrder(left.element, right.element) || left.sub - right.sub;
    const leftZIndex = left ? this.store.zIndexOf(left.element) : a.zIndex;
    const rightZIndex = right ? this.store.zIndexOf(right.element) : b.zIndex;
    if (leftZIndex !== rightZIndex) return leftZIndex - rightZIndex;
    if (left) return -1;
    if (right) return 1;
    return a.renderOrder - b.renderOrder;
  }

  /**
   * A key whose element is not in the store (not written yet, or deleted) gives none: the component then compares by
   * its tree (zIndex, renderOrder), as one without a key.
   */
  private sceneElementOf(component: CoreComponent): { element: TSceneElement; sub: number } | undefined {
    const key = isSceneKeyed(component) ? component.getSceneKey() : undefined;
    const element = key ? this.store.get(key.elementId) : undefined;
    return key && element ? { element, sub: key.sub } : undefined;
  }

  public query(rect: TRect, options: TSceneQueryOptions = {}): readonly TSceneElementView[] {
    const snapshot = createPrimitiveSnapshot();
    return this.queryLive(rect, options).map((element) =>
      Object.freeze({
        id: element.id,
        entityType: element.entityType,
        parent: element.parent,
        nestedIn: element.nestedIn,
        childOrder: element.childOrder,
        x: element.x,
        y: element.y,
        bounds: Object.freeze({ ...element.bounds }),
        primitives: Object.freeze(element.primitives.map(snapshot)),
        zIndex: element.zIndex,
        order: element.order,
        styleId: element.styleId,
        hidden: Boolean(options.includeHidden) && this.store.isDrawnHidden(element),
      })
    );
  }

  /**
   * @internal Borrow store rows for synchronous drawing. Their `hidden` flag describes each row itself.
   * Do not mutate or retain the rows. Use `query()` to keep a snapshot.
   */
  public queryLive(rect: TRect, options: TSceneQueryOptions = {}): readonly TSceneElementView[] {
    const tileRect = { minX: rect.x, minY: rect.y, maxX: rect.x + rect.width, maxY: rect.y + rect.height };
    const types = options.entityTypes;
    const found = this.store.query(tileRect, options.level, undefined, options.includeHidden);
    return types ? found.filter((element) => types.includes(element.entityType ?? "")) : found;
  }

  public drawInterpreted(
    ctx: CanvasRenderingContext2D,
    elements: readonly TSceneElementView[],
    scale: number,
    options: { skipText?: boolean; level?: TSceneLevel; drawHidden?: boolean; textPolicy?: TSceneTextPolicy } = {}
  ): void {
    drawElements(ctx, elements, scale, {
      ...options,
      textPolicy: options.textPolicy ?? this.$textPolicy.peek(),
      styles: this.store.getStyles(),
      dimColor: this.store.getDimColor(),
    });
  }

  /**
   * @internal Adds a function that makes the scene ready for each export before `toImage()` queries it (`Blocks`
   * creates the anchor components the export needs); returns the function that removes it.
   */
  public addExportPreparer(prepare: TSceneExportPreparer): () => void {
    this.exportPreparers.add(prepare);
    return (): void => {
      this.exportPreparers.delete(prepare);
    };
  }

  /**
   * The scene's picture as a new canvas, drawn by the Canvas2D interpreter whatever the renderer: WebGL's drawing
   * buffer is not preserved, and export must not depend on it. For the current view (no `rect`, no `scale`) the visible
   * layer canvases under the scene come first, so the image is what the user sees below the selection and HTML layers;
   * any other rect draws the scene only, including its built-in connections.
   *
   * The picture does not depend on where the camera has been (Task 17g): the anchor components a block creates lazily
   * are created for the export when its rect and level need them, through their normal lifecycle, and dropped again
   * after the draw, also when the draw throws. Styles are those of the export's level and scale. A call made while
   * another export runs (from a component hook it triggers) throws. So does a call from a block's own lifecycle hook
   * (stateChanged, willIterate, ...) when that block has to create anchors for the export: entering its update again
   * would run its hooks twice. Calls from outside that block's update work: a layer's render(), an event handler,
   * another component's hook.
   *
   * Contracts of the anchors an export creates: the search uses the anchor classes a block's `getAnchorClass` override
   * returned in the block's last update (a block whose classes are unknown is a candidate), the construction can call
   * it again, and a throw there aborts the export. A look that reaches farther than `Anchor.LOOK_EXTENT` (a subclass,
   * or a larger `SIZE`/`LINE_WIDTH`) needs its own declared `LOOK_EXTENT`, or the export can miss the anchor near the
   * crop edge; development builds warn naming the class.
   */
  public toImage(options: TSceneImageOptions = {}): HTMLCanvasElement {
    // Untracked: an effect that exports does not follow the signals the anchors' lifecycle reads.
    return untracked(() => this.exportImage(options));
  }

  private exportImage(options: TSceneImageOptions): HTMLCanvasElement {
    if (this.exporting) {
      throw new Error("graph.scene.toImage() cannot be called while another toImage() prepares, draws or cleans up");
    }
    const image = this.imageOf(options);
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("graph.scene.toImage() needs a 2D canvas context");
    const stats =
      HAS_NODE_ENV && process.env.NODE_ENV !== "production" && sceneExportStats.enabled ? sceneExportStats : undefined;
    let start = stats ? performance.now() : 0;
    const lap = (): number => {
      const now = performance.now();
      const ms = now - start;
      start = now;
      return ms;
    };
    this.exporting = true;
    const cleanups: (() => void)[] = [];
    const outcome: TOutcome = { failed: false, error: undefined };
    try {
      // Each cleanup is kept as soon as its preparer returns: a later preparer that throws undoes the earlier ones.
      for (const prepare of [...this.exportPreparers]) {
        const cleanup = prepare({ rect: image.rect, level: image.level });
        if (cleanup) cleanups.push(cleanup);
      }
      if (stats) stats.prepareMs = lap();
      this.drawImage(ctx, image);
      if (stats) stats.drawMs = lap();
    } catch (error) {
      outcome.failed = true;
      outcome.error = error;
    }
    const undone = this.undoExport(cleanups);
    this.exporting = false;
    if (stats) stats.cleanupMs = lap();
    if (outcome.failed) {
      // The draw's (or a preparer's) exception is the call's; a cleanup that failed after it is only reported.
      if (undone.failed) console.error(UNDO_FAILED, undone.error);
      throw outcome.error;
    }
    if (undone.failed) throw undone.error;
    return canvas;
  }

  /**
   * Runs an export's cleanups, last prepared first, all of them; returns the first exception and logs the later ones.
   */
  private undoExport(cleanups: readonly (() => void)[]): TOutcome {
    const outcome: TOutcome = { failed: false, error: undefined };
    for (const cleanup of [...cleanups].reverse()) {
      try {
        cleanup();
      } catch (error) {
        if (outcome.failed) console.error(UNDO_FAILED, error);
        else {
          outcome.failed = true;
          outcome.error = error;
        }
      }
    }
    return outcome;
  }

  /** The export's rect, scales, level and size; throws a `RangeError` for invalid or too large ones. */
  private imageOf(options: TSceneImageOptions): TSceneImage {
    const camera = this.graph.cameraService.getCameraState();
    const currentView = options.rect === undefined && options.scale === undefined;
    const scale = options.scale ?? camera.scale;
    const viewport = cameraWorldViewport(camera, currentView ? this.canvasDpr : undefined);
    const rect = options.rect ?? {
      x: viewport.minX,
      y: viewport.minY,
      width: camera.width / camera.scale,
      height: camera.height / camera.scale,
    };
    const ratio = options.pixelRatio ?? this.graph.layers.getDPR();
    for (const [name, value] of [
      ["scale", scale],
      ["pixelRatio", ratio],
    ] as const) {
      if (!Number.isFinite(value) || value <= 0) {
        throw new RangeError(`graph.scene.toImage(): ${name} must be a positive finite number, got ${value}`);
      }
    }
    const width = Math.max(1, Math.ceil(rect.width * scale * ratio));
    const height = Math.max(1, Math.ceil(rect.height * scale * ratio));
    if (width > MAX_IMAGE_SIDE || height > MAX_IMAGE_SIDE || width * height > MAX_IMAGE_AREA) {
      throw new RangeError(
        `graph.scene.toImage(): ${width} x ${height} pixels exceed the canvas limits (${MAX_IMAGE_SIDE} per side, ` +
          `${MAX_IMAGE_AREA} in total); pass a smaller rect, scale or pixelRatio`
      );
    }
    const level = options.level ?? this.$level.peek();
    return { rect, scale, ratio, level, currentView, background: options.background, width, height };
  }

  /** Draws an export into its canvas: the background, the layers under the scene for the current view, the scene. */
  private drawImage(ctx: CanvasRenderingContext2D, image: TSceneImage): void {
    const { rect, scale, ratio, level, width, height } = image;
    if (image.background !== undefined) {
      ctx.fillStyle = image.background;
      ctx.fillRect(0, 0, width, height);
    }
    if (image.currentView) {
      for (const below of this.canvasesBelow()) ctx.drawImage(below, 0, 0, width, height);
    }
    const k = scale * ratio;
    ctx.setTransform(k, 0, 0, k, -rect.x * k, -rect.y * k);
    const tileRect = { minX: rect.x, minY: rect.y, maxX: rect.x + rect.width, maxY: rect.y + rect.height };
    // The rows as they compute at the export's level and scale, which need not be the live ones; children whose parent
    // row needs composition only there draw with rows added for the export.
    const { styles, childRows } = this.store.stylesWith(this.resolver.stylesAt(level, scale));
    const found = this.store.query(tileRect, level, styles);
    const elements =
      childRows.size === 0
        ? found
        : found.map((element) => {
            const styleId = childRows.get(element.id);
            return styleId === undefined ? element : { ...element, styleId };
          });
    // Texts lay out at the export's scale under the setting, as the renderer would draw them there.
    const textPolicy = this.$textPolicy.peek();
    drawElements(ctx, elements, scale, { styles, dimColor: this.store.getDimColor(), level, textPolicy });
  }

  /**
   * The canvases of visible layers that lie under the scene canvas on screen: a lower CSS zIndex, or the same one and
   * added earlier (layers attach their canvases in the order they were created). Canvases without pixels are skipped.
   */
  private canvasesBelow(): HTMLCanvasElement[] {
    const layers = this.graph.layers.getLayers();
    // The scene canvas follows the GraphLayer canvas in the DOM, whether or not the list holds the layer.
    const listed = layers.indexOf(this.layer);
    const own = listed >= 0 ? listed : layers.indexOf(this.graph.getGraphLayer()) + 0.5;
    const zIndexOf = (canvas: HTMLCanvasElement): number => Number(canvas.style.zIndex) || 0;
    const ownCanvas = this.layer.getCanvas();
    const ownZIndex = ownCanvas ? zIndexOf(ownCanvas) : 0;
    return layers
      .map((layer, index) => ({ layer, index, canvas: layer.getCanvas() }))
      .filter(
        ({ layer, index, canvas }) =>
          layer !== this.layer &&
          canvas !== undefined &&
          !layer.isHidden() &&
          canvas.width > 0 &&
          canvas.height > 0 &&
          (zIndexOf(canvas) < ownZIndex || (zIndexOf(canvas) === ownZIndex && index < own))
      )
      .sort(
        (a, b) => zIndexOf(a.canvas as HTMLCanvasElement) - zIndexOf(b.canvas as HTMLCanvasElement) || a.index - b.index
      )
      .map(({ canvas }) => canvas as HTMLCanvasElement);
  }

  /** @internal */
  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.contentPaint = undefined;
    this.drawnCamera = undefined;
    this.unsubscribeChanges();
    this.unsubscribeBackendState();
    this.changedTypes.clear();
    this.movedNestings.clear();
    this.unwatchLimits?.();
    this.delegatedRanks.dispose();
    this.unsubscribeRenderer?.();
    this.unsubscribeRenderer = undefined;
    this.stopConfiguredStyles();
    this.stopTheme?.();
    this.stopTheme = undefined;
    this.unfollowVisibility?.();
    this.unfollowVisibility = undefined;
    this.textMeasurers.clear();
    this.exportPreparers.clear();
    this.frameEndListeners.clear();
    for (const unbind of [...this.styleUnbinds]) unbind();
    this.resolver.dispose();
    this.tags.dispose();
    this.graph.layers.removeLayer(this.layer);
  }
}
