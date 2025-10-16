import { Graph } from "../../graph";

import { HighlightService, HighlightVisualMode } from "./HighlightService";

describe("HighlightService", () => {
  let graph: Graph;
  let service: HighlightService;

  beforeEach(() => {
    graph = new Graph({});
    service = new HighlightService(graph);
  });

  it("highlight(): sets mode and targets; non-targets undefined", () => {
    const spy = jest.fn();
    graph.on("highlight-changed", spy);

    service.highlight({ block: ["A", "B"], connection: ["X"] });

    expect(service.$state.value.active).toBe(true);
    expect(service.$state.value.mode).toBe("highlight");
    expect(service.getEntityHighlightMode("block:A")).toBe(HighlightVisualMode.Highlight);
    expect(service.getEntityHighlightMode("block:B")).toBe(HighlightVisualMode.Highlight);
    expect(service.getEntityHighlightMode("connection:X")).toBe(HighlightVisualMode.Highlight);
    expect(service.getEntityHighlightMode("block:C")).toBeUndefined();

    expect(spy).toHaveBeenCalled();
    const evt = spy.mock.calls[0]?.[0] as CustomEvent;
    expect(evt.detail.mode).toBe("highlight");
    expect(new Set(evt.detail.entities)).toEqual(new Set(["block:A", "block:B", "connection:X"]));
  });

  it("focus(): targets highlighted, others lowlight", () => {
    service.focus({ block: ["A"] });
    expect(service.$state.value.mode).toBe("focus");
    expect(service.getEntityHighlightMode("block:A")).toBe(HighlightVisualMode.Highlight);
    expect(service.getEntityHighlightMode("block:B")).toBe(HighlightVisualMode.Lowlight);
  });

  it("clear(): resets state and emits", () => {
    const spy = jest.fn();
    graph.on("highlight-changed", spy);

    service.highlight({ block: ["A"] });
    service.clear();

    expect(service.$state.value.active).toBe(false);
    expect(service.$state.value.mode).toBeUndefined();
    expect(service.getEntityHighlightMode("block:A")).toBeUndefined();

    expect(spy).toHaveBeenCalledTimes(2);
    const evt = spy.mock.calls[1]?.[0] as CustomEvent;
    expect(evt.detail.mode).toBeUndefined();
    expect(evt.detail.entities).toEqual([]);
  });

  it("accepts precomposed ids with prefix", () => {
    service.highlight({ myApp: ["q"], block: ["A"], plugin: ["p:inner"] });
    // plugin already includes ':' should be preserved as-is
    // myApp and block should be prefixed
    expect(service.getEntityHighlightMode("myApp:q")).toBe(HighlightVisualMode.Highlight);
    expect(service.getEntityHighlightMode("block:A")).toBe(HighlightVisualMode.Highlight);
    expect(service.getEntityHighlightMode("plugin:p:inner")).toBe(HighlightVisualMode.Highlight);
  });
});
