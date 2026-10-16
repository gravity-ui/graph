import React, { StrictMode, Suspense } from "react";

import { Graph } from "@gravity-ui/graph";
import { act, render, renderHook } from "@testing-library/react";

import { GraphCanvas } from "../GraphCanvas";

import { useGraph } from "./useGraph";

test("setViewConfiguration applies its argument and preserves resolved neighbors", () => {
  const graph = new Graph({});
  const { result, unmount } = renderHook(() =>
    useGraph({
      graph,
      viewConfiguration: { colors: { block: { border: "#111111" } }, constants: { camera: { SPEED: 1 } } },
    })
  );
  act(() =>
    result.current.setViewConfiguration({
      colors: { block: { border: "#222222" } },
      constants: { camera: { SPEED: 2 } },
    })
  );
  expect(graph.graphColors.block.border).toBe("#222222");
  expect(graph.graphColors.block.background).toBeDefined();
  expect(graph.graphConstants.camera.SPEED).toBe(2);
  expect(graph.graphConstants.camera.PAN_SPEED).toBe(1);
  unmount();
  graph.unmount();
});

function OwnedGraphApp({ onGraph }: { onGraph: (graph: Graph) => void }): React.ReactElement {
  const { graph } = useGraph({});
  onGraph(graph);
  return <GraphCanvas graph={graph} renderBlock={() => <div />} />;
}

function ExternalGraphApp({ graph }: { graph: Graph }): React.ReactElement {
  const result = useGraph({ graph });
  return <GraphCanvas graph={result.graph} renderBlock={() => <div />} />;
}

afterEach(() => {
  jest.restoreAllMocks();
});

/** Owned-graph disposal is deferred by one macrotask; let it run inside act. */
async function flushDeferredDisposal(): Promise<void> {
  await act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
}

test("an owned graph survives StrictMode effect replay", async () => {
  let graph: Graph | undefined;
  const { container, unmount } = render(
    <StrictMode>
      <OwnedGraphApp onGraph={(g) => (graph = g)} />
    </StrictMode>
  );
  await flushDeferredDisposal();

  expect(graph).toBeInstanceOf(Graph);
  expect(graph?.layers.getLayers()).toHaveLength(5);
  expect(container.querySelectorAll("canvas")).toHaveLength(3);
  unmount();
  await flushDeferredDisposal();
});

test("an owned graph survives a Suspense boundary hiding and revealing its content", async () => {
  let graph: Graph | undefined;
  let resolveSuspension: () => void = () => undefined;
  const suspension = new Promise<void>((resolve) => (resolveSuspension = resolve));
  let suspended = false;
  function Suspender(): null {
    if (suspended) {
      throw suspension;
    }
    return null;
  }
  // A fresh element each time: rerendering the identical element would bail out without rendering.
  const renderApp = (): React.ReactElement => (
    <StrictMode>
      <Suspense fallback={<span>loading</span>}>
        <OwnedGraphApp onGraph={(g) => (graph = g)} />
        <Suspender />
      </Suspense>
    </StrictMode>
  );
  const { container, findByText, rerender, unmount } = render(renderApp());
  await flushDeferredDisposal();
  const committed = graph;

  suspended = true;
  rerender(renderApp());
  expect(await findByText("loading")).toBeInstanceOf(HTMLSpanElement);
  await flushDeferredDisposal();
  suspended = false;
  await act(async () => resolveSuspension());
  await flushDeferredDisposal();

  expect(graph).toBe(committed);
  expect(graph?.layers.getLayers()).toHaveLength(5);
  expect(container.querySelectorAll("canvas")).toHaveLength(3);
  unmount();
  await flushDeferredDisposal();
});

test("unmounting the component disposes the owned graph", async () => {
  let graph: Graph | undefined;
  const { unmount } = render(<OwnedGraphApp onGraph={(g) => (graph = g)} />);
  if (!graph) {
    throw new Error("useGraph did not return a graph");
  }
  expect(graph.layers.getLayers()).toHaveLength(5);
  const unmountSpy = jest.spyOn(graph, "unmount");

  unmount();
  await flushDeferredDisposal();

  expect(unmountSpy).toHaveBeenCalledTimes(1);
  expect(graph.layers.getLayers()).toHaveLength(0);
});

test("unmounting under StrictMode disposes the committed owned graph", async () => {
  let graph: Graph | undefined;
  const { unmount } = render(
    <StrictMode>
      <OwnedGraphApp onGraph={(g) => (graph = g)} />
    </StrictMode>
  );
  await flushDeferredDisposal();

  unmount();
  await flushDeferredDisposal();

  expect(graph?.layers.getLayers()).toHaveLength(0);
});

test("remounting with a new key disposes the old owned graph and keeps the new one", async () => {
  const graphs = new Map<string, Graph>();
  const renderApp = (key: string): React.ReactElement => (
    <StrictMode>
      <OwnedGraphApp key={key} onGraph={(g) => graphs.set(key, g)} />
    </StrictMode>
  );
  const { rerender, unmount } = render(renderApp("a"));
  await flushDeferredDisposal();
  // One commit runs the cleanup of graph "a" and the setup of graph "b".
  rerender(renderApp("b"));
  await flushDeferredDisposal();

  expect(graphs.get("a")?.layers.getLayers()).toHaveLength(0);
  expect(graphs.get("b")?.layers.getLayers()).toHaveLength(5);
  unmount();
  await flushDeferredDisposal();
});

test("switching from an owned graph to an external graph disposes only the owned one", async () => {
  const external = new Graph({});
  let owned: Graph | undefined;
  function SwitchingApp({ graph }: { graph?: Graph }): React.ReactElement {
    const result = useGraph({ graph });
    if (!graph) {
      owned = result.graph;
    }
    return <GraphCanvas graph={result.graph} renderBlock={() => <div />} />;
  }
  const { rerender, unmount } = render(
    <StrictMode>
      <SwitchingApp />
    </StrictMode>
  );
  await flushDeferredDisposal();
  rerender(
    <StrictMode>
      <SwitchingApp graph={external} />
    </StrictMode>
  );
  await flushDeferredDisposal();

  expect(owned?.layers.getLayers()).toHaveLength(0);
  expect(external.layers.getLayers()).toHaveLength(5);
  unmount();
  await flushDeferredDisposal();
  external.unmount();
});

test.each([
  ["without StrictMode", false],
  ["with StrictMode", true],
])("an external graph is never disposed by the hook (%s)", async (_, strict) => {
  const graph = new Graph({});
  const unmountSpy = jest.spyOn(graph, "unmount");
  const app = <ExternalGraphApp graph={graph} />;
  const { container, unmount } = render(strict ? <StrictMode>{app}</StrictMode> : app);
  await flushDeferredDisposal();
  expect(container.querySelectorAll("canvas")).toHaveLength(3);

  unmount();
  await flushDeferredDisposal();

  expect(unmountSpy).not.toHaveBeenCalled();
  // GraphCanvas removes its own ReactLayer; the graph's core layers stay alive.
  expect(graph.layers.getLayers()).toHaveLength(4);
  graph.unmount();
});
