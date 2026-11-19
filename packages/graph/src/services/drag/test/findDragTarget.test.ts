import { GraphComponent } from "../../../components/canvas/GraphComponent";
import type { TGraphComponentProps } from "../../../components/canvas/GraphComponent";
import { TestLayer, frames } from "../../../components/canvas/scene/test/utils/sceneTestKit";
import { Graph } from "../../../graph";
import { Component } from "../../../lib/Component";
import type { ChildDescriptor } from "../../../lib/CoreComponent";
import { findDragTarget } from "../utils/findDragTarget";

/**
 * `findDragTarget`: a press drags the pressed component when it is draggable, else its nearest
 * draggable ancestor; nothing when the chain has no draggable graph component.
 */

type TNodeProps = TGraphComponentProps & { id: string; draggable: boolean; children?: ChildDescriptor[] };

/** A graph component whose draggability is a prop, with the given children. */
class Node extends GraphComponent<TNodeProps> {
  public static entityType = "node";

  public override getEntityId(): string {
    return this.props.id;
  }

  public override isDraggable(): boolean {
    return this.props.draggable;
  }

  protected override updateChildren(): ChildDescriptor[] {
    return this.props.children ?? [];
  }
}

/** A container that is not a graph component. Its `isDraggable` says yes, and the walk must not take it. */
class Wrapper extends Component<{ children: ChildDescriptor[] }> {
  public isDraggable(): boolean {
    return true;
  }

  protected override updateChildren(): ChildDescriptor[] {
    return this.props.children;
  }
}

describe("findDragTarget", () => {
  let graph: Graph;
  let nodes: Record<string, Node>;
  let wrapper: Wrapper | undefined;

  const node = (id: string, draggable: boolean, children: ChildDescriptor[] = []): ChildDescriptor =>
    Node.create(
      { id, draggable, children },
      {
        key: id,
        ref: (component: Node): void => {
          nodes[id] = component;
        },
      }
    );

  const wrap = (children: ChildDescriptor[]): ChildDescriptor =>
    Wrapper.create(
      { children },
      {
        key: "wrapper",
        ref: (component: Wrapper): void => {
          wrapper = component;
        },
      }
    );

  /** Mounts the given tree under a test layer: layer → container (not graph components) → the tree. */
  function mount(...children: ChildDescriptor[]): void {
    nodes = {};
    wrapper = undefined;
    graph = new Graph({}, document.createElement("div"));
    graph.start();
    graph.addLayer(TestLayer, { children });
    frames(5);
  }

  afterEach(() => {
    graph.unmount();
    jest.restoreAllMocks();
  });

  it("returns a draggable component itself, also when its parent is draggable too", () => {
    mount(node("block", true, [node("anchor", true)]));
    expect(findDragTarget(nodes.block) === nodes.block).toBe(true);
    // The anchor's case: a draggable target is its own drag target (it forwards the drag to its block itself).
    expect(findDragTarget(nodes.anchor) === nodes.anchor).toBe(true);
  });

  it("returns the nearest draggable ancestor of a grandchild", () => {
    mount(node("block", true, [node("panel", false, [node("button", false)])]));
    expect(findDragTarget(nodes.button) === nodes.block).toBe(true);
  });

  it("stops at the nearest draggable ancestor, not the outermost one", () => {
    mount(node("block", true, [node("panel", true, [node("button", false)])]));
    expect(findDragTarget(nodes.button) === nodes.panel).toBe(true);
  });

  it("returns undefined when nothing in the chain is draggable, and for no target", () => {
    mount(node("block", false, [node("panel", false, [node("button", false)])]));
    expect(findDragTarget(nodes.button)).toBeUndefined();
    expect(findDragTarget(nodes.block)).toBeUndefined();
    expect(findDragTarget(undefined)).toBeUndefined();
  });

  it("passes over parents that are not graph components, and never returns one", () => {
    mount(node("block", true, [wrap([node("button", false)])]), node("free", false, [wrap([node("lonely", false)])]));
    // The wrapper between the button and the block is passed over: the block is the drag target.
    expect(findDragTarget(nodes.button) === nodes.block).toBe(true);
    // Above `lonely`: a wrapper whose `isDraggable` says yes, a non-draggable node, the test container and the layer.
    expect(findDragTarget(nodes.lonely)).toBeUndefined();
    expect(wrapper?.isDraggable()).toBe(true);
    // The layer's camera is not a graph component either.
    expect(findDragTarget(graph.getGraphLayer().$.camera)).toBeUndefined();
  });

  it("does not check availability: an unavailable draggable ancestor is still the drag target", () => {
    mount(node("block", true, [node("button", false)]));
    jest.spyOn(nodes.block, "isEntityAvailable").mockReturnValue(false);
    expect(findDragTarget(nodes.button) === nodes.block).toBe(true);
  });
});
