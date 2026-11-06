import { Layer } from "@gravity-ui/graph";
import type { ConnectionState, Graph, LayerProps, TConnection, TConnectionId, TPoint } from "@gravity-ui/graph";
import { effect } from "@preact/signals-core";

import { WebGLConnectionsHitTarget } from "./WebGLConnectionsHitTarget";
import { TCubic, TCurveMode, connectionCubic, distanceToCubic, straightCubic, stubParameter } from "./geometry";
import { ConnectionInstances, TConnectionDraw } from "./instances";
import { ConnectionsRenderer } from "./renderer";
import { StyleTable, TWebGLConnectionStyle } from "./styles";

export type TWebGLConnectionStyleState = {
  selected: boolean;
  hovered: boolean;
};

/** Resolves the style of a connection. Must be pure: results are interned into a small style table. */
export type TWebGLConnectionStyleResolver = (
  connection: TConnection,
  state: TWebGLConnectionStyleState,
  graph: Graph
) => TWebGLConnectionStyle;

/**
 * Level of detail by camera scale. Selected and hovered connections, and connections of selected
 * blocks, are always drawn whole with their arrows.
 */
export type TWebGLConnectionsLod = {
  /** Below this scale arrows are not drawn. Default: `connection.MIN_ZOOM_FOR_CONNECTION_ARROW_AND_LABEL`. */
  hideArrowsBelowScale?: number;
  /** Below this scale connections are drawn as two short stubs at their ends. Default: never. */
  stubsBelowScale?: number;
  /** Stub length in CSS pixels. Default: 14. */
  stubLengthPx?: number;
  /** Below this scale only focused connections are drawn. Default: never. */
  hideBelowScale?: number;
};

export type TWebGLConnectionsLayerProps = LayerProps & {
  /** Connection style. Default: the canvas connection look (theme colors, `styles`, `dashed`, arrows setting). */
  style?: TWebGLConnectionStyleResolver;
  /** Curve shape. Default: follows the `useBezierConnections` setting. */
  curve?: TCurveMode;
  /** Units of `style.width`: world units scaled by the camera (like canvas connections) or CSS pixels. */
  widthUnits?: "world" | "screen";
  lod?: TWebGLConnectionsLod;
  /** Extra hit distance around a connection, in CSS pixels. Default: 6. */
  hitThresholdPx?: number;
};

type TMultipoint = TConnection & { points?: TPoint[] };

type TLodState = { stubPx: number; arrows: boolean; hidden: boolean };

/** Reads every signal `describe()` depends on, so an effect calling it re-runs on any of their changes. */
function trackDrawDependencies(state: ConnectionState): unknown[] {
  return [
    state.$geometry.value,
    state.$hidden.value,
    state.$selected.value,
    state.$state.value,
    state.$sourceBlock.value?.$selected.value,
    state.$targetBlock.value?.$selected.value,
  ];
}

/** The canvas connection look: theme colors with per-connection overrides, 2/4 world units wide. */
export const defaultWebGLConnectionStyle: TWebGLConnectionStyleResolver = (
  connection,
  { selected, hovered },
  graph
) => {
  const colors = graph.$graphColors.value.connection;
  const color = selected
    ? connection.styles?.selectedBackground ?? colors.selectedBackground
    : connection.styles?.background ?? colors.background;
  const dashes = connection.dashed ? connection.styles?.dashes ?? [6, 4] : undefined;
  return {
    color,
    width: selected || hovered ? 4 : 2,
    dash: dashes?.length ? [dashes[0], dashes[1] ?? dashes[0]] : undefined,
    arrow: graph.rootStore.settings.$connectionsSettings.value.showConnectionArrows,
  };
};

/**
 * Draws all connections with WebGL2 instancing instead of one canvas component per connection.
 *
 * While attached it switches the built-in canvas connections off (`useCanvasConnections: false`) and
 * restores the previous value when detached. Geometry, selection and visibility come straight from the
 * store (`ConnectionState`), so ports, anchors and collapsed groups behave as with canvas connections.
 * Pan and zoom only change uniforms; only changed connections are re-uploaded.
 *
 * Not supported yet: labels, custom `connection` component classes (they keep using canvas).
 */
