import type { Graph } from "../../../graph";
import { createInitialResolvedGraphColors, initGraphConstants } from "../../../graphConfig";
import { GraphEventListener, GraphEventsDefinitions } from "../../../graphEvents";
import { Component, TComponentState } from "../../../lib/Component";
import type { CoreComponentProps } from "../../../lib/CoreComponent";
import { CoreComponent } from "../../../lib/CoreComponent";
import { HitBox } from "../../../services/HitTest";
import type { Layer } from "../../../services/Layer";
import type { ICamera } from "../../../services/camera/CameraService";

import { GraphComponent, GraphComponentContext } from "./index";

class TestGraphComponent extends GraphComponent {
  public getEntityId(): string {
    return "test-id";
  }

  public subscribeGraphEvent<EventName extends keyof GraphEventsDefinitions>(
    eventName: EventName,
    handler: GraphEventListener<EventName>,
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
  };

  const rootEl = root ?? document.createElement("div");
  const canvasEl = document.createElement("canvas");
  const ctx = canvasEl.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas 2D context is required for GraphComponent tests");
  }

  const rootHost = new CoreComponent<CoreComponentProps, GraphComponentContext>({}, undefined);
  const parent = new Component<CoreComponentProps, TComponentState, GraphComponentContext>({}, rootHost);

  const minimalCamera: Pick<ICamera, "isRectVisible"> = {
    isRectVisible: () => true,
  };

  const layerPlaceholder = {} as Layer;

  parent.setContext({
    // @ts-expect-error — test stub: partial Graph (only on / hitTest are used)
    graph: fakeGraph,
    root: rootEl,
    canvas: canvasEl,
    ctx,
    ownerDocument: document,
    camera: minimalCamera as ICamera,
    constants: initGraphConstants,
    colors: createInitialResolvedGraphColors(),
    graphCanvas: canvasEl,
    layer: layerPlaceholder,
    affectsUsableRect: true,
  });

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
