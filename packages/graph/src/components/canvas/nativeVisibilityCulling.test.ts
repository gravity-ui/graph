import { Graph, TGraphConfig } from "../../graph";
import { Component } from "../../lib/Component";
import { ChildDescriptor } from "../../lib/CoreComponent";
import { globalScheduler } from "../../lib/Scheduler";
import { Layer, LayerProps } from "../../services/Layer";

import { GraphComponent, TGraphComponentProps } from "./GraphComponent";
import { Anchor, TAnchor, TAnchorProps } from "./anchors";
import { Block, TBlock } from "./blocks/Block";

class TracedAnchor<T extends TAnchorProps = TAnchorProps> extends Anchor<T> {
  public readonly paint: string[] = [];

  protected willRender() {
    this.paint.push("willRender");
    super.willRender();
  }

  protected render() {
    this.paint.push("render");
    super.render();
  }

  protected didRender() {
    this.paint.push("didRender");
    super.didRender();
  }
}

const AnchorView: typeof Anchor = TracedAnchor;

class TracedBlock extends Block {
  public readonly paint: string[] = [];

  protected willRender() {
    this.paint.push("willRender");
    super.willRender();
  }

  protected render() {
    this.paint.push("render");
    super.render();
  }

  protected didRender() {
    this.paint.push("didRender");
    super.didRender();
  }

  protected renderAnchor(anchor: TAnchor) {
    return AnchorView.create(
      { ...anchor, zIndex: this.zIndex, size: 18, lineWidth: 2, port: this.getAnchorPort(anchor.id) },
      { key: anchor.id }
    );
  }
}

type MarkerProps = TGraphComponentProps & { id: string; x: number; y: number };

class Marker extends GraphComponent<MarkerProps> {
  public readonly paint: string[] = [];

  public getEntityId() {
    return this.props.id;
  }

  protected willMount() {
    super.willMount();
    this.updateBounds(this.props);
  }

  protected propsChanged(props: MarkerProps) {
    super.propsChanged(props);
    this.updateBounds(props);
  }

  private updateBounds({ x, y }: MarkerProps) {
    this.setHitBox(x, y, x + 20, y + 20);
  }

  protected willRender() {
    this.paint.push("willRender");
    super.willRender();
  }

  protected render() {
    this.paint.push("render");
    this.context.ctx.fillRect(this.props.x, this.props.y, 20, 20);
  }

  protected didRender() {
    this.paint.push("didRender");
    super.didRender();
  }
}

class CustomContainer extends Component<{ children: ChildDescriptor[] }> {
  protected updateChildren() {
    return this.props.children;
  }
}

class CustomLayer extends Layer<LayerProps & { children: ChildDescriptor[] }> {
  protected updateChildren() {
    return [CustomContainer.create({ children: this.props.children })];
  }
}

const block = (id: string, x: number, y: number, anchors: TAnchor[] = []): TBlock => ({
  id,
  is: "TracedBlock",
  name: id,
  x,
  y,
  width: 100,
  height: 100,
  anchors,
});

function frames(count = 1) {
  for (let i = 0; i < count; i++) globalScheduler.performUpdate();
}

