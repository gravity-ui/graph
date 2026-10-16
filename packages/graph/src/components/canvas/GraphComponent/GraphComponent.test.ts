import { Graph } from "../../../graph";
import { GraphEventsDefinitions, UnwrapGraphEvents } from "../../../graphEvents";
import { Component } from "../../../lib/Component";
import { globalScheduler } from "../../../lib/Scheduler";
import { HitBox } from "../../../services/HitTest";
import { EAnchorType } from "../../../store/anchor/Anchor";
import { EventedComponent } from "../EventedComponent/EventedComponent";
import { Anchor } from "../anchors";
import { Block, TBlock } from "../blocks/Block";

import { GraphComponent, GraphComponentContext } from "./index";

class TestGraphComponent extends GraphComponent {
  public getEntityId(): string {
    return "test-id";
  }

  public subscribeGraphEvent<EventName extends keyof GraphEventsDefinitions>(
    eventName: EventName,
    handler: (event: UnwrapGraphEvents<EventName>) => void,
    options?: AddEventListenerOptions | boolean
  ): () => void {
    return this.onGraphEvent(eventName, handler, options);
  }

  public subscribeRootEvent<K extends keyof HTMLElementEventMap>(
    eventName: K,
    handler: (this: HTMLElement, ev: HTMLElementEventMap[K]) => void,
    options?: AddEventListenerOptions | boolean
  ): () => void {
    return this.onRootEvent(eventName, handler, options);
  }
}

type TestSetup = {
  component: TestGraphComponent;
  graphOn: jest.Mock<() => void, Parameters<Graph["on"]>>;
  graphOff: jest.Mock<void, []>;
  rootEl: HTMLDivElement;
  hitTestRemove: jest.Mock<void, [HitBox]>;
};

function createTestComponent(root?: HTMLDivElement): TestSetup {
  const graphOff = jest.fn();
  const graphOn = jest.fn<() => void, Parameters<Graph["on"]>>().mockReturnValue(graphOff);

  const hitTestRemove = jest.fn();
  const fakeGraph = {
    on: graphOn,
    hitTest: {
      remove: hitTestRemove,
      update: jest.fn(),
    },
    // The rest of Graph API is not needed for these tests
  };

  const rootEl = root ?? document.createElement("div");

  const parent = new Component({}, undefined);

  parent.setContext({
    graph: fakeGraph,
    root: rootEl,
    canvas: document.createElement("canvas"),
    ctx: document.createElement("canvas").getContext("2d") as CanvasRenderingContext2D,
    ownerDocument: document,
    camera: {
      isRectVisible: () => true,
    },
    constants: {} as GraphComponentContext["constants"],
    colors: {} as GraphComponentContext["colors"],
    graphCanvas: document.createElement("canvas"),
    layer: {} as GraphComponentContext["layer"],
    affectsUsableRect: true,
  } as unknown as GraphComponentContext);

  const component = new TestGraphComponent({}, parent);

  return {
    component,
    graphOn,
    graphOff,
    rootEl,
    hitTestRemove,
  };
}

describe("GraphComponent event helpers", () => {
  it("subscribes to graph events via onGraphEvent and cleans up on unmount", () => {
    const { component, graphOn, graphOff } = createTestComponent();

    const handler = jest.fn();

    component.subscribeGraphEvent("camera-change", handler);

    expect(graphOn).toHaveBeenCalledTimes(1);
    expect(graphOn).toHaveBeenCalledWith("camera-change", handler, undefined);

    Component.unmount(component);

    expect(graphOff).toHaveBeenCalledTimes(1);
  });

  it("subscribes to root DOM events via onRootEvent and cleans up on unmount", () => {
    const rootEl = document.createElement("div");
    const addSpy = jest.spyOn(rootEl, "addEventListener");
    const removeSpy = jest.spyOn(rootEl, "removeEventListener");

    const { component } = createTestComponent(rootEl);

    const handler = jest.fn((event: MouseEvent) => {
      // Use event to keep types happy
      expect(event).toBeInstanceOf(MouseEvent);
    });

    component.subscribeRootEvent("click", handler);

    expect(addSpy).toHaveBeenCalledTimes(1);
    const [eventName, addListener] = addSpy.mock.calls[0];
    expect(eventName).toBe("click");
    expect(typeof addListener).toBe("function");

    const event = new MouseEvent("click");
    rootEl.dispatchEvent(event);
    expect(handler).toHaveBeenCalledTimes(1);

    Component.unmount(component);

    expect(removeSpy).toHaveBeenCalledTimes(1);
    const [removedEventName, removeListener] = removeSpy.mock.calls[0];
    expect(removedEventName).toBe("click");
    expect(typeof removeListener).toBe("function");
  });
});

