import { signal } from "@preact/signals-core";
import type { ReadonlySignal } from "@preact/signals-core";

import { Layer } from "../../../services/Layer";
import type { LayerProps } from "../../../services/Layer";
import type { TSceneLevel } from "../../../services/scene/types";
import { cameraWorldViewport } from "../../../services/visibilityCulling";
import { drawElements } from "../canvas/drawPrimitives";
import { SceneChangeQueue } from "../store/SceneChangeQueue";
import type { SceneStore } from "../store/SceneStore";
import { DEFAULT_TEXT_POLICY } from "../text/textPlacement";
import type { TSceneChange, TSceneRenderer, TSceneRendererState, TSceneStyle, TSceneTextPolicy } from "../types";

import type { ISceneBackend, ISceneBackendModule, TSceneBackendEvents, TSceneTextFrame } from "./backendTypes";

export type TSceneRendererLayerProps = LayerProps & {
  store: SceneStore;
  renderer?: TSceneRenderer;
  /** Lazy backend import; tests inject a fake. */
  loadBackend?: () => Promise<ISceneBackendModule>;
  /** Source of `frame.time` in seconds (the graph clock). Without it the layer uses its own clock. */
  clock?: { now(): number };
  /** Called after submitting a frame to the current renderer. */
  onDraw?: () => void;
  /** Refreshes the graph's text measurements before the renderer uses newly loaded fonts. */
  onFontsLoaded?: () => void;
  /** An application-requested paint opportunity before building or tearing down a backend. */
  pendingPresentation?: () => Promise<void> | undefined;
  /** The current scene level; a change redraws the layer, and the interpreter skips primitives of other levels. */
  level?: ReadonlySignal<TSceneLevel>;
  /**
   * What the graph allows text (the `cameraAwareText` setting); a change redraws the layer, and WebGL lays its
   * camera-aware texts out again. Unset: camera-aware text is allowed.
   */
  textPolicy?: ReadonlySignal<TSceneTextPolicy>;
};