export class WebGLConnectionsLayer extends Layer<TWebGLConnectionsLayerProps> {
  private gl: WebGL2RenderingContext | null = null;

  private renderer: ConnectionsRenderer | undefined;

  private readonly styles = new StyleTable();

  private readonly instances = new ConnectionInstances();

  private readonly watchers = new Map<TConnectionId, { state: ConnectionState; dispose: () => void }>();

  private readonly dirty = new Set<TConnectionId>();

  private structureDirty = true;

  private boundsDirty = true;

  private hovered: TConnectionId | undefined;

  private restoreCanvasConnections: boolean | undefined;

  constructor(props: TWebGLConnectionsLayerProps) {
    super({
      ...props,
      canvas: {
        // Same z-index as the background and groups layers, attached after them: connections stay
        // above group backgrounds and below the blocks canvas (z-index 2).
        zIndex: 1,
        classNames: ["no-pointer-events"],
        transformByCameraPosition: true,
        ...props.canvas,
      },
    });
  }

  /** A canvas without a 2D context: a canvas can hold only one context type. */
  protected createCanvas(params: NonNullable<LayerProps["canvas"]>): HTMLCanvasElement {
    const canvas = document.createElement("canvas");
    canvas.classList.add("layer", "layer-canvas");
    if (Array.isArray(params.classNames)) canvas.classList.add(...params.classNames);
    canvas.style.zIndex = `${Number(params.zIndex)}`;
    this.setContext({ canvas, ownerDocument: canvas.ownerDocument });
    return canvas;
  }

  /** Whether WebGL2 is available and the layer draws the connections. */
  public isActive(): boolean {
    return this.renderer !== undefined;
  }

  private initRenderer(): void {
    if (!this.canvas) return;
    this.gl ??= this.canvas.getContext("webgl2", { antialias: false, premultipliedAlpha: true, alpha: true });
    if (!this.gl) {
      console.warn("[graph-webgl-connections] WebGL2 is unavailable, canvas connections stay enabled");
      return;
    }
    this.renderer = new ConnectionsRenderer(this.gl);
    this.structureDirty = true;
  }

  protected afterInit(): void {
    const graph = this.props.graph;
    this.initRenderer();
    if (this.renderer) {
      this.restoreCanvasConnections ??= graph.rootStore.settings.getConfigFlag("useCanvasConnections");
      graph.updateSettings({ useCanvasConnections: false });
    }

    this.onSignal(graph.rootStore.connectionsList.$connections, () => {
      this.structureDirty = true;
      this.performRender();
    });
    this.onSignal(graph.$graphColors, () => this.restyleAll());
    this.onSignal(graph.rootStore.settings.$connectionsSettings, () => this.restyleAll());

    // WebGL context events are not in HTMLElementEventMap, so subscribe directly with the layer's abort signal
    const signal = this.eventAbortController.signal;
    this.canvas?.addEventListener(
      "webglcontextlost",
      (event) => {
        event.preventDefault();
        this.renderer = undefined;
        // drop the hit target until the context is back
        this.shouldUpdateChildren = true;
        this.performRender();
      },
      { signal }
    );
    this.canvas?.addEventListener(
      "webglcontextrestored",
      () => {
        this.initRenderer();
        this.shouldUpdateChildren = true;
        this.performRender();
      },
      { signal }
    );
    super.afterInit();
  }

  protected unmountLayer(): void {
    this.watchers.forEach(({ dispose }) => dispose());
    this.watchers.clear();
    this.structureDirty = true;
    if (this.restoreCanvasConnections !== undefined) {
      this.props.graph.updateSettings({ useCanvasConnections: this.restoreCanvasConnections });
      this.restoreCanvasConnections = undefined;
    }
    this.renderer?.dispose();
    this.renderer = undefined;
    super.unmountLayer();
  }

