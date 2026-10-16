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

afterEach(() => {
  jest.restoreAllMocks();
});

/** Records start/stop calls on the global scheduler shared by every graph. */
function recordSchedulerTransitions(): string[] {
  const probe = new Graph({});
  const { scheduler } = probe;
  probe.unmount();
  const transitions: string[] = [];
  jest.spyOn(scheduler, "start").mockImplementation((): void => {
    transitions.push("start");
  });
  jest.spyOn(scheduler, "stop").mockImplementation((): void => {
    transitions.push("stop");
  });
  return transitions;
}

function StartingApp(): React.ReactElement {
  const { graph, start } = useGraph({});
  useEffect(() => start(), [graph, start]);
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

test("disposing a replaced owned graph does not stop the scheduler the new graph started", async () => {
  const renderApp = (key: string): React.ReactElement => (
    <StrictMode>
      <StartingApp key={key} />
    </StrictMode>
  );
  const { rerender, unmount } = render(renderApp("a"));
  await flushDeferredDisposal();
  const transitions = recordSchedulerTransitions();

  rerender(renderApp("b"));
  await flushDeferredDisposal();

  // The shared global scheduler must end up running for the new graph.
  expect(transitions[transitions.length - 1]).toBe("start");
  unmount();
  await flushDeferredDisposal();
});

test("a replacement mounted in the same pass as the first graph keeps the scheduler running", async () => {
  // A layout-effect state update re-renders synchronously, in the same pass as the first mount.
  function RemountingApp(): React.ReactElement {
    const [key, setKey] = React.useState("a");
    React.useLayoutEffect(() => {
      if (key === "a") {
        setKey("b");
      }
    }, [key]);
    return <StartingApp key={key} />;
  }
  const transitions = recordSchedulerTransitions();

  const { unmount } = render(<RemountingApp />);
  await flushDeferredDisposal();

  expect(transitions[transitions.length - 1]).toBe("start");
  unmount();
});

test("a replacement started in the layout phase keeps the scheduler running", async () => {
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
    return <div ref={rootRef} />;
  }
  const { rerender, unmount } = render(<LayoutStartingApp key="a" />);
  await flushDeferredDisposal();
  const transitions = recordSchedulerTransitions();

  rerender(<LayoutStartingApp key="b" />);
  await flushDeferredDisposal();

  expect(transitions[transitions.length - 1]).toBe("start");
  unmount();
});

test.each([
  ["without StrictMode", false],
  ["with StrictMode", true],
])(
  // The StrictMode case also passes on the original hook; it guards against regressions.
  "the README pattern keeps the scheduler running after a same-pass replacement (%s)",
  async (_, strict) => {
    function ReadmeApp(): React.ReactElement {
      const { graph, setEntities, start } = useGraph({});
      React.useLayoutEffect(() => {
        setEntities({ blocks: [] });
        start();
      }, [graph, setEntities, start]);
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
    const transitions = recordSchedulerTransitions();

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

    expect(transitions[transitions.length - 1]).toBe("start");
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
    const transitions = recordSchedulerTransitions();

    const { unmount } = render(<App />);
    await flushDeferredDisposal();

    expect(transitions[transitions.length - 1]).toBe("start");
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
    const transitions = recordSchedulerTransitions();

    const { unmount } = render(<App />);
    await flushDeferredDisposal();

    expect(transitions[transitions.length - 1]).toBe("start");
    unmount();
    external.unmount();
  });

  test("when the disposal runs on its timer", async () => {
    const external = new Graph({});
    function App(): React.ReactElement {
      const key = useSamePassKey();
      return key === "a" ? <Owned /> : <ExternalStarted graph={external} />;
    }
    const transitions = recordSchedulerTransitions();

    const { unmount } = render(<App />);
    await flushDeferredDisposal();

    expect(transitions[transitions.length - 1]).toBe("start");
    unmount();
    external.unmount();
  });
});

test("an owned graph passed back as config.graph is not disposed", async () => {
  let created: Graph | undefined;
  function PassBackApp({ passBack }: { passBack: boolean }): React.ReactElement {
    const { graph } = useGraph({ graph: passBack ? created : undefined });
    created = created ?? graph;
    return <GraphCanvas graph={graph} renderBlock={() => <div />} />;
  }
  const { rerender, unmount } = render(<PassBackApp passBack={false} />);
  await flushDeferredDisposal();
  if (!created) {
    throw new Error("useGraph did not return a graph");
  }
  const graph = created;
  const unmountSpy = jest.spyOn(graph, "unmount");

  rerender(<PassBackApp passBack />);
  await flushDeferredDisposal();
  expect(unmountSpy).not.toHaveBeenCalled();
  expect(graph.layers.getLayers()).toHaveLength(5);

  unmount();
  await flushDeferredDisposal();
  expect(unmountSpy).toHaveBeenCalledTimes(1);
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
