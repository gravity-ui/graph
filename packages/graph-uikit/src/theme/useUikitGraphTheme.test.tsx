import React from "react";

import { Graph } from "@gravity-ui/graph";
import { ThemeProvider } from "@gravity-ui/uikit";
import { render } from "@testing-library/react";

import { getUikitGraphStore } from "../store/UikitGraphStore";

import { DEFAULT_UIKIT_PALETTE } from "./palette";
import { readUikitTheme } from "./resolveUikitTheme";
import type { TUikitGraphTheme } from "./types";
import { DEFAULT_UIKIT_TYPOGRAPHY } from "./typography";
import { useUikitGraphTheme } from "./useUikitGraphTheme";

jest.mock("./resolveUikitTheme", () => ({
  ...jest.requireActual("./resolveUikitTheme"),
  readUikitTheme: jest.fn(),
}));

const readUikitThemeMock = jest.mocked(readUikitTheme);

function themeWith(background: string, isAvailable = true): TUikitGraphTheme {
  return {
    isAvailable,
    colors: { block: { background } },
    palette: { ...DEFAULT_UIKIT_PALETTE, blockHoverBorder: `${background}-hover` },
    typography: DEFAULT_UIKIT_TYPOGRAPHY,
  };
}

function Probe({ graph }: { graph: Graph }): null {
  useUikitGraphTheme(graph);
  return null;
}

function createGraph(): Graph {
  return new Graph({}, document.createElement("div"));
}

describe("useUikitGraphTheme", () => {
  afterEach(() => readUikitThemeMock.mockReset());

  it("applies theme colors and palette on mount and on theme change", () => {
    const graph = createGraph();
    readUikitThemeMock.mockImplementation(() => themeWith(document.body.className.includes("dark") ? "dark" : "light"));

    const { rerender } = render(
      <ThemeProvider theme="light">
        <Probe graph={graph} />
      </ThemeProvider>
    );
    expect(graph.graphColors.block.background).toBe("light");
    expect(getUikitGraphStore(graph).$palette.value.blockHoverBorder).toBe("light-hover");

    rerender(
      <ThemeProvider theme="dark">
        <Probe graph={graph} />
      </ThemeProvider>
    );
    expect(graph.graphColors.block.background).toBe("dark");
    expect(readUikitThemeMock).toHaveBeenLastCalledWith(graph.layers.$root);

    graph.unmount();
  });

  it("applies the user color patch on top of the theme", () => {
    const graph = createGraph();
    readUikitThemeMock.mockReturnValue(themeWith("theme"));
    getUikitGraphStore(graph).$colorsPatch.value = { block: { background: "user" } };

    render(
      <ThemeProvider theme="light">
        <Probe graph={graph} />
      </ThemeProvider>
    );

    expect(graph.graphColors.block.background).toBe("user");
    graph.unmount();
  });

  it("keeps graph colors and warns once when uikit tokens are missing", () => {
    const graph = createGraph();
    const before = graph.graphColors.block.background;
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    readUikitThemeMock.mockReturnValue(themeWith("", false));

    const { rerender } = render(
      <ThemeProvider theme="light">
        <Probe graph={graph} />
      </ThemeProvider>
    );
    rerender(
      <ThemeProvider theme="dark">
        <Probe graph={graph} />
      </ThemeProvider>
    );

    expect(graph.graphColors.block.background).toBe(before);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
    graph.unmount();
  });
});
