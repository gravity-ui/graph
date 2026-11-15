// packages/graph/src/services/scene/compareOrder.test.ts
import { GraphComponent } from "../../components/canvas/GraphComponent";
import type { TGraphComponentProps } from "../../components/canvas/GraphComponent";
import { Box, TestLayer, boxSource, frames } from "../../components/canvas/scene/sceneTestKit";
import { Graph } from "../../graph";
import { Component } from "../../lib/Component";

type TMarkerProps = TGraphComponentProps & { id: string; z: number };

class Marker extends GraphComponent<TMarkerProps> {
  constructor(props: TMarkerProps, parent: Component) {
    super(props, parent);
    // Before the node joins its parent's children, so no zIndex group is rebuilt during a walk.
    this.zIndex = props.z;
  }

  public getEntityId(): string {
    return this.props.id;
  }

  protected willMount(): void {
    super.willMount();
    this.setHitBox(0, 0, 100, 50);
  }
}

describe("scene order of components", () => {
  let graph: Graph;
  let layer: TestLayer;
  const boxes: Record<string, Box> = {};
  const markers: Record<string, Marker> = {};
  const sourceA = boxSource("a");

  /** Explicit keys: a reconcile keeps "a" mounted when its siblings change. */
  const boxA = () =>
    Box.create(
      { id: "a", source: sourceA },
      {
        key: "a",
        ref: (box: Box): void => {
          boxes.a = box;
        },
      }
    );

  beforeEach(() => {
    graph = new Graph({}, document.createElement("div"));
    graph.start();
    graph.cameraService.set({ x: 0, y: 0, scale: 1 });
    layer = graph.addLayer(TestLayer, {
      children: [
        boxA(),
        Box.create(
          { id: "b", source: boxSource("b") },
          {
            key: "b",
            ref: (box: Box): void => {
              boxes.b = box;
            },
          }
        ),
        Box.create(
          { id: "low", source: boxSource("low"), zIndex: 100 },
          {
            key: "low",
            ref: (box: Box): void => {
              boxes.low = box;
            },
          }
        ),
      ],
    });
    frames(5);
  });

  afterEach(() => graph.unmount());

  it("orders scene components by bucket with the style's raise, then by order", () => {
    expect(graph.scene.compareOrder(boxes.a, boxes.b)).toBeLessThan(0);
    expect(graph.scene.compareOrder(boxes.low, boxes.a)).toBeLessThan(0);
    graph.scene.store.raise(boxes.a.getSceneElementId());
    expect(graph.scene.compareOrder(boxes.a, boxes.b)).toBeGreaterThan(0);
  });

  it("hits the topmost component by the scene key", () => {
    expect(graph.getElementOverPoint({ x: 50, y: 25 })).toBe(boxes.b);
    graph.scene.store.raise(boxes.a.getSceneElementId());
    expect(graph.getElementOverPoint({ x: 50, y: 25 })).toBe(boxes.a);
  });

  it("orders a plain component by zIndex, above scene components of the same zIndex", () => {
    layer.setProps({
      children: [
        boxA(),
        Marker.create(
          { id: "m1", z: 200 },
          {
            key: "m1",
            ref: (marker: Marker): void => {
              markers.m1 = marker;
            },
          }
        ),
        Marker.create(
          { id: "m0", z: 0 },
          {
            key: "m0",
            ref: (marker: Marker): void => {
              markers.m0 = marker;
            },
          }
        ),
      ],
    });
    frames(5);
    expect(graph.scene.compareOrder(markers.m1, boxes.a)).toBeGreaterThan(0);
    expect(graph.scene.compareOrder(markers.m0, boxes.a)).toBeLessThan(0);
  });

  it("forgets an unmounted component as the pointer target", () => {
    graph.getGraphLayer().handleEvent(new MouseEvent("mousemove", { clientX: 50, clientY: 25 }));
    const pointer = graph.getGraphLayer() as unknown as { targetComponent?: object };
    expect(pointer.targetComponent).toBe(boxes.b);
    layer.setProps({ children: [] });
    frames();
    expect(pointer.targetComponent).toBeUndefined();
    expect(graph.getGraphLayer().$hoveredComponent.value).toBeUndefined();
  });
});
