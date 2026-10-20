import React from "react";

import { GraphContextProvider } from "@gravity-ui/graph-react";
import { ThemeProvider } from "@gravity-ui/uikit";
import { act, render, screen } from "@testing-library/react";

import { getUikitGraphStore } from "../store/UikitGraphStore";
import { createUikitGraph, disposeUikitGraph, getBlockView } from "../test-utils/graphFixture";

import { GraphTooltip } from "./GraphTooltip";
import type { TGraphTooltipProps } from "./GraphTooltip";
import { resolveGraphEntity } from "./entity";

function renderTooltip(props: Partial<TGraphTooltipProps> = {}): ReturnType<typeof createUikitGraph> {
  const fixture = createUikitGraph();
  render(
    <ThemeProvider theme="light">
      <GraphContextProvider graph={fixture.graph}>
        <GraphTooltip content={(entity) => `Tooltip ${String(entity.id)}`} {...props} />
      </GraphContextProvider>
    </ThemeProvider>
  );
  return fixture;
}

function hoverBlock(fixture: ReturnType<typeof createUikitGraph>): void {
  const entity = resolveGraphEntity(getBlockView(fixture.graph, "a"));
  if (!entity) throw new Error("Expected an entity");
  act(() => {
    getUikitGraphStore(fixture.graph).$hovered.value = { entity, worldPoint: null };
  });
}

describe("GraphTooltip", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("opens after the delay and closes when the hover ends", () => {
    const fixture = renderTooltip({ openDelay: 500 });

    hoverBlock(fixture);
    expect(screen.queryByText("Tooltip a")).toBeNull();
    act(() => jest.advanceTimersByTime(500));
    expect(screen.getByText("Tooltip a")).toBeTruthy();

    act(() => {
      getUikitGraphStore(fixture.graph).$hovered.value = null;
    });
    act(() => jest.advanceTimersByTime(0));
    expect(screen.queryByText("Tooltip a")).toBeNull();

    disposeUikitGraph(fixture);
  });

  it("renders nothing when content returns null or the kind is filtered out", () => {
    const fixture = renderTooltip({ openDelay: 0, kinds: ["connection"] });

    hoverBlock(fixture);
    act(() => jest.advanceTimersByTime(0));
    expect(screen.queryByText("Tooltip a")).toBeNull();

    disposeUikitGraph(fixture);
  });

  it("hides while the pointer is pressed", () => {
    const fixture = renderTooltip({ openDelay: 0 });

    hoverBlock(fixture);
    act(() => jest.advanceTimersByTime(0));
    expect(screen.getByText("Tooltip a")).toBeTruthy();

    act(() => {
      getUikitGraphStore(fixture.graph).$pointerPressed.value = true;
    });
    act(() => jest.advanceTimersByTime(0));
    expect(screen.queryByText("Tooltip a")).toBeNull();

    disposeUikitGraph(fixture);
  });
});
