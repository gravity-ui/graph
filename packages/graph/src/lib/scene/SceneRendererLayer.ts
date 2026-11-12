import { signal } from "@preact/signals-core";
import type { ReadonlySignal } from "@preact/signals-core";

import { Layer } from "../../services/Layer";
import type { LayerProps } from "../../services/Layer";
import type { TTileRect } from "../culling/TileIndex";

import type { SceneStore } from "./SceneStore";
import { drawElements } from "./drawPrimitives";
import type { TSceneChange, TSceneRenderer, TSceneRendererState, TSceneStyle } from "./types";
import type { ISceneBackend, ISceneBackendModule, TSceneBackendEvents } from "./webgl/backendTypes";

export type TSceneRendererLayerProps = LayerProps & {
  store: SceneStore;
  renderer?: TSceneRenderer;
  /** Lazy backend import; tests inject a fake. */
  loadBackend?: () => Promise<ISceneBackendModule>;
  /** Source of `frame.time` in seconds (the graph clock). Without it the layer uses its own clock. */
  clock?: { now(): number };
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
  /** A context loss that arrived while the backend of the current load was being created. */
  private pendingLoss = false;
  private readonly start = performance.now();

  constructor(props: TSceneRendererLayerProps) {
    super({
      ...props,
      canvas: {
        zIndex: 2,
        respectPixelRatio: true,
        transformByCameraPosition: true,
        classNames: ["no-user-select", "no-pointer-events"],
        ...props.canvas,
      },
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
    // A change of table properties only (a colour, `visible` or `dim` from a tag, rule or theme, or the dim colour)
    // updates no element: the next frame reads the new rows and colour (the WebGL backend uploads its style table when
    // it draws).
    this.onSignal(
      { subscribe: (listener: (value: void) => void) => this.props.store.subscribeStyles(() => listener()) },
      () => this.performRender()
    );
    const fonts = typeof document === "undefined" ? undefined : document.fonts;
    if (fonts) {
      fonts.addEventListener("loadingdone", this.handleFontsLoaded, { signal: this.eventAbortController.signal });
    }
    super.afterInit();
    if (this.requested === "webgl") this.setRenderer("webgl");
  }

  /** Runs on unmount, detach and re-attach: the backend and its canvas belong to one attachment. */
  protected unmountLayer(): void {
    this.loadToken++;
    this.pendingLoss = false;
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

  /** Late web fonts: the glyph atlas is stale, so the backend is recreated and replays the store. */
  private readonly handleFontsLoaded = (): void => {
    if (this.rendererState.value !== "webgl") return;
    this.disposeBackend();
    this.rendererState.value = "restoring";
    this.performRender();
    this.loadBackend().catch(() => undefined);
  };

  private drawWebGL(backend: ISceneBackend): void {
    const store = this.props.store;
    const styles = store.getStyles();
    if (styles !== this.lastStyles) {
      this.lastStyles = styles;
      backend.setStyles(styles);
    }
    const { width, height, x, y, scale } = this.props.graph.cameraService.getCameraState();
    const time = this.props.clock ? this.props.clock.now() : (performance.now() - this.start) / 1000;
    const dimColor = store.getDimColor();
    if (backend.draw({ width, height, x, y, scale, dpr: this.getDRP(), time, dimColor })) this.performRender();
  }

  private drawInterpreter(): void {
    const ctx = this.context.ctx;
    if (!ctx) return;
    const scale = this.props.graph.cameraService.getCameraScale();
    const store = this.props.store;
    drawElements(ctx, store.query(this.getWorldViewport()), scale, {
      styles: store.getStyles(),
      dimColor: store.getDimColor(),
    });
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
      if (token !== this.loadToken) return;
      const state = this.rendererState.value;
      if (state === "loading" || state === "restoring") {
        this.pendingLoss = true;
        return;
      }
      if (state !== "webgl") return;
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
    this.pendingLoss = false;
    let created: ISceneBackend | undefined;
    try {
      const module = await (this.props.loadBackend ?? defaultLoadBackend)();
      created = await module.createSceneBackend(this.requireCanvas(), this.createEvents(token));
      if (token !== this.loadToken) {
        created.dispose();
        return;
      }
      if (this.pendingLoss) {
        // Lost while being created: keep it aside and never draw with it. A disposed backend can no longer
        // deliver onRestored, so its own onRestored takes the normal lost -> restoring path and disposes it then.
        this.pendingLoss = false;
        this.backend = created;
        this.rendererState.value = "lost";
        this.performRender();
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
