import { signal } from "@preact/signals-core";
import type { ReadonlySignal } from "@preact/signals-core";

import { Layer } from "../../services/Layer";
import type { LayerProps } from "../../services/Layer";
import type { TTileRect } from "../culling/TileIndex";

import type { SceneStore } from "./SceneStore";
import { drawElements } from "./drawPrimitives";
import type { TSceneChange, TSceneStyle } from "./types";
import type { ISceneBackend, ISceneBackendModule, TSceneBackendEvents } from "./webgl/backendTypes";

export type TSceneRenderer = "canvas" | "webgl";
export type TSceneRendererState = "canvas" | "loading" | "webgl" | "lost" | "restoring" | "webgl-fallback";

export type TSceneRendererLayerProps = LayerProps & {
  store: SceneStore;
  renderer?: TSceneRenderer;
  /** Lazy backend import; tests inject a fake. */
  loadBackend?: () => Promise<ISceneBackendModule>;
};

const defaultLoadBackend = (): Promise<ISceneBackendModule> => import("./webgl/WebGLSceneBackend");

/**
 * Draws a SceneStore with the Canvas2D interpreter or with a lazily loaded WebGL backend, and falls back to the
 * interpreter when WebGL is unavailable or its context is lost.
 */
export class SceneRendererLayer extends Layer<TSceneRendererLayerProps> {
  public readonly $state: ReadonlySignal<TSceneRendererState>;

  private readonly rendererState = signal<TSceneRendererState>("canvas");
  private requested: TSceneRenderer;
  private backend?: ISceneBackend;
  private lastStyles?: readonly TSceneStyle[];
  /** Bumped by every load and every leave of webgl: a load that finds another token is stale. */
  private loadToken = 0;
  private readonly start = performance.now();

  constructor(props: TSceneRendererLayerProps) {
    super({
      ...props,
      canvas: { zIndex: 2, respectPixelRatio: true, transformByCameraPosition: true, ...props.canvas },
    });
    this.$state = this.rendererState;
    this.requested = props.renderer ?? "canvas";
  }

  public getBackend(): ISceneBackend | undefined {
    return this.backend;
  }

  public setRenderer(renderer: TSceneRenderer): void {
    this.requested = renderer;
    if (renderer === "canvas") {
      this.loadToken++;
      this.disposeBackend();
      this.rendererState.value = "canvas";
      this.performRender();
      return;
    }
    if (!this.attached) return;
    if (this.rendererState.value === "canvas" || this.rendererState.value === "webgl-fallback") {
      this.rendererState.value = "loading";
      this.loadBackend().catch(() => undefined);
    }
  }

  protected afterInit(): void {
    // The layer's onSignal() disposes any { subscribe } source when the layer unmounts.
    this.onSignal(
      { subscribe: (listener: (change: TSceneChange) => void) => this.props.store.subscribe(listener) },
      (change) => {
        const backend = this.backend;
        if (this.rendererState.value === "webgl" && backend) {
          try {
            backend.apply(change);
          } catch (error) {
            this.failBackend(error);
          }
        }
        this.performRender();
      }
    );
    super.afterInit();
    if (this.requested === "webgl") this.setRenderer("webgl");
  }

  /** Runs on unmount, detach and re-attach: the backend and its canvas belong to one attachment. */
  protected unmountLayer(): void {
    this.loadToken++;
    this.disposeBackend();
    this.rendererState.value = "canvas";
    super.unmountLayer();
  }

  protected render(): void {
    super.render();
    if (this.rendererState.value === "webgl" && this.backend) {
      try {
        this.drawWebGL(this.backend);
      } catch (error) {
        this.failBackend(error);
        this.drawInterpreter();
      }
    } else {
      this.drawInterpreter();
    }
  }

  private drawWebGL(backend: ISceneBackend): void {
    const store = this.props.store;
    const styles = store.getStyles();
    if (styles !== this.lastStyles) {
      this.lastStyles = styles;
      backend.setStyles(styles);
    }
    const { width, height, x, y, scale } = this.props.graph.cameraService.getCameraState();
    const time = (performance.now() - this.start) / 1000;
    if (backend.draw({ width, height, x, y, scale, dpr: this.getDRP(), time })) this.performRender();
  }

  private drawInterpreter(): void {
    const ctx = this.context.ctx;
    if (!ctx) return;
    const scale = this.props.graph.cameraService.getCameraScale();
    const store = this.props.store;
    drawElements(ctx, store.query(this.getWorldViewport()), scale, { styles: store.getStyles() });
  }

  private getWorldViewport(): TTileRect {
    const { x, y, width, height, scale } = this.props.graph.cameraService.getCameraState();
    return { minX: -x / scale, minY: -y / scale, maxX: (width - x) / scale, maxY: (height - y) / scale };
  }

  /** A backend call threw after load (capacity limits, GL errors): drop the backend and draw with Canvas2D. */
  private failBackend(error: unknown): void {
    this.loadToken++;
    this.disposeBackend();
    console.warn("WebGL scene backend failed, drawing with Canvas2D", error);
    this.rendererState.value = "webgl-fallback";
  }

  private disposeBackend(): void {
    this.backend?.dispose();
    this.backend = undefined;
    this.lastStyles = undefined;
  }

  private readonly createEvents = (token: number): TSceneBackendEvents => ({
    onLost: () => {
      if (token !== this.loadToken || this.rendererState.value !== "webgl") return;
      this.rendererState.value = "lost";
      this.performRender();
    },
    onRestored: () => {
      if (token !== this.loadToken || this.rendererState.value !== "lost") return;
      this.rendererState.value = "restoring";
      this.disposeBackend();
      this.performRender();
      this.loadBackend().catch(() => undefined);
    },
  });

  private async loadBackend(): Promise<void> {
    const token = ++this.loadToken;
    let created: ISceneBackend | undefined;
    try {
      const module = await (this.props.loadBackend ?? defaultLoadBackend)();
      created = await module.createSceneBackend(this.requireCanvas(), this.createEvents(token));
      if (token !== this.loadToken) {
        created.dispose();
        return;
      }
      created.replay(this.props.store);
      this.backend = created;
      this.lastStyles = undefined;
      this.rendererState.value = "webgl";
    } catch (error) {
      created?.dispose();
      if (token !== this.loadToken) return;

      console.warn("WebGL scene backend is unavailable, drawing with Canvas2D", error);
      this.backend = undefined;
      this.rendererState.value = "webgl-fallback";
    }
    this.performRender();
  }
}
