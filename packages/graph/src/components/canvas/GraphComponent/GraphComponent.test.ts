import { Graph } from "../../../graph";
import { GraphEventsDefinitions } from "../../../graphEvents";
import { Component } from "@gravity-ui/graph-canvas-core";
import { HitBox } from "../../../services/HitTest";

import { GraphComponent, GraphComponentContext } from "./index";

class TestGraphComponent extends GraphComponent {
  public getEntityId(): string {
    return "test-id";
  }

  public subscribeGraphEvent<EventName extends keyof GraphEventsDefinitions>(
    eventName: EventName,
    handler: GraphEventsDefinitions[EventName],
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