describe("Native viewport traversal through Graph", () => {
  let graph: Graph;

  function start(config: TGraphConfig = {}) {
    const root = document.createElement("div");
    Object.defineProperties(root, { clientWidth: { value: 1000 }, clientHeight: { value: 800 } });
    graph = new Graph({ ...config, settings: { blockComponents: { TracedBlock }, ...config.settings } }, root);
    graph.start();
    frames(4);
  }

  function view(id: string): TracedBlock {
    const result = graph.rootStore.blocksList.getBlockState(id)?.getViewComponent();
    if (!(result instanceof TracedBlock)) throw new Error(`Missing block ${id}`);
    return result;
  }

  function anchor(id: string, anchorId: string): TracedAnchor {
    const result = graph.rootStore.blocksList.getBlockState(id)?.getAnchorById(anchorId)?.getViewComponent();
    if (!(result instanceof TracedAnchor)) throw new Error(`Missing anchor ${anchorId}`);
    return result;
  }

  afterEach(() => {
    graph?.unmount();
    jest.restoreAllMocks();
  });

  it("mounts offscreen ports and connection geometry without any paint lifecycle, including the first frame", () => {
    start({
      blocks: [block("near", 100, 100), block("far", 50_000, 50_000, [{ id: "out", blockId: "far", type: "OUT" }])],
      connections: [{ id: "edge", sourceBlockId: "far", sourceAnchorId: "out", targetBlockId: "near" }],
    });

    expect(anchor("far", "out").isMounted()).toBe(true);
    expect(view("far").getInputPort().getPoint()).toEqual({ x: 50_000, y: 50_050 });
    expect(view("far").getAnchorPort("out").component).toBe(anchor("far", "out"));
    expect(graph.rootStore.connectionsList.getConnectionState("edge")?.getViewComponent()?.connectionPoints).toEqual([
      { x: 50_100, y: 50_088 },
      { x: 100, y: 150 },
    ]);
    expect(view("near").paint).toContain("render");
    expect(view("far").paint).toEqual([]);
    expect(anchor("far", "out").paint).toEqual([]);
  });

  it("reconciles and removes offscreen anchors while keeping connection endpoints current", () => {
    start({
      blocks: [block("near", 100, 100), block("far", 50_000, 50_000, [{ id: "old", blockId: "far", type: "OUT" }])],
      connections: [{ id: "edge", sourceBlockId: "near", targetBlockId: "far" }],
    });
    const far = view("far");
    const oldAnchor = anchor("far", "old");
    const removed = jest.fn();
    oldAnchor.onUnmounted(removed);
    graph.api.updateBlock({
      id: "far",
      x: 60_000,
      y: 70_000,
      anchors: [{ id: "new", blockId: "far", type: "OUT" }],
    });
    frames(4);

    const nextAnchor = anchor("far", "new");
    expect(far.state).toMatchObject({ x: 60_000, y: 70_000 });
    expect(oldAnchor.isMounted()).toBe(false);
    expect(removed).toHaveBeenCalledTimes(1);
    expect(nextAnchor.isMounted()).toBe(true);
    expect(nextAnchor.getPosition()).toEqual({ x: 60_100, y: 70_088 });
    expect(
      graph.rootStore.connectionsList.getConnectionState("edge")?.getViewComponent()?.connectionPoints?.[1]
    ).toEqual({
      x: 60_000,
      y: 70_050,
    });
    expect(far.paint).toEqual([]);
    expect(nextAnchor.paint).toEqual([]);

    const port = far.getInputPort();
    const nextRemoved = jest.fn();
    nextAnchor.onUnmounted(nextRemoved);
    graph.setEntities({ blocks: [], connections: [] });
    frames(3);
    expect(nextRemoved).toHaveBeenCalledTimes(1);
    expect(nextAnchor.isMounted()).toBe(false);
    expect(far.isEntityAvailable()).toBe(false);
    expect(graph.rootStore.connectionsList.getPort(port.id)).toBeUndefined();
    expect(graph.getElementsOverRect({ x: 59_000, y: 69_000, width: 2000, height: 2000 }, [Block, Anchor])).toEqual([]);
  });

  it("paints a visible anchor without painting its offscreen parent", () => {
    class OverflowBlock extends TracedBlock {
      public getAnchorPosition() {
        return { x: 100, y: 5100 };
      }
    }
    start({
      blocks: [block("overflow", 100, -5000, [{ id: "out", blockId: "overflow", type: "OUT" }])],
      settings: { blockComponents: { TracedBlock: OverflowBlock } },
    });

    expect(anchor("overflow", "out").getPosition()).toEqual({ x: 200, y: 100 });
    expect(anchor("overflow", "out").paint).toContain("render");
    expect(view("overflow").paint).toEqual([]);
    expect(graph.getElementOverPoint({ x: 200, y: 100 }, [Anchor])).toBe(anchor("overflow", "out"));
  });

  it("keeps world point and rectangle hits consistent in a skipped branch before and after an update", () => {
    start({ blocks: [block("far", 50_000, 50_000, [{ id: "out", blockId: "far", type: "OUT" }])] });
    const target = anchor("far", "out");
    const iterate = jest.spyOn(view("far"), "iterate");
    graph.getGraphLayer().performRender();
    frames(2);
    expect(iterate).not.toHaveBeenCalled();

    for (const [x, y] of [
      [50_000, 50_000],
      [60_000, 70_000],
    ]) {
      graph.api.updateBlock({ id: "far", x, y });
      frames(3);
      expect(graph.getElementOverPoint({ x: x + 100, y: y + 88 }, [Anchor])).toBe(target);
      expect(graph.getElementsOverRect({ x: x + 99, y: y + 87, width: 2, height: 2 }, [Anchor])).toEqual([target]);
      expect(graph.getElementOverPoint({ x: x + 50, y: y + 50 }, [Block])).toBe(view("far"));
      expect(graph.getElementsOverRect({ x: x + 49, y: y + 49, width: 2, height: 2 }, [Block])).toEqual([view("far")]);
    }
    expect(graph.getElementOverPoint({ x: 50_100, y: 50_088 }, [Anchor])).toBeUndefined();
    expect(target.paint).toEqual([]);
  });

  it("raises a selected block that has never been painted above overlapping offscreen siblings", () => {
    start({ blocks: [block("first", 50_000, 50_000), block("second", 50_000, 50_000)] });
    expect(view("first").paint).toEqual([]);
    expect(view("second").paint).toEqual([]);
    expect(graph.getElementOverPoint({ x: 50_050, y: 50_050 }, [Block])).toBe(view("second"));

    graph.api.selectBlocks(["first"], true);
    frames(3);

    expect(view("first").state.selected).toBe(true);
    expect(view("first").zIndex).toBeGreaterThan(view("second").zIndex);
    expect(graph.getElementOverPoint({ x: 50_050, y: 50_050 }, [Block])).toBe(view("first"));
    expect(view("first").paint).toEqual([]);
  });

  it("automatically culls custom components nested in a custom container and processes their props", () => {
    start();
    const markers = new Map<string, Marker>();
    const layer = graph.addLayer(CustomLayer, {
      canvas: { zIndex: 5 },
      children: ["near", "far"].map((id) =>
        Marker.create(
          { id, x: id === "near" ? 100 : 50_000, y: 100 },
          { key: id, ref: (marker) => markers.set(id, marker) }
        )
      ),
    });
    frames(4);
    const near = markers.get("near");
    const far = markers.get("far");
    if (!near || !far) throw new Error("Missing custom markers");
    expect(far.isMounted()).toBe(true);
    expect(far.paint).toEqual([]);
    const iterate = jest.spyOn(far, "iterate");
    near.paint.length = 0;
    layer.performRender();
    frames(2);
    expect(near.paint).toContain("render");
    expect(iterate).not.toHaveBeenCalled();

    far.setProps({ x: 200 });
    frames(3);
    expect(far.props.x).toBe(200);
    expect(far.paint).toContain("render");
    expect(graph.getElementOverPoint({ x: 210, y: 110 }, [Marker])).toBe(far);
  });

  it("begins painting when the camera arrives and stops again when it leaves", () => {
    start({ blocks: [block("far", 50_000, 50_000)] });
    const far = view("far");
    expect(far.paint).toEqual([]);

    graph.cameraService.set({ x: -49_800, y: -49_800, scale: 1 });
    frames(3);
    expect(far.paint).toContain("render");
    const calls = far.paint.length;

    graph.cameraService.set({ x: 0, y: 0, scale: 1 });
    frames(3);
    expect(far.paint).toHaveLength(calls);
    expect(graph.getElementOverPoint({ x: 50_050, y: 50_050 }, [Block])).toBe(far);
  });

  it("does not make a render request in one layer visit another layer's components", () => {
    start();
    const markers: Marker[] = [];
    const layers = [0, 1].map((id) =>
      graph.addLayer(CustomLayer, {
        canvas: { zIndex: 5 + id },
        children: [Marker.create({ id: String(id), x: 100, y: 100 }, { ref: (marker) => markers.push(marker) })],
      })
    );
    frames(4);
    markers.forEach((marker) => {
      marker.paint.length = 0;
    });
    const other = jest.spyOn(markers[1], "iterate");

    layers[0].performRender();
    frames(1);

    expect(markers[0].paint).toContain("render");
    expect(markers[1].paint).toEqual([]);
    expect(other).not.toHaveBeenCalled();
  });
});
