import { GraphComponent } from "../../../components/canvas/GraphComponent";
import type { TGraphComponentProps } from "../../../components/canvas/GraphComponent";
import { Box, BoxDot, TestLayer, boxSource, frames } from "../../../components/canvas/scene/test/utils/sceneTestKit";
import type { TBoxDotProps } from "../../../components/canvas/scene/test/utils/sceneTestKit";
import { Graph } from "../../../graph";
import type { ChildDescriptor } from "../../../lib/CoreComponent";
import { pointer, pointerRoot } from "../../../test/pointer";
import { entityKey } from "../../tags/TagStore";

/** A dot with a hit box, so it takes part in hit-testing. */
class HitDot extends BoxDot {
  public static override entityType = "dot";

  protected willMount(): void {
    super.willMount();
    this.setHitBox(96, 6, 104, 14);
  }
}

/** A box whose dot has a hit box. */
class HitBox extends Box {
  protected updateChildren(): ChildDescriptor[] {
    const props: TBoxDotProps = { id: `${this.props.id}/0`, index: 0 };
    return [HitDot.create(props, { key: "0" })];
  }
}

type TPlainProps = TGraphComponentProps & { id: string };

/** A non-scene component at zIndex 200, the same as the boxes. */
class Plain extends GraphComponent<TPlainProps> {
  constructor(props: TPlainProps, parent: ConstructorParameters<typeof GraphComponent>[1]) {
    super(props, parent);
    this.zIndex = 200;
  }

  public getEntityId(): string {
    return this.props.id;
  }

  protected willMount(): void {
    super.willMount();
    this.setHitBox(0, 0, 200, 50);
  }
}

describe("scene raises", () => {
  let graph: Graph;
  const order = (id: string): number => {
    const element = graph.scene.store.get(entityKey("box", id));
    if (!element) throw new Error(`no element for ${id}`);
    return element.order;
  };

  beforeEach(() => {
    graph = new Graph({}, document.createElement("div"));
    graph.start();
    graph.addLayer(TestLayer, {
      children: ["a", "b", "c"].map((id) =>
        Box.create({ id, source: boxSource(id), dots: id === "a" ? 1 : 0 }, { key: id })
      ),
    });
    frames(5);
  });

  afterEach(() => graph.unmount());

  it("raises at once outside a batch", () => {
    graph.scene.requestRaise(entityKey("box", "a"));
    expect(order("a")).toBeGreaterThan(order("c"));
  });

  it("raises a batch once at its end, in the current scene order", () => {
    graph.scene.batchRaises(() => {
      graph.scene.requestRaise(entityKey("box", "b"));
      graph.scene.requestRaise(entityKey("box", "a"));
      expect(order("a")).toBeLessThan(order("c"));
    });
    expect(order("a")).toBeLessThan(order("b"));
    expect(order("a")).toBeGreaterThan(order("c"));
  });

  it("raises the owner of a child element", () => {
    graph.scene.requestRaise(entityKey("dot", "a/0"));
    expect(order("a")).toBeGreaterThan(order("c"));
  });
});

describe("scene order in hit-testing and pointer state", () => {
  let graph: Graph;

  beforeEach(() => {
    graph = new Graph({}, pointerRoot());
    graph.start();
    graph.cameraService.set({ x: 0, y: 0, scale: 1 });
  });

  afterEach(() => graph.unmount());

  it("hits in draw order: child above its raised parent, parent above another root, plain tie on top", () => {
    const refs: Record<string, object> = {};
    const ref =
      (name: string) =>
      (component: object): void => {
        refs[name] = component;
      };
    graph.addLayer(TestLayer, {
      children: [
        HitBox.create({ id: "a", source: boxSource("a") }, { key: "a", ref: ref("a") }),
        Box.create({ id: "b", source: boxSource("b", 50) }, { key: "b", ref: ref("b") }),
        Plain.create({ id: "plain" }, { key: "plain", ref: ref("plain") }),
      ],
    });
    frames(5);
    graph.scene.requestRaise(entityKey("box", "a"));
    const hits = graph.getElementsOverPoint({ x: 99, y: 10 });
    const dot = hits.find((item) => item instanceof HitDot);
    expect(dot).toBeDefined();
    expect(hits).toEqual([refs.plain, dot, refs.a, refs.b]);
    expect(graph.getElementOverPoint({ x: 99, y: 10 })).toBe(refs.plain);
  });

  it("drops a removed press target and its capture before the pointer is released", () => {
    let box: Box | undefined;
    const layer = graph.addLayer(TestLayer, {
      children: [
        Box.create(
          { id: "a", source: boxSource("a") },
          {
            key: "a",
            ref: (component: Box): void => {
              box = component;
            },
          }
        ),
      ],
    });
    frames(5);
    if (!box) throw new Error("The box must be mounted");
    const release = jest.fn();
    const click = jest.fn();
    graph.on("release", release);
    graph.on("click", click);
    const position = { clientX: 50, clientY: 25 };
    pointer(graph, "pointermove", position);
    graph.scheduler.performUpdate();
    pointer(graph, "pointerdown", position);
    graph.input.hover.captureEvents(box);
    expect(graph.input.$hoveredComponent.peek()).toBe(box);
    layer.setProps({ children: [] });
    frames();
    pointer(graph, "pointerup", position);
    expect(graph.input.$hoveredComponent.peek()).toBeUndefined();
    expect(release).not.toHaveBeenCalled();
    expect(click).not.toHaveBeenCalled();

    pointer(graph, "pointerdown", position);
    pointer(graph, "pointerup", position);
    expect(click).toHaveBeenCalledTimes(1);
    expect(click.mock.calls[0][0].target === graph).toBe(true);
  });
});
