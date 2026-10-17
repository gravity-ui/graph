import React, { StrictMode, Suspense, useEffect } from "react";

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

afterEach(async () => {
  jest.restoreAllMocks();
  await flushDeferredDisposal();
  // Every test disposes its graphs, so nothing may stay registered in the shared frame loop.
  expect(new Graph({}).scheduler.getSchedulers().flat()).toHaveLength(0);
});

/** Whether the graph's layers are updated on the next frame, i.e. the graph is live. */
function rendersOnNextFrame(graph: Graph | undefined): boolean {
  if (!graph) {
    throw new Error("Expected a committed graph");
  }
  const layer = graph.getGraphLayer();
  const iterate = jest.spyOn(layer, "iterate");
  layer.performRender();
  graph.scheduler.performUpdate();
  const rendered = iterate.mock.calls.length > 0;
  iterate.mockRestore();
  return rendered;
}

/** Captures the graph each committed render uses (StrictMode's discarded renders never commit). */
function useCommittedGraph(graph: Graph, onGraph?: (graph: Graph) => void): void {
  useEffect(() => {
    onGraph?.(graph);
  }, [graph, onGraph]);
}

function StartingApp({ onGraph }: { onGraph?: (graph: Graph) => void }): React.ReactElement {
  const { graph, start } = useGraph({});
  useEffect(() => start(), [graph, start]);
  useCommittedGraph(graph, onGraph);
  return <GraphCanvas graph={graph} renderBlock={() => <div />} />;
}

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
  await flushDeferredDisposal();
  const unmountSpy = jest.spyOn(graph, "unmount");

  unmount();

  // Disposal is synchronous once the mount pass is over.
  expect(unmountSpy).toHaveBeenCalledTimes(1);
  expect(graph.layers.getLayers()).toHaveLength(0);
});