  /** Mouse events over connections go to the hit target; the rest bubbles to the camera (panning). */
  public getParent(): ReturnType<Layer["getParent"]> {
    return this.props.graph.getGraphLayer().$.camera;
  }

  protected updateChildren() {
    return this.renderer
      ? [WebGLConnectionsHitTarget.create({ layer: this }, { key: "hit-target", ref: "hitTarget" })]
      : [];
  }

  protected didUpdateChildren(): void {
    super.didUpdateChildren();
    this.boundsDirty = true;
    this.updateHitBounds();
  }

  private getHitTarget(): WebGLConnectionsHitTarget | undefined {
    const target = this.$.hitTarget;
    return target instanceof WebGLConnectionsHitTarget ? target : undefined;
  }

  private updateHitBounds(): void {
    const target = this.getHitTarget();
    if (!this.boundsDirty || !target) return;
    this.boundsDirty = false;
    target.updateBounds(this.instances.getBounds());
  }

  protected propsChanged(nextProps: TWebGLConnectionsLayerProps): void {
    super.propsChanged(nextProps);
    if (nextProps.style !== this.props.style || nextProps.curve !== this.props.curve) {
      // styles and geometry are baked into instances
      this.restyleAll();
    } else {
      // lod, widthUnits and hitThresholdPx are read on every frame
      this.performRender();
    }
  }

  private restyleAll(): void {
    this.styles.clear();
    this.structureDirty = true;
    this.performRender();
  }

  private markDirty(id: TConnectionId): void {
    this.dirty.add(id);
    this.performRender();
  }

  /** Called by the hit target while the pointer moves over connections. */
  public setHovered(id: TConnectionId | undefined): void {
    if (this.hovered === id) return;
    const previous = this.hovered;
    this.hovered = id;
    if (previous !== undefined) this.markDirty(previous);
    if (id !== undefined) this.markDirty(id);
  }

  public getHovered(): TConnectionId | undefined {
    return this.hovered;
  }

  private getCurveMode(): TCurveMode {
    if (this.props.curve) return this.props.curve;
    return this.props.graph.rootStore.settings.$connectionsSettings.value.useBezierConnections ? "bezier" : "straight";
  }

  private getLodState(scale: number): TLodState {
    const lod = this.props.lod ?? {};
    const hideArrowsBelow =
      lod.hideArrowsBelowScale ?? this.props.graph.graphConstants.connection.MIN_ZOOM_FOR_CONNECTION_ARROW_AND_LABEL;
    const stubs = lod.stubsBelowScale !== undefined && scale < lod.stubsBelowScale;
    return {
      stubPx: stubs ? lod.stubLengthPx ?? 14 : 0,
      arrows: scale >= hideArrowsBelow && !stubs,
      hidden: lod.hideBelowScale !== undefined && scale < lod.hideBelowScale,
    };
  }

  /** One effect per connection marks it dirty when anything that affects its drawing changes. */
  private syncWatchers(states: ConnectionState[]): void {
    const alive = new Set<TConnectionId>();
    for (const state of states) {
      const id = state.id;
      alive.add(id);
      const existing = this.watchers.get(id);
      if (existing?.state === state) continue;
      existing?.dispose();
      const dispose = effect(() => {
        trackDrawDependencies(state);
        this.markDirty(id);
      });
      this.watchers.set(id, { state, dispose });
    }
    for (const [id, watcher] of this.watchers) {
      if (alive.has(id)) continue;
      watcher.dispose();
      this.watchers.delete(id);
    }
  }

  private describe(state: ConnectionState): TConnectionDraw {
    const connection: TMultipoint = state.$state.value;
    const selected = state.$selected.value;
    const hovered = this.hovered === state.id;
    const blockSelected = Boolean(
      state.$sourceBlock.value?.$selected.value || state.$targetBlock.value?.$selected.value
    );
    const resolve = this.props.style ?? defaultWebGLConnectionStyle;
    const style = this.styles.intern(resolve(connection, { selected, hovered }, this.props.graph));

    let segments: TCubic[] = [];
    const points = connection.points;
    if (points && points.length > 0) {
      segments = points.slice(1).map((point, index) => straightCubic(points[index], point));
    } else {
      const geometry = state.$geometry.value;
      if (geometry) {
        const direction = this.props.graph.rootStore.settings.$connectionsSettings.value.bezierConnectionDirection;
        segments = [connectionCubic(geometry[0], geometry[1], this.getCurveMode(), direction)];
      }
    }
    return {
      segments,
      style,
      hidden: state.$hidden.value || segments.length === 0,
      focus: selected || hovered || blockSelected,
      overlay: selected || hovered,
      arrow: this.styles.hasArrow(style),
    };
  }

