import { computed, effect, untracked } from "@preact/signals-core";
import type { ReadonlySignal } from "@preact/signals-core";

import type { Graph } from "../../graph";
import { Component } from "../../lib/Component";
import { SceneRendererLayer } from "../../lib/scene/SceneRendererLayer";
import { SceneStore } from "../../lib/scene/SceneStore";
import { drawElements } from "../../lib/scene/drawPrimitives";
import type { TSceneStyle } from "../../lib/scene/types";
import type { ISceneBackendModule } from "../../lib/scene/webgl/backendTypes";
import type { TRect } from "../../utils/types/shapes";
import { SceneStyleSheet } from "../styles/SceneStyleSheet";
import { StyleResolver } from "../styles/StyleResolver";
import { computeStyle, isStateRule } from "../styles/computeStyle";
import { createThemeRules } from "../styles/themeRules";
import type { TStyleExplanation, TStyleTarget } from "../styles/types";
import { TagStore, entityKey } from "../tags/TagStore";
import type { TEntityAddress, TEntityId, TEntityType, TTagSet } from "../tags/types";

import { SceneClock } from "./SceneClock";
import { createSceneLevel } from "./sceneLevel";
import type { IGraphScene, TSceneElementView, TSceneLevel, TSceneRenderer, TSceneRendererState } from "./types";

const defaultLoader = (): Promise<ISceneBackendModule> => import("../../lib/scene/webgl/WebGLSceneBackend");

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

  /** Scene time in seconds. */
  public readonly clock: { now(): number };

  public readonly $level: ReadonlySignal<TSceneLevel>;

  public readonly $renderer: ReadonlySignal<TSceneRendererState>;

  /** Increments when computed styles may have changed: rules, root tags, the level or a crossed scale threshold. */
  public readonly $styleGeneration: ReadonlySignal<number>;

  /** @internal The renderer layer. */
  public readonly layer: SceneRendererLayer;

  private readonly sceneClock = new SceneClock();

  private readonly $scale: ReadonlySignal<number>;

  private readonly resolver: StyleResolver;

  /** Style bindings by entity key, latest last; `explain` reads the target of the latest. */
  private readonly styleBindings = new Map<string, { readonly target: TStyleTarget }[]>();

  /** Unbind functions of live style bindings; dispose() calls them. */
  private readonly styleUnbinds = new Set<() => void>();

  private unsubscribeRenderer?: () => void;

  private stopTheme?: () => void;

  private unfollowVisibility?: () => void;

  private disposed = false;

  constructor(private readonly graph: Graph) {
    const { settings } = graph.rootStore;
    this.clock = this.sceneClock;
    this.layer = graph.layers.createLayer(
      SceneRendererLayer,
      {
        store: this.store,
        clock: this.clock,
        renderer: settings.$renderer.value,
        loadBackend: (): Promise<ISceneBackendModule> => (settings.$webglBackend.value ?? defaultLoader)(),
        camera: graph.cameraService,
        graph,
      },
      { selfUpdated: true }
    );
    this.$renderer = this.layer.$state;
    this.$level = createSceneLevel(graph);
    this.$scale = computed(() => graph.$camera.value.scale);
    this.resolver = new StyleResolver({
      store: this.store,
      sheet: this.styles,
      tags: this.tags,
      $level: this.$level,
      $scale: this.$scale,
    });
    this.$styleGeneration = this.resolver.$generation;

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
      this.layer.setRenderer(value);
    });
  }

  /** @internal Called by Graph's frame task after layers.update(). */
  public update(): void {
    if (this.disposed) return;
    Component.update(this.layer);
  }

  /** @internal */
  public start(): void {
    this.sceneClock.resume();
  }

  /** @internal */
  public stop(): void {
    this.sceneClock.pause();
  }

  /** @internal Makes the clock follow document visibility until dispose(). */
  public followVisibility(): void {
    if (this.disposed || this.unfollowVisibility || typeof document === "undefined") return;
    this.unfollowVisibility = this.sceneClock.followVisibility(document);
  }

  public setRenderer(renderer: TSceneRenderer): void {
    this.graph.rootStore.settings.setupSettings({ renderer });
  }

  /**
   * @internal Keeps an element's style row on its entity's tags: the element is styled as `target` with the entity's
   * current tags. Returns a function that releases the row, resets the element to row 0 and forgets the binding.
   * Add the element first: a tag change sets the row of an element that exists, binding does not wait for one.
   */
  public bindStyle(elementId: string, entity: TEntityAddress, target: TStyleTarget): () => void {
    const key = entityKey(entity.type, entity.id);
    const binding = { target };
    const bindings = this.styleBindings.get(key) ?? [];
    bindings.push(binding);
    this.styleBindings.set(key, bindings);
    const $tags = this.tags.$of(entity.type, entity.id);
    let current = 0;
    const stop = effect(() => {
      const tags = $tags.value;
      untracked(() => {
        // Acquire before release: a row both signatures share is not freed and defined again.
        const next = this.resolver.acquire(target, tags);
        if (this.store.get(elementId)) this.store.setStyle(elementId, next);
        if (current !== 0) this.resolver.release(current);
        current = next;
      });
    });
    const unbind = (): void => {
      if (!this.styleUnbinds.delete(unbind)) return;
      stop();
      if (this.store.get(elementId)) this.store.setStyle(elementId, 0);
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
      const tags = this.tags.$of(entityType, id).peek();
      const root = this.tags.$root.peek();
      const explanation = {
        tags: [...tags].sort(([a], [b]) => a.id - b.id).map(([tag, value]) => ({ name: tag.name, value })),
        root: [...root].map((tag) => tag.name),
      };
      const bindings = this.styleBindings.get(entityKey(entityType, id));
      const target = bindings?.[bindings.length - 1]?.target;
      if (!target) return { ...explanation, rules: [] };
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
        style: this.resolver.styleFor(target, tags),
      };
    });
  }

  /** The computed style of a target class with the given tags under the current rules, level and scale. */
  public styleFor(target: TStyleTarget, tags: TTagSet): TSceneStyle {
    return this.resolver.styleFor(target, tags);
  }

  public query(rect: TRect): readonly TSceneElementView[] {
    const tileRect = { minX: rect.x, minY: rect.y, maxX: rect.x + rect.width, maxY: rect.y + rect.height };
    return this.store.query(tileRect).map((element) =>
      Object.freeze({
        id: element.id,
        x: element.x,
        y: element.y,
        bounds: element.bounds,
        primitives: element.primitives,
        zIndex: element.zIndex,
        order: element.order,
        styleId: element.styleId,
        hidden: element.hidden,
      })
    );
  }

  public drawInterpreted(
    ctx: CanvasRenderingContext2D,
    elements: readonly TSceneElementView[],
    scale: number,
    options: { skipText?: boolean } = {}
  ): void {
    const visible = options.skipText
      ? elements.map((element) => ({
          ...element,
          primitives: element.primitives.filter((primitive) => primitive.kind !== "text"),
        }))
      : elements;
    drawElements(ctx, visible, scale, { styles: this.store.getStyles(), dimColor: this.store.getDimColor() });
  }

  /** @internal */
  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.unsubscribeRenderer?.();
    this.unsubscribeRenderer = undefined;
    this.stopTheme?.();
    this.stopTheme = undefined;
    this.unfollowVisibility?.();
    this.unfollowVisibility = undefined;
    for (const unbind of [...this.styleUnbinds]) unbind();
    this.resolver.dispose();
    this.tags.dispose();
    this.graph.layers.removeLayer(this.layer);
  }
}