test("an error thrown while disposing an owned graph reaches the error boundary", async () => {
  class Boundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
    public state = { failed: false };

    public static getDerivedStateFromError(): { failed: boolean } {
      return { failed: true };
    }

    public render(): React.ReactNode {
      return this.state.failed ? <span>failed</span> : this.props.children;
    }
  }
  let graph: Graph | undefined;
  const renderApp = (show: boolean): React.ReactElement => (
    <Boundary>{show ? <OwnedGraphApp onGraph={(g) => (graph = g)} /> : <span>hidden</span>}</Boundary>
  );
  const { findByText, rerender, unmount } = render(renderApp(true));
  await flushDeferredDisposal();
  if (!graph) {
    throw new Error("useGraph did not return a graph");
  }
  const unmountSpy = jest.spyOn(graph, "unmount").mockImplementation((): void => {
    throw new Error("dispose failed");
  });
  jest.spyOn(console, "error").mockImplementation((): void => undefined);

  rerender(renderApp(false));

  expect(await findByText("failed")).toBeInstanceOf(HTMLSpanElement);
  unmount();
  unmountSpy.mockRestore();
  graph.unmount();
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

test("disposing a replaced owned graph leaves the new graph rendering", async () => {
  let live: Graph | undefined;
  const renderApp = (key: string): React.ReactElement => (
    <StrictMode>
      <StartingApp key={key} onGraph={(g) => (live = g)} />
    </StrictMode>
  );
  const { rerender, unmount } = render(renderApp("a"));
  await flushDeferredDisposal();
  const first = live;

  rerender(renderApp("b"));
  await flushDeferredDisposal();

  expect(live).not.toBe(first);
  expect(rendersOnNextFrame(first)).toBe(false);
  expect(rendersOnNextFrame(live)).toBe(true);
  unmount();
  await flushDeferredDisposal();
});

test("a replacement mounted in the same pass as the first graph keeps rendering", async () => {
  let live: Graph | undefined;
  // A layout-effect state update re-renders synchronously, in the same pass as the first mount.
  function RemountingApp(): React.ReactElement {
    const [key, setKey] = React.useState("a");
    React.useLayoutEffect(() => {
      if (key === "a") {
        setKey("b");
      }
    }, [key]);
    return <StartingApp key={key} onGraph={(g) => (live = g)} />;
  }

  const { unmount } = render(<RemountingApp />);
  await flushDeferredDisposal();

  expect(rendersOnNextFrame(live)).toBe(true);
  unmount();
});

test("a replacement started in the layout phase keeps rendering", async () => {
  let live: Graph | undefined;
  // Attaches and starts in useLayoutEffect, before the old graph's passive cleanup disposes it.
  function LayoutStartingApp(): React.ReactElement {
    const { graph } = useGraph({});
    const rootRef = React.useRef<HTMLDivElement>(null);
    React.useLayoutEffect(() => {
      if (rootRef.current) {
        graph.attach(rootRef.current);
        graph.start();
      }
    }, [graph]);
    useCommittedGraph(graph, (g) => (live = g));
    return <div ref={rootRef} />;
  }
  const { rerender, unmount } = render(<LayoutStartingApp key="a" />);
  await flushDeferredDisposal();

  rerender(<LayoutStartingApp key="b" />);
  await flushDeferredDisposal();

  expect(rendersOnNextFrame(live)).toBe(true);
  unmount();
});

test.each([
  ["without StrictMode", false],
  ["with StrictMode", true],
])(
  // The StrictMode case also passes on the original hook; it guards against regressions.
  "the README pattern keeps rendering after a same-pass replacement (%s)",
  async (_, strict) => {
    let live: Graph | undefined;
    function ReadmeApp(): React.ReactElement {
      const { graph, setEntities, start } = useGraph({});
      React.useLayoutEffect(() => {
        setEntities({ blocks: [] });
        start();
      }, [graph, setEntities, start]);
      useCommittedGraph(graph, (g) => (live = g));
      return <GraphCanvas graph={graph} renderBlock={() => <div />} />;
    }
    function RemountingApp(): React.ReactElement {
      const [key, setKey] = React.useState("a");
      React.useLayoutEffect(() => {
        if (key === "a") {
          setKey("b");
        }
      }, [key]);
      return <ReadmeApp key={key} />;
    }
    const { unmount } = render(
      strict ? (
        <StrictMode>
          <RemountingApp />
        </StrictMode>
      ) : (
        <RemountingApp />
      )
    );
    await flushDeferredDisposal();

    expect(rendersOnNextFrame(live)).toBe(true);
    unmount();
  }
);

describe("a running external graph is not frozen by a deferred owned-graph disposal", () => {
  function ExternalStarted({ graph }: { graph: Graph }): React.ReactElement {
    useGraph({ graph });
    const rootRef = React.useRef<HTMLDivElement>(null);
    React.useLayoutEffect(() => {
      if (rootRef.current) {
        graph.attach(rootRef.current);
        graph.start();
      }
    }, [graph]);
    return <div ref={rootRef} />;
  }
  function Owned(): null {
    useGraph({});
    return null;
  }
  function useSamePassKey(): string {
    const [key, setKey] = React.useState("a");
    React.useLayoutEffect(() => {
      if (key === "a") {
        setKey("b");
      }
    }, [key]);
    return key;
  }

  test("when the next owned graph mounts in the same pass", async () => {
    const external = new Graph({});
    function App(): React.ReactElement {
      const key = useSamePassKey();
      return (
        <>
          {key === "b" && <ExternalStarted graph={external} />}
          <Owned key={key} />
        </>
      );
    }
    const { unmount } = render(<App />);
    await flushDeferredDisposal();

    expect(rendersOnNextFrame(external)).toBe(true);
    unmount();
    external.unmount();
  });

  test("while another unmounting hook still held the same external graph", async () => {
    const external = new Graph({});
    function Holder({ graph }: { graph: Graph }): null {
      useGraph({ graph });
      return null;
    }
    function App(): React.ReactElement {
      const key = useSamePassKey();
      return (
        <>
          <ExternalStarted graph={external} />
          {key === "a" && <Holder graph={external} />}
          {key === "a" && <Owned />}
        </>
      );
    }
    const { unmount } = render(<App />);
    await flushDeferredDisposal();

    expect(rendersOnNextFrame(external)).toBe(true);
    unmount();
    external.unmount();
  });

  test("when the disposal runs on its timer", async () => {
    const external = new Graph({});
    function App(): React.ReactElement {
      const key = useSamePassKey();
      return key === "a" ? <Owned /> : <ExternalStarted graph={external} />;
    }
    const { unmount } = render(<App />);
    await flushDeferredDisposal();

    expect(rendersOnNextFrame(external)).toBe(true);
    unmount();
    external.unmount();
  });
});

test.each([
  ["without StrictMode", false],
  ["with StrictMode", true],
])("an owned graph passed back as config.graph is not disposed (%s)", async (_, strict) => {
  let created: Graph | undefined;
  function PassBackApp({ passBack }: { passBack: boolean }): React.ReactElement {
    const { graph } = useGraph({ graph: passBack ? created : undefined });
    // Capture the committed graph: StrictMode's first, discarded render returns another one.
    useEffect(() => {
      created = created ?? graph;
    }, [graph]);
    return <GraphCanvas graph={graph} renderBlock={() => <div />} />;
  }
  const wrap = (element: React.ReactElement): React.ReactElement =>
    strict ? <StrictMode>{element}</StrictMode> : element;
  const { rerender, unmount } = render(wrap(<PassBackApp passBack={false} />));
  await flushDeferredDisposal();
  if (!created) {
    throw new Error("useGraph did not return a graph");
  }
  const graph = created;
  const unmountSpy = jest.spyOn(graph, "unmount");

  rerender(wrap(<PassBackApp passBack />));
  await flushDeferredDisposal();
  expect(unmountSpy).not.toHaveBeenCalled();
  expect(graph.layers.getLayers()).toHaveLength(5);

  unmount();
  await flushDeferredDisposal();
  expect(unmountSpy).toHaveBeenCalledTimes(1);
});

test("an owned graph disposed by a switch is not owned again when passed back", async () => {
  const external = new Graph({});
  let owned: Graph | undefined;
  function App({ graph }: { graph?: Graph }): React.ReactElement {
    const result = useGraph({ graph });
    useEffect(() => {
      owned = owned ?? result.graph;
    }, [result.graph]);
    return <GraphCanvas graph={result.graph} renderBlock={() => <div />} />;
  }
  const { rerender, unmount } = render(<App />);
  await flushDeferredDisposal();
  if (!owned) {
    throw new Error("useGraph did not return a graph");
  }
  const disposed = owned;
  const unmountSpy = jest.spyOn(disposed, "unmount");
  rerender(<App graph={external} />);
  expect(unmountSpy).toHaveBeenCalledTimes(1);

  rerender(<App graph={disposed} />);
  unmount();
  await flushDeferredDisposal();

  expect(unmountSpy).toHaveBeenCalledTimes(1);
  external.unmount();
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
