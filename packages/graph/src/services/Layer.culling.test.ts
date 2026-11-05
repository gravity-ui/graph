import { Graph } from "../graph";
import { Component } from "../lib/Component";
import type { CoreComponent, CoreComponentProps } from "../lib/CoreComponent";
import { globalScheduler } from "../lib/Scheduler";
import type { TTileRect } from "../lib/culling/TileIndex";
import type { TTreeCullingOptions } from "../lib/culling/TreeCulling";

import { Layer } from "./Layer";
import type { LayerProps, TLayerCulling } from "./Layer";

let paints = 0;
let iterations = 0;

/** Draws at a fixed screen position and reports that position as its bounds. */
class ScreenChild extends Component {
  constructor(props: CoreComponentProps, parent: CoreComponent) {
    super(props, parent);
    this.setCullingBounds(10, 10, 20, 20);
  }

  protected render(): void {
    paints++;
  }

  protected didIterate(): void {
    iterations++;
  }
}

class OverlayLayer extends Layer {
  constructor(props: LayerProps) {
    super({ ...props, canvas: { zIndex: 7, transformByCameraPosition: false } });
  }

  protected updateChildren() {
    return [ScreenChild.create({})];
  }

  protected afterInit(): void {
    this.onGraphEvent("camera-change", () => this.performRender());
    super.afterInit();
  }
}

/** A layer with its own rectangle. The Layer constructor asks for the options, so the rectangle is read lazily. */
class RectLayer extends OverlayLayer {
  public viewport: TTileRect = { minX: 0, minY: 0, maxX: 1000, maxY: 800 };

  protected getCullingOptions(): TTreeCullingOptions | undefined {
    return { tileSize: 64, getViewport: () => this.viewport };
  }

  public useViewport(minX: number, minY: number, maxX: number, maxY: number): void {
    this.viewport = { minX, minY, maxX, maxY };
    this.performRender();
  }
}

type TSwitchMode = "far" | "near" | "none";

/** A layer that changes what getCullingOptions() returns and applies it with updateCulling(). */
class SwitchingLayer extends OverlayLayer {
  /** Unset while the Layer constructor asks for the options: the layer starts culled by a far rectangle. */
  public mode?: TSwitchMode;

  protected getCullingOptions(): TTreeCullingOptions | undefined {
    const mode = this.mode ?? "far";
    if (mode === "none") return undefined;
    const at = mode === "far" ? 5000 : 0;
    const viewport: TTileRect = { minX: at, minY: at, maxX: at + 100, maxY: at + 100 };
    return { tileSize: mode === "far" ? 64 : 256, getViewport: () => viewport };
  }

  public switchCulling(mode: TSwitchMode): void {
    this.mode = mode;
    this.updateCulling();
  }
}

function frames(): void {
  for (let i = 0; i < 3; i++) globalScheduler.performUpdate();
}

function setup(culling?: TLayerCulling, viewportCulling = true, LayerClass: typeof OverlayLayer = OverlayLayer) {
  const root = document.createElement("div");
  Object.defineProperties(root, { clientWidth: { value: 1000 }, clientHeight: { value: 800 } });
  const graph = new Graph({ settings: { viewportCulling } }, root);
  graph.cameraService.set({ width: 1000, height: 800, scale: 1, x: 0, y: 0 });
  graph.start();
  const layer = graph.addLayer(LayerClass, culling ? { culling } : {});
  frames();
  paints = 0;
  /** Pans and zooms the camera far from the world origin and returns how often the child painted. */
  const moveCamera = (): number => {
    paints = iterations = 0;
    graph.cameraService.set({ width: 1000, height: 800, scale: 0.3, x: -5000, y: -5000 });
    frames();
    return paints;
  };
  return { graph, layer, moveCamera };
}

describe("layer culling policy", () => {
  it("keeps a screen-space child painted after pan and zoom with screen culling", () => {
    const { graph, moveCamera } = setup("screen");
    expect(moveCamera()).toBeGreaterThan(0);
    graph.unmount();
  });

  it("culls by the world viewport by default, which hides a child drawn at a fixed screen position", () => {
    const { graph, moveCamera } = setup();
    expect(moveCamera()).toBe(0);
    graph.unmount();
  });

  it("walks and paints every child without culling", () => {
    const { graph, moveCamera } = setup("none");
    expect(moveCamera()).toBeGreaterThan(0);
    graph.unmount();
  });

  it("uses a rectangle the layer returns from getCullingOptions()", () => {
    const { graph, layer, moveCamera } = setup(undefined, true, RectLayer);
    expect(moveCamera()).toBeGreaterThan(0);
    (layer as RectLayer).useViewport(500, 500, 600, 600);
    expect(moveCamera()).toBe(0);
    graph.unmount();
  });

  it("applies the options getCullingOptions() returns again after updateCulling()", () => {
    const { graph, layer, moveCamera } = setup(undefined, true, SwitchingLayer);
    const switching = layer as SwitchingLayer;
    // The child reports (10, 10)-(20, 20): outside the far rectangle, inside the near one.
    expect(moveCamera()).toBe(0);
    switching.switchCulling("near");
    expect(moveCamera()).toBeGreaterThan(0);
    switching.switchCulling("none");
    expect(moveCamera()).toBeGreaterThan(0);
    expect(iterations).toBeGreaterThan(0);
    switching.switchCulling("far");
    expect(moveCamera()).toBe(0);
    switching.switchCulling("near");
    expect(moveCamera()).toBeGreaterThan(0);
    graph.unmount();
  });

  it("walks and paints every child when viewportCulling is off and culls again when it is back on", () => {
    const { graph, moveCamera } = setup(undefined, false);
    expect(moveCamera()).toBeGreaterThan(0);
    expect(iterations).toBeGreaterThan(0);
    graph.updateSettings({ viewportCulling: true });
    expect(moveCamera()).toBe(0);
    graph.updateSettings({ viewportCulling: false });
    expect(moveCamera()).toBeGreaterThan(0);
    graph.unmount();
  });

  it("keeps a child layer without culling working when viewportCulling is toggled", () => {
    const { graph } = setup();
    class Parent extends Component {
      public child: OverlayLayer | undefined;
      protected updateChildren() {
        return [
          OverlayLayer.create(
            { graph, camera: graph.cameraService, culling: "none" },
            { key: "overlay", ref: (child) => (this.child = child) }
          ),
        ];
      }
      public syncChildren(): void {
        this.__updateChildren();
      }
    }
    const parent = new Parent({});
    parent.syncChildren();
    const child = parent.child;
    if (!child) throw new Error("Expected a child layer");
    child.attachLayer(document.createElement("div"));
    expect(() => graph.updateSettings({ viewportCulling: false })).not.toThrow();
    expect(() => graph.updateSettings({ viewportCulling: true })).not.toThrow();
    child.detachLayer();
    Component.unmount(parent);
    graph.unmount();
  });
});
