import type { ReadonlySignal } from "@preact/signals-core";

import type { Graph } from "../../graph";
import { Component } from "../../lib/Component";
import { SceneRendererLayer } from "../../lib/scene/SceneRendererLayer";
import { SceneStore } from "../../lib/scene/SceneStore";
import { drawElements } from "../../lib/scene/drawPrimitives";
import type { ISceneBackendModule } from "../../lib/scene/webgl/backendTypes";
import type { TRect } from "../../utils/types/shapes";

import { SceneClock } from "./SceneClock";
import { createSceneLevel } from "./sceneLevel";
import type { IGraphScene, TSceneElementView, TSceneLevel, TSceneRenderer, TSceneRendererState } from "./types";

const defaultLoader = (): Promise<ISceneBackendModule> => import("../../lib/scene/webgl/WebGLSceneBackend");

/**
 * The scene runtime of a graph: the element store, the renderer layer (Canvas2D interpreter or lazily loaded
 * WebGL backend), the scene level and the clock. The graph's frame task updates it after all layers.
 */
export class GraphScene implements IGraphScene {
  /** @internal The element store; plan 3's components write to it. */
  public readonly store = new SceneStore();

  /** Scene time in seconds. */
  public readonly clock: { now(): number };

  public readonly $level: ReadonlySignal<TSceneLevel>;

  public readonly $renderer: ReadonlySignal<TSceneRendererState>;

  /** @internal The renderer layer. */
  public readonly layer: SceneRendererLayer;

  private readonly sceneClock = new SceneClock();

  private unsubscribeRenderer?: () => void;

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
    drawElements(ctx, visible, scale, { styles: this.store.getStyles() });
  }

  /** @internal */
  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.unsubscribeRenderer?.();
    this.unsubscribeRenderer = undefined;
    this.unfollowVisibility?.();
    this.unfollowVisibility = undefined;
    this.graph.layers.removeLayer(this.layer);
  }
}
