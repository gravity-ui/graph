import StyleObserver from "style-observer";

import { Graph } from "../../graph";
import { Component } from "../../lib/Component";

import { CSSVariablesLayer } from "./CSSVariablesLayer";
import { SUPPORTED_CSS_VARIABLES } from "./constants";

jest.mock("style-observer", () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({ unobserve: jest.fn() })),
}));

const MockStyleObserver = jest.mocked(StyleObserver);

describe("CSSVariablesLayer additional variables", () => {
  let graph: Graph;
  let layer: CSSVariablesLayer;
  let root: HTMLDivElement;
  let style: HTMLStyleElement;
  const onChange = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    graph = new Graph({});
    root = document.createElement("div");
    style = document.createElement("style");
    style.textContent = ".custom-theme { --custom-highlight: red; }";
    document.head.appendChild(style);
    document.body.appendChild(root);
    layer = new CSSVariablesLayer({
      graph,
      camera: graph.cameraService,
      containerClass: "custom-theme",
      additionalCSSVariables: ["--custom-highlight"],
      onChange,
    });
  });

  afterEach(() => {
    Component.unmount(layer);
    root.remove();
    style.remove();
  });

  it("reads initial custom values and observes them alongside built-in variables without mappings", () => {
    const setColors = jest.spyOn(graph, "setColors");
    const setConstants = jest.spyOn(graph, "setConstants");
    layer.attachLayer(root);

    expect(MockStyleObserver.mock.calls[0][1].properties).toEqual([...SUPPORTED_CSS_VARIABLES, "--custom-highlight"]);
    expect(onChange).toHaveBeenCalledWith([{ name: "--custom-highlight", value: "red", oldValue: "" }]);
    expect(setColors).not.toHaveBeenCalled();
    expect(setConstants).not.toHaveBeenCalled();
  });

  it("reports custom changes and preserves built-in mappings while ignoring unregistered variables", () => {
    layer.attachLayer(root);
    onChange.mockClear();
    const notifyChanges = MockStyleObserver.mock.calls[0][0];
    notifyChanges([
      { property: "--custom-highlight", value: "blue", oldValue: "red" },
      { property: "--graph-block-background", value: "green", oldValue: "" },
      { property: "--unregistered", value: "ignored", oldValue: "" },
    ] as Parameters<typeof notifyChanges>[0]);

    expect(onChange).toHaveBeenCalledWith([
      { name: "--custom-highlight", value: "blue", oldValue: "red" },
      { name: "--graph-block-background", value: "green", oldValue: "" },
    ]);
    expect(graph.graphColors.block.background).toBe("green");
  });

  it("restarts observation with updated props and removes custom variables when cleared", () => {
    layer.attachLayer(root);
    layer.iterate();
    const firstObserver = MockStyleObserver.mock.results[0].value;
    const firstContainer = layer.getHTML().firstElementChild;

    layer.setProps({ additionalCSSVariables: ["--other-highlight"], containerClass: "other-theme" });
    layer.iterate();

    expect(firstObserver.unobserve).toHaveBeenCalledWith(firstContainer);
    expect(layer.getHTML().firstElementChild.className).toBe("other-theme");
    expect(MockStyleObserver.mock.calls[1][1].properties).toEqual([...SUPPORTED_CSS_VARIABLES, "--other-highlight"]);
    onChange.mockClear();
    const notifyChanges = MockStyleObserver.mock.calls[1][0];
    notifyChanges([
      { property: "--other-highlight", value: "blue", oldValue: "" },
      { property: "--custom-highlight", value: "green", oldValue: "red" },
    ] as Parameters<typeof notifyChanges>[0]);
    expect(onChange).toHaveBeenCalledWith([{ name: "--other-highlight", value: "blue", oldValue: "" }]);

    layer.setProps({ additionalCSSVariables: undefined });
    layer.iterate();
    expect(MockStyleObserver.mock.calls[2][1].properties).toEqual([...SUPPORTED_CSS_VARIABLES]);
  });
});
