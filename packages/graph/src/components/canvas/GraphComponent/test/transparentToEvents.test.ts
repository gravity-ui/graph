import { Graph } from "../../../../graph";
import { Component } from "../../../../lib/Component";
import { hoveredTag } from "../../../../services/tags/builtinTags";
import { pointerTargetAfter } from "../../EventedComponent/EventedComponent";
import { TestLayer, frames } from "../../scene/test/utils/sceneTestKit";
import { GraphComponent } from "../index";
import type { TGraphComponentProps } from "../index";

type TPadProps = TGraphComponentProps & { id: string; z: number; width: number };

/** A hit box from (0, 0) of the given width and 50 high, above every block (zIndex 300+). */
class Pad extends GraphComponent<TPadProps> {
  public static entityType = "pad";

  constructor(props: TPadProps, parent: Component) {
    super(props, parent);
    this.zIndex = props.z;
    // A component writes its own hoveredTag from the pointer events it gets.
    (["mouseenter", "mouseleave"] as const).forEach((type) => {
      this.addEventListener(type, (event: Event) => {
        this.setHoveredTag(pointerTargetAfter(event) === this);
      });
    });
  }

  public override getEntityId(): string {
    return this.props.id;
  }

  protected override willMount(): void {
    super.willMount();
    this.setHitBox(0, 0, this.props.width, 50);
  }
}

/** Reserves space: pointer events pass through it. */
class GlassPad extends Pad {
  public static override transparentToEvents = true;
}

const keep =
  (into: Record<string, Pad>, id: string) =>
  (pad: Pad): void => {
    into[id] = pad;
  };

/** Becomes transparent at runtime. */
class FlipPad extends Pad {
  public glass = false;

  public override isTransparentToEvents(): boolean {
    return this.glass;
  }

  public widen(width: number): void {
    this.setHitBox(0, 0, width, 50);
  }
}

describe("a component that becomes transparent under a still pointer", () => {
  it("is left at the frame's end, and its hovered tag is removed", () => {
    const graph = new Graph({}, document.createElement("div"));
    graph.start();
    graph.cameraService.set({ x: 0, y: 0, scale: 1 });
    const pads: Record<string, Pad> = {};
    graph.addLayer(TestLayer, {
      children: [
        Pad.create({ id: "under", z: 300, width: 100 }, { key: "under", ref: keep(pads, "under") }),
        FlipPad.create({ id: "flip", z: 301, width: 100 }, { key: "flip", ref: keep(pads, "flip") }),
      ],
    });
    frames(5);
    const layer = graph.getGraphLayer();
    layer.handleEvent(new MouseEvent("mousemove", { clientX: 50, clientY: 25 }));
    expect(layer.$hoveredComponent.value === pads.flip).toBe(true);
    expect(graph.scene.tags.peekOf("pad", "flip").has(hoveredTag)).toBe(true);

    (pads.flip as FlipPad).glass = true;
    (pads.flip as FlipPad).widen(120);
    frames(3);

    expect(layer.$hoveredComponent.value === pads.under).toBe(true);
    expect(graph.scene.tags.peekOf("pad", "flip").has(hoveredTag)).toBe(false);
    expect(graph.scene.tags.peekOf("pad", "under").has(hoveredTag)).toBe(true);
    graph.unmount();
  });
});

describe("components transparent to events", () => {
  let graph: Graph;
  const pads: Record<string, Pad> = {};
  const keep =
    (id: string) =>
    (pad: Pad): void => {
      pads[id] = pad;
    };

  beforeEach(() => {
    graph = new Graph({}, document.createElement("div"));
    graph.start();
    graph.cameraService.set({ x: 0, y: 0, scale: 1 });
    graph.addLayer(TestLayer, {
      children: [
        Pad.create({ id: "under", z: 300, width: 100 }, { key: "under", ref: keep("under") }),
        GlassPad.create({ id: "glass", z: 301, width: 300 }, { key: "glass", ref: keep("glass") }),
      ],
    });
    frames(5);
  });

  afterEach(() => graph.unmount());

  it("is skipped by getElementOverPoint and returned by getElementsOverPoint", () => {
    expect(graph.getElementOverPoint({ x: 50, y: 25 }) === pads.under).toBe(true);
    const all = graph.getElementsOverPoint({ x: 50, y: 25 });
    expect(all[0] === pads.glass).toBe(true);
    expect(all[1] === pads.under).toBe(true);
    // Over the glass pad alone the point reaches nothing.
    expect(graph.getElementOverPoint({ x: 200, y: 25 })).toBeUndefined();
    expect(graph.getElementOverPoint({ x: 50, y: 25 }, [GraphComponent]) === pads.under).toBe(true);
    expect(graph.getElementOverPoint({ x: 50, y: 25 }, [GlassPad])).toBeUndefined();
    expect(graph.getElementOverPoint({ x: 50, y: 25 }, [Pad]) === pads.under).toBe(true);
  });

  it("lets the pointer target, the hover and the hovered tag reach the component under it", () => {
    graph.getGraphLayer().handleEvent(new MouseEvent("mousemove", { clientX: 50, clientY: 25 }));
    expect(graph.getGraphLayer().$hoveredComponent.value === pads.under).toBe(true);
    expect(graph.scene.tags.peekOf("pad", "under").has(hoveredTag)).toBe(true);
    expect(graph.scene.tags.peekOf("pad", "glass").has(hoveredTag)).toBe(false);
  });

  it("keeps its hit box in the usable rect and in rect queries", () => {
    expect(graph.hitTest.$usableRect.value).toEqual({ x: 0, y: 0, width: 300, height: 50 });
    expect(graph.getElementsOverRect({ x: 150, y: 0, width: 10, height: 10 }).includes(pads.glass)).toBe(true);
  });

  it("keeps the ports of a transparent component in findPortAtPoint (a spatial query)", () => {
    pads.glass.updatePort("p", { x: 200, y: 25 });
    const port = graph.connections.ports.findPortAtPoint({ x: 200, y: 25 }, 5);
    expect(port?.id).toBe("p");
  });

  it("does not capture a transparent component; an ordinary capture still holds", () => {
    const layer = graph.getGraphLayer();
    layer.captureEvents(pads.glass);
    layer.handleEvent(new MouseEvent("mousemove", { clientX: 50, clientY: 25 }));
    expect(layer.$hoveredComponent.value === pads.under).toBe(true);

    layer.captureEvents(pads.under);
    layer.handleEvent(new MouseEvent("mousemove", { clientX: 200, clientY: 25 }));
    expect(layer.$hoveredComponent.value === pads.under).toBe(true);
    layer.releaseCapture();
  });
});
