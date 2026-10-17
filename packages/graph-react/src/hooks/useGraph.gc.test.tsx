import { setFlagsFromString } from "node:v8";
import { runInNewContext } from "node:vm";

import React, { StrictMode } from "react";

import { Graph } from "@gravity-ui/graph";
import { act, render } from "@testing-library/react";

import { GraphCanvas } from "../GraphCanvas";

import { useGraph } from "./useGraph";

// setupJest's jest.fn ResizeObserver keeps every callback (and so every Layers) in mock.calls.
globalThis.ResizeObserver = class {
  public observe(): void {}
  public unobserve(): void {}
  public disconnect(): void {}
} as unknown as typeof ResizeObserver;

setFlagsFromString("--expose-gc");
// The flag exposes `gc` only to contexts created afterwards; the vm result is that native function.
const collectGarbage = runInNewContext("gc") as () => void;

interface IWeakRef<T extends object> {
  deref(): T | undefined;
}
// The package lib predates ES2021 typings; the Node runtime running Jest provides WeakRef.
const WeakRef = (globalThis as unknown as { WeakRef: new <T extends object>(target: T) => IWeakRef<T> }).WeakRef;

async function countAlive(refs: IWeakRef<Graph>[]): Promise<number> {
  for (let i = 0; i < 3; i += 1) {
    await act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
    collectGarbage();
  }
  return refs.filter((ref) => ref.deref() !== undefined).length;
}

const original = Graph.prototype.setupGraph;
let tracked: IWeakRef<Graph>[] | undefined;
// Plain patch, not jest.spyOn: a jest mock would retain every `this` in mock.contexts.
Graph.prototype.setupGraph = function (this: Graph, ...args: Parameters<Graph["setupGraph"]>): void {
  tracked?.push(new WeakRef(this));
  original.apply(this, args);
};

/** Records a WeakRef to every Graph constructed from now on. */
function trackGraphs(): IWeakRef<Graph>[] {
  tracked = [];
  return tracked;
}

afterEach(() => {
  tracked = undefined;
});

test("every graph useGraph created under StrictMode is collected after unmount", async () => {
  const refs = trackGraphs();
  function App(): React.ReactElement {
    const { graph } = useGraph({});
    return <GraphCanvas graph={graph} renderBlock={() => <div />} />;
  }
  for (let i = 0; i < 5; i += 1) {
    const { unmount } = render(
      <StrictMode>
        <App />
      </StrictMode>
    );
    await act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
    unmount();
  }
  tracked = undefined;
  expect(refs).toHaveLength(10); // two graphs per StrictMode mount
  expect(await countAlive(refs)).toBe(0);
});

test("useGraph disposes an owned graph it attached itself, without GraphCanvas", async () => {
  const refs = trackGraphs();
  // No GraphCanvas, so nothing else detaches the graph: only the hook's disposal frees it.
  function SelfAttachingApp(): React.ReactElement {
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
  for (let i = 0; i < 5; i += 1) {
    const { unmount } = render(<SelfAttachingApp />);
    await act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
    unmount();
  }
  tracked = undefined;
  expect(refs).toHaveLength(5);
  expect(await countAlive(refs)).toBe(0);
});