const defaultLoadBackend = (): Promise<ISceneBackendModule> => import("../webgl/WebGLSceneBackend");

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
  /** Store changes for the WebGL backend, applied once per frame (review C1). */
  private readonly pendingChanges = new SceneChangeQueue();
  /** Bumped by every load and every leave of webgl: a load that finds another token is stale. */
  private loadToken = 0;
  /** Native context events can arrive before this load finishes creating a backend. */
  private pendingContext?: "lost" | "restored";
  private observedFonts = false;
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

  public override hide(): void {
    super.hide();
    this.syncCanvasVisibility(this.backend?.canvas);
  }

  public override show(): void {
    super.show();
    this.syncCanvasVisibility(this.backend?.canvas);
  }

  public setRenderer(renderer: TSceneRenderer): void {
    this.requested = renderer;
    if (renderer === "canvas") {
      const pending = this.props.pendingPresentation?.();
      const previous = this.backend;
      if (pending && previous && this.rendererState.peek() === "webgl") {
        pending.then(() => {
          if (this.requested === "canvas" && this.backend === previous) this.activateCanvas();
        });
      } else this.activateCanvas();
      return;
    }
    if (!this.attached) return;
    if (this.rendererState.value === "canvas" || this.rendererState.value === "webgl-fallback") {
      this.loadBackend("loading").catch(() => undefined);
    }
  }

  protected afterInit(): void {
    // The layer's onSignal() disposes any { subscribe } source when the layer unmounts.
    this.onSignal(
      { subscribe: (listener: (change: TSceneChange) => void) => this.props.store.subscribe(listener) },
      (change) => {
        if (this.rendererState.value === "webgl" && this.backend) this.pendingChanges.push(change);
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
    const level = this.props.level;
    if (level) this.onSignal(level, () => this.performRender());
    const textPolicy = this.props.textPolicy;
    if (textPolicy) this.onSignal(textPolicy, () => this.performRender());
    const fonts = this.context.ownerDocument?.fonts;
    if (fonts) {
      fonts.addEventListener("loadingdone", this.handleFontsLoaded, { signal: this.eventAbortController.signal });
      // Fonts can finish loading while the graph is detached.
      if (this.observedFonts) this.props.onFontsLoaded?.();
      this.observedFonts = true;
    }
    super.afterInit();
    if (this.requested === "webgl") this.setRenderer("webgl");
  }

  /** Runs on unmount, detach and re-attach: the backend and its canvas belong to one attachment. */
  protected unmountLayer(): void {
    this.loadToken++;
    this.pendingContext = undefined;
    this.disposeBackend();
    this.rendererState.value = "canvas";
    super.unmountLayer();
  }

  protected render(): void {
    super.render();
    if (this.rendererState.value === "webgl" && this.backend) {
      try {
        if (this.pendingChanges.size > 0) this.backend.applyMany(this.pendingChanges.take(), this.textFrame());
        this.drawWebGL(this.backend);
      } catch (error) {
        this.failBackend(error);
        this.drawInterpreter();
      }
    } else {
      this.drawInterpreter();
    }
  }

  /**
   * Late web fonts. On WebGL the glyph atlas is stale, so the backend is recreated and replays the store, laying every
   * text out again. Otherwise the interpreter draws: it redraws, laying text out again (`GraphScene.onFontsLoaded`
   * clears the shared text metrics before the next draw).
   */
  private readonly handleFontsLoaded = (): void => {
    this.props.onFontsLoaded?.();
    if (this.requested !== "webgl" || this.rendererState.value !== "webgl") {
      this.performRender();
      return;
    }
    this.disposeBackend();
    this.loadBackend("restoring").catch(() => undefined);
    this.performRender();
  };

  /** The text policy of the graph (the `cameraAwareText` setting). */
  private textPolicy(): TSceneTextPolicy {
    return this.props.textPolicy?.peek() ?? DEFAULT_TEXT_POLICY;
  }

  /** The scale and policy the backend lays texts out for: the camera's now, which the next draw uses. */
  private textFrame(): TSceneTextFrame {
    return { scale: this.props.graph.cameraService.getCameraScale(), textPolicy: this.textPolicy() };
  }

  private drawWebGL(backend: ISceneBackend): void {
    const store = this.props.store;
    const styles = store.getStyles();
    if (styles !== this.lastStyles) {
      this.lastStyles = styles;
      backend.setStyles(styles);
    }
    const { width, height, x, y, scale, scaleMin } = this.props.graph.cameraService.getCameraState();
    const time = this.props.clock ? this.props.clock.now() : (performance.now() - this.start) / 1000;
    const dimColor = store.getDimColor();
    const level = this.props.level?.peek();
    const textPolicy = this.textPolicy();
    if (backend.draw({ width, height, x, y, scale, scaleMin, dpr: this.getDRP(), time, dimColor, level, textPolicy })) {
      this.performRender();
    }
    if (this.rendererState.peek() === "webgl") this.props.onDraw?.();
  }

  private drawInterpreter(): void {
    const ctx = this.context.ctx;
    if (!ctx) return;
    const camera = this.props.graph.cameraService.getCameraState();
    const { scale } = camera;
    const viewport = cameraWorldViewport(camera, this.getDRP());
    const store = this.props.store;
    store.ensurePaintScale(Math.min(scale, camera.scaleMin));
    const level = this.props.level?.peek();
    // The query leaves out elements with nothing to draw on the level (an anchor at the minimalistic level).
    drawElements(ctx, store.queryForCanvas(viewport, scale, level), scale, {
      styles: store.getStyles(),
      dimColor: store.getDimColor(),
      level,
      textPolicy: this.textPolicy(),
    });
    const state = this.rendererState.peek();
    if (state !== "loading" && state !== "restoring") this.props.onDraw?.();
  }

  /** A backend call threw after load (capacity limits, GL errors): drop the backend and draw with Canvas2D. */
  private failBackend(error: unknown): void {
    this.loadToken++;
    this.disposeBackend();
    console.warn("WebGL scene backend failed, drawing with Canvas2D", error);
    this.rendererState.value = "webgl-fallback";
  }

  private activateCanvas(): void {
    this.loadToken++;
    this.disposeBackend();
    this.rendererState.value = "canvas";
    this.performRender();
  }

  private disposeBackend(): void {
    this.backend?.dispose();
    this.backend = undefined;
    this.lastStyles = undefined;
    this.pendingChanges.clear();
  }

  private readonly createEvents = (token: number): TSceneBackendEvents => ({
    onInvalidate: () => {
      if (token === this.loadToken) this.performRender();
    },
    onLost: () => {
      if (token !== this.loadToken) return;
      const state = this.rendererState.value;
      if (state === "loading" || state === "restoring") {
        this.pendingContext = "lost";
        return;
      }
      if (state !== "webgl") return;
      this.rendererState.value = "lost";
      this.performRender();
    },
    onRestored: () => {
      if (token !== this.loadToken) return;
      if (this.pendingContext === "lost") {
        this.pendingContext = "restored";
        return;
      }
      if (this.rendererState.value !== "lost") return;
      if (this.requested === "canvas") {
        this.activateCanvas();
        return;
      }
      this.disposeBackend();
      this.loadBackend("restoring").catch(() => undefined);
      this.performRender();
    },
  });

  private async loadBackend(state: "loading" | "restoring"): Promise<void> {
    const token = ++this.loadToken;
    this.pendingContext = undefined;
    // A subscriber can replace this attempt as soon as the state is published.
    this.rendererState.value = state;
    if (token !== this.loadToken) return;
    let created: ISceneBackend | undefined;
    try {
      const module = await (this.props.loadBackend ?? defaultLoadBackend)();
      const beforeCreate = this.props.pendingPresentation?.();
      if (beforeCreate) await beforeCreate;
      if (token !== this.loadToken) return;
      created = await module.createSceneBackend(this.requireCanvas(), this.createEvents(token));
      // A start or full replacement may have requested its paint while GPU creation was in flight.
      const beforeReplay = this.props.pendingPresentation?.();
      if (token === this.loadToken && beforeReplay) await beforeReplay;
      if (token !== this.loadToken) {
        created.dispose();
        return;
      }
      this.syncCanvasVisibility(created.canvas);
      if (this.pendingContext === "restored") {
        created.dispose();
        await this.loadBackend("restoring");
        return;
      }
      if (this.pendingContext === "lost") {
        // Lost while being created: keep it aside and never draw with it. A disposed backend can no longer
        // deliver onRestored, so its own onRestored takes the normal lost -> restoring path and disposes it then.
        this.pendingContext = undefined;
        this.backend = created;
        this.rendererState.value = "lost";
        this.performRender();
        return;
      }
      // A replay reads the store as it is: the changes queued for an earlier backend are in it.
      this.pendingChanges.clear();
      created.replay(this.props.store, this.textFrame());
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