describe("GraphComponent.onUnmounted", () => {
  const block: TBlock = {
    id: "b1",
    is: "Block",
    x: 0,
    y: 0,
    width: 100,
    height: 50,
    selected: false,
    name: "b1",
    anchors: [],
  };

  const graphs: Graph[] = [];

  afterEach(() => {
    graphs.splice(0).forEach((graph) => graph.unmount());
  });

  async function mountBlock(data: TBlock = block): Promise<{ graph: Graph; view: Block }> {
    const graph = new Graph({ blocks: [data], connections: [] }, document.createElement("div"));
    graphs.push(graph);
    graph.start();
    await new Promise<void>((resolve) => graph.hitTest.waitUsableRectUpdate(() => resolve()));
    const [view] = graph.getElementsOverRect({ x: 0, y: 0, width: 100, height: 50 }, [Block]);
    if (!view) throw new Error("Expected the block view to be mounted");
    return { graph, view };
  }

  function getAnchorViews(graph: Graph, ids: string[]): Anchor[] {
    const blockState = graph.rootStore.blocksList.getBlockState(block.id);
    return ids.map((id) => {
      const anchorView = blockState?.getAnchorState(id)?.getViewComponent();
      if (!(anchorView instanceof Anchor)) throw new Error(`Expected anchor ${id} to be mounted`);
      return anchorView;
    });
  }

  function removeBlocks(graph: Graph): void {
    graph.setEntities({ blocks: [], connections: [] });
    globalScheduler.performUpdate();
    globalScheduler.performUpdate();
  }

  function dispatchUnmounted(view: Block): void {
    view.dispatchEvent(new CustomEvent("graph-component-unmounted", { detail: { component: view } }));
  }

  it("runs registered callbacks exactly once when a mounted component is removed", async () => {
    const { graph, view } = await mountBlock();
    const onUnmounted = jest.fn();
    const listener = jest.fn<void, [Event]>();
    view.onUnmounted(onUnmounted);
    view.addEventListener("graph-component-unmounted", listener);

    removeBlocks(graph);

    expect(graph.getElementsOverRect({ x: 0, y: 0, width: 100, height: 50 }, [Block])).not.toContain(view);
    expect(onUnmounted).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0]).toMatchObject({ detail: { component: view } });

    dispatchUnmounted(view);
    expect(onUnmounted).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("runs callbacks of non-interactive components", async () => {
    const { graph, view } = await mountBlock();
    const onUnmounted = jest.fn();
    view.setInteractive(false);
    globalScheduler.performUpdate();
    expect(view.isInteractive()).toBe(false);
    view.onUnmounted(onUnmounted);

    removeBlocks(graph);

    expect(onUnmounted).toHaveBeenCalledTimes(1);
  });

  it("runs callbacks when the whole graph is unmounted", async () => {
    const { graph, view } = await mountBlock();
    const onUnmounted = jest.fn();
    view.onUnmounted(onUnmounted);

    graphs.splice(graphs.indexOf(graph), 1);
    graph.unmount();

    expect(onUnmounted).toHaveBeenCalledTimes(1);
  });

  it("does not run a parent's callback when its children are unmounted", async () => {
    const anchors = [
      { id: "a1", blockId: "b1", type: EAnchorType.IN },
      { id: "a2", blockId: "b1", type: EAnchorType.OUT },
    ];
    const { graph, view } = await mountBlock({ ...block, anchors });
    const anchorViews = getAnchorViews(graph, ["a1", "a2"]);
    const onBlockUnmounted = jest.fn();
    const onAnchorUnmounted = jest.fn();
    view.onUnmounted(onBlockUnmounted);
    anchorViews.forEach((anchorView) => anchorView.onUnmounted(onAnchorUnmounted));

    graph.setEntities({ blocks: [{ ...block, anchors: [anchors[0]] }], connections: [] });
    globalScheduler.performUpdate();
    globalScheduler.performUpdate();

    expect(anchorViews[1].isMounted()).toBe(false);
    expect(onAnchorUnmounted).toHaveBeenCalledTimes(1);
    expect(onBlockUnmounted).not.toHaveBeenCalled();

    removeBlocks(graph);

    expect(onAnchorUnmounted).toHaveBeenCalledTimes(2);
    expect(onBlockUnmounted).toHaveBeenCalledTimes(1);
  });

  it("runs a parent's callback once when it is unmounted together with its children", async () => {
    const anchors = [{ id: "a1", blockId: "b1", type: EAnchorType.IN }];
    const { graph, view } = await mountBlock({ ...block, anchors });
    expect(getAnchorViews(graph, ["a1"])).toHaveLength(1);
    const onBlockUnmounted = jest.fn();
    view.onUnmounted(onBlockUnmounted);

    removeBlocks(graph);

    expect(onBlockUnmounted).toHaveBeenCalledTimes(1);
  });

  it("does not dispatch again when a callback unmounts its own component", async () => {
    const { view } = await mountBlock();
    const onUnmounted = jest.fn(() => Component.unmount(view));
    view.onUnmounted(onUnmounted);

    // The view stays in its parent's children, so afterEach unmounts it a second time.
    expect(() => Component.unmount(view)).not.toThrow();
    expect(onUnmounted).toHaveBeenCalledTimes(1);

    dispatchUnmounted(view);
    expect(onUnmounted).toHaveBeenCalledTimes(1);
  });

  it("still bubbles the event to evented ancestors", () => {
    const { component } = createTestComponent();
    const parent = component.getParent();
    if (!(parent instanceof Component)) throw new Error("Expected a component parent");
    const evented = new EventedComponent({}, parent);
    const child = new TestGraphComponent({}, evented);
    const ancestorListener = jest.fn<void, [Event]>();
    evented.addEventListener("graph-component-unmounted", ancestorListener);

    Component.unmount(child);

    expect(ancestorListener).toHaveBeenCalledTimes(1);
    expect(ancestorListener.mock.calls[0][0]).toMatchObject({ detail: { component: child } });
  });

  it("clears listeners even when an unmount callback throws", async () => {
    const { view } = await mountBlock();
    const failing = jest.fn(() => {
      throw new Error("listener failed");
    });
    view.onUnmounted(failing);

    // The view stays in its parent's children, so afterEach unmounts it a second time.
    expect(() => Component.unmount(view)).toThrow("listener failed");
    expect(failing).toHaveBeenCalledTimes(1);

    dispatchUnmounted(view);
    expect(failing).toHaveBeenCalledTimes(1);
  });
});