  private flush(renderer: ConnectionsRenderer): void {
    let rebuilt = false;
    if (!this.structureDirty && this.dirty.size > 0) {
      for (const id of this.dirty) {
        const state = this.watchers.get(id)?.state;
        if (state && !this.instances.update(id, this.describe(state))) {
          this.structureDirty = true;
          break;
        }
      }
    }
    if (this.structureDirty) {
      this.structureDirty = false;
      const states = this.props.graph.rootStore.connectionsList.$connections.value;
      this.syncWatchers(states);
      this.instances.rebuild(states.map((state): [TConnectionId, TConnectionDraw] => [state.id, this.describe(state)]));
      rebuilt = true;
    }
    if (!rebuilt && this.dirty.size === 0) return;
    this.dirty.clear();

    const range = this.instances.takeDirtyRange();
    if (rebuilt) {
      renderer.setInstances(this.instances.data, this.instances.count);
    } else if (range) {
      renderer.updateInstances(this.instances.data, range[0], range[1]);
    }
    const overlay = this.instances.takeOverlay();
    if (overlay) renderer.setOverlay(overlay.data, overlay.count);
    this.boundsDirty = true;
    this.updateHitBounds();
  }

  protected render(): void {
    const renderer = this.renderer;
    if (!renderer || !this.canvas) return;
    if (this.sizeTouched) {
      this.sizeTouched = false;
      this.updateCanvasSize();
    }
    this.flush(renderer);

    const camera = this.context.camera.getCameraState();
    const { width, height, dpr } = this.props.graph.layers.getRootSize();
    const lod = this.getLodState(camera.scale);
    renderer.draw(
      {
        width,
        height,
        dpr,
        x: camera.x,
        y: camera.y,
        scale: camera.scale,
        stubPx: lod.stubPx,
        arrows: lod.arrows,
        widthWorld: this.props.widthUnits !== "screen",
        mainPass: !lod.hidden,
      },
      this.styles
    );
  }

  /** Topmost connection under a world point, as drawn at the current zoom (stubs included). */
  public pick(point: TPoint): TConnectionId | undefined {
    const scale = this.context.camera.getCameraScale();
    const lod = this.getLodState(scale);
    const widthWorld = this.props.widthUnits !== "screen";
    const threshold = (this.props.hitThresholdPx ?? 6) / scale;
    const reach = threshold + (widthWorld ? 4 : 4 / scale);
    let best: TConnectionId | undefined;
    let bestDistance = Infinity;
    let bestOverlay = false;
    for (const entry of this.instances.search(point.x - reach, point.y - reach, point.x + reach, point.y + reach)) {
      const overlay = this.instances.isOverlay(entry.id);
      if (lod.hidden && !overlay) continue;
      const segment = this.instances.getSegment(entry.index);
      const tau =
        lod.stubPx > 0 && !this.instances.isFocused(entry.index) ? stubParameter(segment, scale, lod.stubPx) : 0.5;
      const halfWidth = this.styles.width(this.instances.getStyle(entry.index)) / 2 / (widthWorld ? 1 : scale);
      const distance = distanceToCubic(point, segment, tau);
      if (distance > threshold + halfWidth) continue;
      // connections drawn on top win, then the nearest one
      if ((overlay && !bestOverlay) || (overlay === bestOverlay && distance < bestDistance)) {
        best = entry.id;
        bestDistance = distance;
        bestOverlay = overlay;
      }
    }
    return best;
  }
}
