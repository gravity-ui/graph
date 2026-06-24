import type { Graph } from "../../graph";

import { HighlightService } from "./HighlightService";
import { HighlightVisualMode } from "./types";

describe("HighlightService", () => {
  function createService() {
    const executеDefaultEventAction = jest.fn(
      <TEventName extends string, TPayload>(_eventName: TEventName, _detail: TPayload, defaultCb: () => void) => {
        defaultCb();
      }
    );

    const graph = {
      executеDefaultEventAction,
    } as unknown as Graph;

    return {
      service: new HighlightService(graph),
      executеDefaultEventAction,
    };
  }

  it("highlight mode highlights only target entities", () => {
    const { service } = createService();

    service.highlight({
      block: ["a"],
    });

    expect(service.getEntityHighlightMode("block", "a")).toBe(HighlightVisualMode.Highlight);
    expect(service.getEntityHighlightMode("block", "b")).toBeUndefined();
    expect(service.getEntityHighlightMode("connection", "x")).toBeUndefined();
  });

  it("focus mode lowlights non-target entities", () => {
    const { service } = createService();

    service.focus({
      block: ["a"],
    });

    expect(service.getEntityHighlightMode("block", "a")).toBe(HighlightVisualMode.Highlight);
    expect(service.getEntityHighlightMode("block", "b")).toBe(HighlightVisualMode.Lowlight);
    expect(service.getEntityHighlightMode("connection", "x")).toBe(HighlightVisualMode.Lowlight);
  });

  it("clearHighlight resets state and mode", () => {
    const { service } = createService();

    service.focus({
      block: ["a"],
    });
    service.clearHighlight();

    expect(service.getEntityHighlightMode("block", "a")).toBeUndefined();
    expect(service.$state.value.active).toBe(false);
    expect(service.$state.value.mode).toBeUndefined();
  });

  it("emits highlight-changed through graph default action API", () => {
    const { service, executеDefaultEventAction } = createService();

    service.highlight({ block: ["a"] });
    service.focus({ block: ["b"] });
    service.clearHighlight();

    expect(executеDefaultEventAction).toHaveBeenCalledTimes(3);
    expect(executеDefaultEventAction.mock.calls[0]?.[0]).toBe("highlight-changed");
    expect(executеDefaultEventAction.mock.calls[1]?.[0]).toBe("highlight-changed");
    expect(executеDefaultEventAction.mock.calls[2]?.[0]).toBe("highlight-changed");
  });

  it("updates registered component via setHighlight without signal subscription", () => {
    const { service } = createService();
    const setHighlight = jest.fn(() => true);

    const component = {
      getEntityType: () => "block",
      getEntityId: () => "a",
      getHighlightVisualMode: () => undefined,
      setHighlight,
    };

    service.registerComponent(component);
    service.focus({ block: ["a"] });
    service.clearHighlight();
    service.unregisterComponent(component);

    expect(setHighlight).toHaveBeenCalledWith(undefined);
    expect(setHighlight).toHaveBeenCalledWith(HighlightVisualMode.Highlight);
    expect(setHighlight).toHaveBeenCalledWith(undefined);
  });
});
