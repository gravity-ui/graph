import React, { Suspense, startTransition } from "react";

import { ECameraScaleLevel, Graph, entityKey } from "@gravity-ui/graph";
import type { TBlock } from "@gravity-ui/graph";
import { batch } from "@preact/signals-core";
import { act, render } from "@testing-library/react";

import { GraphBlock } from "./Block";
import { GraphCanvas } from "./GraphCanvas";
import type { ReactLayer } from "./layer";

const block: TBlock = { id: "b", is: "Block", name: "B", x: 0, y: 0, width: 100, height: 50, anchors: [] };

function setup(scale: number): Graph {
  const graph = new Graph({});
  act(() => {
    graph.attach(document.createElement("div"));
    graph.setEntities({ blocks: [block] });
    graph.start();
    graph.cameraService.set({ scale });
    graph.scheduler.performUpdate();
  });
  return graph;
}

const frame = (graph: Graph): void => act(() => graph.scheduler.performUpdate());
const hidden = (graph: Graph): boolean | undefined => graph.scene.store.get(entityKey("block", "b"))?.hidden;

test("GraphBlock hands its block over once mounted, and only at the detailed level", () => {
  const graph = setup(1);
  expect(hidden(graph)).toBe(false);
  const view = render(
    <GraphBlock graph={graph} block={block}>
      <span>b</span>
    </GraphBlock>
  );
  frame(graph);
  expect(hidden(graph)).toBe(true);
  act(() => graph.cameraService.set({ scale: 0.5 }));
  frame(graph);
  expect(hidden(graph)).toBe(false);
  act(() => graph.cameraService.set({ scale: 1 }));
  frame(graph);
  expect(hidden(graph)).toBe(true);
  view.unmount();
  frame(graph);
  expect(hidden(graph)).toBe(false);
  graph.unmount();
});

test("canvasVisible keeps the scene drawing until the HTML view is ready", () => {
  const graph = setup(1);
  const view = render(
    <GraphBlock graph={graph} block={block} autoHideCanvas={false} canvasVisible>
      <span>b</span>
    </GraphBlock>
  );
  frame(graph);
  expect(hidden(graph)).toBe(false);
  view.rerender(
    <GraphBlock graph={graph} block={block} autoHideCanvas={false} canvasVisible={false}>
      <span>b</span>
    </GraphBlock>
  );
  frame(graph);
  expect(hidden(graph)).toBe(true);
  view.unmount();
  graph.unmount();
});

test("a mounted GraphBlock hands over the replacement view when the same id is added again", () => {
  const graph = setup(1);
  const currentView = () => graph.rootStore.blocksList.getBlockState(block.id)?.getViewComponent();
  const oldView = currentView();
  const card = render(
    <GraphBlock graph={graph} block={block}>
      content
    </GraphBlock>
  );
  frame(graph);
  expect(oldView?.isHeldByHtml()).toBe(true);

  act(() => graph.setEntities({ blocks: [] }));
  frame(graph);
  expect(card.queryByText("content")).toBeNull();
  expect(oldView?.isHeldByHtml()).toBe(false);

  act(() => graph.setEntities({ blocks: [{ ...block, x: 73 }] }));
  frame(graph);
  frame(graph);
  expect(currentView()).not.toBe(oldView);
  expect(currentView()?.isHeldByHtml()).toBe(true);
  expect(card.getByText("content")).toBeTruthy();
  expect(hidden(graph)).toBe(true);
  card.unmount();
  frame(graph);
  expect(hidden(graph)).toBe(false);
  graph.unmount();
});

test("autoHideCanvas={false} without canvasVisible keeps the canvas drawn and registers the view (D4)", () => {
  const graph = setup(1);
  const view = render(
    <GraphBlock graph={graph} block={block} autoHideCanvas={false}>
      <span>b</span>
    </GraphBlock>
  );
  frame(graph);
  expect(hidden(graph)).toBe(false);
  expect(graph.rootStore.blocksList.getBlockState("b")?.getViewComponent()?.isHeldByHtml()).toBe(true);
  view.unmount();
  frame(graph);
  expect(graph.rootStore.blocksList.getBlockState("b")?.getViewComponent()?.isHeldByHtml()).toBe(false);
  graph.unmount();
});

test("ReactLayer switches its HTML at the end of the graph frame that draws the blocks, after a re-attach too", () => {
  const graph = new Graph({});
  graph.setEntities({ blocks: [block] });
  graph.cameraService.set({ scale: 1 });
  const ref = { current: null as ReactLayer | null };
  const view = render(<GraphCanvas graph={graph} reactLayerRef={ref} renderBlock={() => <div />} />);
  act(() => graph.start());
  frame(graph);
  const blockView = graph.rootStore.blocksList.getBlockState("b")?.getViewComponent();
  const release = blockView?.delegateRender({ canvasVisible: false });
  frame(graph);
  expect([ref.current?.isHtmlActive(), hidden(graph)]).toEqual([true, true]);
  const zoomOutAndCheck = (): void => {
    act(() => graph.cameraService.set({ scale: 0.5 }));
    // Before the graph frame: the HTML stays, so nothing is blank.
    expect(ref.current?.isHtmlActive()).toBe(true);
    frame(graph);
    // The frame that hides the HTML draws the block.
    expect([ref.current?.isHtmlActive(), hidden(graph)]).toEqual([false, false]);
    act(() => graph.cameraService.set({ scale: 1 }));
    frame(graph);
    expect([ref.current?.isHtmlActive(), hidden(graph)]).toEqual([true, true]);
  };
  zoomOutAndCheck();
  // Re-attaching GraphLayer moves it after ReactLayer in the update order; the frame end still comes after both.
  const graphLayer = graph.getGraphLayer();
  act(() => {
    graph.detachLayer(graphLayer);
    graph.attachLayer(graphLayer);
  });
  frame(graph);
  zoomOutAndCheck();
  release?.();
  view.unmount();
  graph.unmount();
});

/**
 * The carried acceptance tests (Task 4's reviews): the HTML views GraphCanvas renders, the pointer on an anchor, and
 * the graph bus. Block "a" (x 0..200, y 0..100) has its OUT anchor at (200, 88); `at(scale)` keeps that point under
 * the pointer, at client (200, 94).
 */
describe("the handover through GraphCanvas, with a pointer on an anchor", () => {
  const anchored: TBlock = {
    id: "a",
    is: "Block",
    name: "A",
    x: 0,
    y: 0,
    width: 200,
    height: 100,
    anchors: [{ id: "out", blockId: "a", type: "OUT" }],
  };
  const POINTER = { x: 200, y: 94 };
  const ANCHOR = { x: 200, y: 88 };

  type TMounted = {
    graph: Graph;
    layer: { current: ReactLayer | null };
    log: string[];
    at(scale: number): void;
    frames(count?: number): void;
    nameOf(target: unknown): string;
    unmount(): void;
  };

  /** A view that never resolves: React keeps a transition that renders it uncommitted. */
  const never = new Promise<never>(() => undefined);
  function SuspendedView(): React.ReactElement {
    throw never;
  }

  function mount(
    props: { autoHideCanvas?: boolean; canvasVisible?: boolean },
    scale: number,
    options: {
      settings?: { emulateMouseEventsOnCameraChange?: boolean };
      /** Wraps GraphCanvas in Suspense; while `current` is true, the block views suspend. */
      suspendViews?: { current: boolean };
      /** Blocks besides "a". */
      blocks?: TBlock[];
    } = {}
  ): TMounted {
    const graph = new Graph({ settings: { useBlocksAnchors: true, ...options.settings } });
    graph.setEntities({ blocks: [anchored, ...(options.blocks ?? [])] });
    const layer = { current: null as ReactLayer | null };
    const { suspendViews } = options;
    const canvas = (
      <GraphCanvas
        graph={graph}
        reactLayerRef={layer}
        renderBlock={(g, b) =>
          suspendViews?.current ? (
            <SuspendedView />
          ) : (
            <GraphBlock graph={g} block={b} {...props}>
              <span>{b.name}</span>
            </GraphBlock>
          )
        }
      />
    );
    const view = render(suspendViews ? <Suspense fallback={null}>{canvas}</Suspense> : canvas);
    const at = (next: number): void =>
      act(() =>
        graph.cameraService.set({
          scale: next,
          x: POINTER.x - ANCHOR.x * next,
          y: POINTER.y - ANCHOR.y * next,
          width: 800,
          height: 600,
        })
      );
    const frames = (count = 1): void => {
      for (let i = 0; i < count; i++) act(() => graph.scheduler.performUpdate());
    };
    act(() => graph.start());
    at(scale);
    frames(4);
    const nameOf = (target: unknown): string => {
      const state = graph.rootStore.blocksList.getBlockState("a");
      if (target === state?.getAnchorById("out")?.getViewComponent()) return "anchor";
      return target === state?.getViewComponent() ? "block" : "other";
    };
    const log: string[] = [];
    graph.on("mouseenter", (event) => {
      log.push(`enter:${nameOf(event.detail.target)}`);
    });
    graph.on("mouseleave", (event) => {
      log.push(`leave:${nameOf(event.detail.target)}`);
    });
    return {
      graph,
      layer,
      log,
      at,
      frames,
      nameOf,
      unmount: (): void => {
        view.unmount();
        graph.unmount();
      },
    };
  }

  const pointAtAnchor = (graph: Graph): void =>
    act(() => {
      graph.getGraphLayer().handleEvent(new MouseEvent("mousemove", { clientX: POINTER.x, clientY: POINTER.y }));
    });

  const clickTargets = (graph: Graph): unknown[] => {
    const targets: unknown[] = [];
    const off = graph.on("click", (event) => {
      targets.push(event.detail.target);
    });
    act(() => {
      const canvas = graph.getGraphLayer().getCanvas();
      for (const type of ["mousedown", "mouseup", "click"]) {
        canvas.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: POINTER.x, clientY: POINTER.y }));
      }
    });
    off();
    return targets;
  };

  it.each([
    ["canvasVisible unset", {}],
    ["canvasVisible true", { canvasVisible: true }],
  ])(
    "autoHideCanvas={false}, %s: keeps the canvas drawn and hits the anchor at detailed through the bus (D4)",
    (_name, extra) => {
      const mounted = mount({ autoHideCanvas: false, ...extra }, 1);
      const { graph } = mounted;
      const view = graph.rootStore.blocksList.getBlockState("a")?.getViewComponent();
      expect(mounted.layer.current?.isHtmlActive()).toBe(true);
      expect(graph.scene.store.get(entityKey("block", "a"))?.hidden).toBe(false);
      expect([view?.isHeldByHtml(), view?.isShownOutsideScene(), view?.isRenderDelegated()]).toEqual([
        true,
        true,
        false,
      ]);
      const targets = clickTargets(graph);
      expect(targets.map(mounted.nameOf)).toEqual(["anchor"]);
      mounted.unmount();
    }
  );

  it.each([
    ["", false],
    [" (camera emulation on)", true],
  ])("entering detailed under a still pointer keeps the anchor: no leave and enter on the bus%s", (_name, emulate) => {
    const mounted = mount({}, 0.5, { settings: { emulateMouseEventsOnCameraChange: emulate } });
    const { graph, log } = mounted;
    pointAtAnchor(graph);
    expect(log).toEqual(["enter:anchor"]);
    log.splice(0);
    mounted.at(1);
    mounted.frames(6);
    expect(graph.rootStore.blocksList.getBlockState("a")?.getViewComponent()?.isHeldByHtml()).toBe(true);
    expect(mounted.nameOf(graph.getGraphLayer().$hoveredComponent.value)).toBe("anchor");
    expect(log).toEqual([]);
    mounted.unmount();
  });

  it("entering detailed in a batch with a settings write keeps the anchor, with the camera emulation on", () => {
    // Codex's repro: the batch notifies GraphLayer's camera effect before BlocksList's level effect takes its hold.
    const mounted = mount({}, 0.5, { settings: { emulateMouseEventsOnCameraChange: true } });
    const { graph, log } = mounted;
    pointAtAnchor(graph);
    log.splice(0);
    act(() =>
      batch(() => {
        graph.updateSettings({ useBlocksAnchors: true });
        graph.cameraService.set({ scale: 1, x: 0, y: 6, width: 800, height: 600 });
      })
    );
    mounted.frames(6);
    expect(graph.rootStore.blocksList.getBlockState("a")?.getViewComponent()?.isHeldByHtml()).toBe(true);
    expect(mounted.nameOf(graph.getGraphLayer().$hoveredComponent.value)).toBe("anchor");
    expect(log).toEqual([]);
    mounted.unmount();
  });

  /** The HTML block views mounted now (GraphBlock's container). */
  const mountedViews = (): number => document.querySelectorAll(".graph-block-container").length;

  it("entering detailed in a batch after a strategy-only change away from it keeps the anchor (emulation on)", () => {
    // Codex's fix-round-1 repro: the level left detailed by the strategy alone, with no camera change.
    const mounted = mount({}, 1, { settings: { emulateMouseEventsOnCameraChange: true } });
    const { graph, log } = mounted;
    expect(mountedViews()).toBe(1);
    act(() => graph.updateSettings({ getCameraBlockScaleLevel: () => ECameraScaleLevel.Schematic }));
    mounted.frames(6);
    expect([graph.scene.$level.value, mountedViews()]).toEqual(["schematic", 0]);
    pointAtAnchor(graph);
    expect(log).toEqual(["enter:anchor"]);
    log.splice(0);
    act(() =>
      batch(() => {
        graph.resetSettings(["getCameraBlockScaleLevel"]);
        graph.cameraService.set({ scale: 1, x: 0, y: 6, width: 800, height: 600 });
      })
    );
    mounted.frames(6);
    expect(graph.rootStore.blocksList.getBlockState("a")?.getViewComponent()?.isHeldByHtml()).toBe(true);
    expect(mounted.nameOf(graph.getGraphLayer().$hoveredComponent.value)).toBe("anchor");
    expect(log).toEqual([]);
    mounted.unmount();
  });

  it("emulates a pan within detailed at once after a strategy-only change into detailed (emulation on)", () => {
    // Codex's fix-round-1 regression probe: the level entered detailed by the strategy alone.
    const mounted = mount({}, 0.5, { settings: { emulateMouseEventsOnCameraChange: true } });
    const { graph, log } = mounted;
    act(() => graph.updateSettings({ getCameraBlockScaleLevel: () => ECameraScaleLevel.Detailed }));
    mounted.frames(6);
    expect([graph.scene.$level.value, mountedViews()]).toEqual(["detailed", 1]);
    pointAtAnchor(graph);
    expect(log).toEqual(["enter:anchor"]);
    log.splice(0);
    // Scale 0.5: the camera at x 100 puts the anchor (world x 200) under the pointer; at x 150 the block's body is.
    act(() => graph.cameraService.set({ x: 150 }));
    // At once, without a graph frame: a move within one level emulates as before.
    expect(mounted.nameOf(graph.getGraphLayer().$hoveredComponent.value)).toBe("block");
    expect(log).toEqual(["leave:anchor", "enter:block"]);
    mounted.unmount();
  });

  it("releases the hold within its bound when React leaves the views' commit suspended (a transition)", () => {
    // Codex's repro: React keeps the previous tree while the transition's views suspend, so they never commit.
    const suspendViews = { current: false };
    const mounted = mount({}, 0.5, { suspendViews });
    const { graph, log } = mounted;
    pointAtAnchor(graph);
    log.splice(0);
    suspendViews.current = true;
    const errors = jest.spyOn(console, "error").mockImplementation(() => undefined);
    mounted.at(1);
    // The frame asks React for the views inside a transition: their render suspends and nothing commits.
    act(() => startTransition(() => graph.scheduler.performUpdate()));
    expect(mounted.nameOf(graph.getGraphLayer().$hoveredComponent.value)).toBe("anchor");
    mounted.frames(20);
    errors.mockRestore();
    expect(graph.rootStore.blocksList.getBlockState("a")?.getViewComponent()?.isHeldByHtml()).toBe(false);
    // The bound released the hold and the frame's end served the level's retarget: detailed without a view hits the
    // block (В5), once, with no flicker back.
    expect(mounted.nameOf(graph.getElementOverPoint(ANCHOR))).toBe("block");
    expect(mounted.nameOf(graph.getGraphLayer().$hoveredComponent.value)).toBe("block");
    expect(log).toEqual(["leave:anchor", "enter:block"]);
    // Nothing is held any more: a move under the still pointer is followed at the next frame's end.
    act(() => graph.api.updateBlock({ id: "a", x: -100 }));
    mounted.frames(1);
    expect(graph.getGraphLayer().$hoveredComponent.value).toBeUndefined();
    mounted.unmount();
  });

  it.each([
    ["a newer list replaces the one it waits for", "newer list"],
    ["the level leaves detailed", "level"],
    ["BlocksList unmounts", "unmount"],
  ])("releases a hold whose list is suspended, before its bound, when %s", (_name, how) => {
    // Block "c" lies outside the view until it moves in: the blocks in view, so the list asked for, change.
    const far: TBlock = { id: "c", is: "Block", name: "C", x: 2000, y: 0, width: 100, height: 50, anchors: [] };
    const suspendViews = { current: false };
    const mounted = mount({}, 0.5, { suspendViews, blocks: [far] });
    const { graph } = mounted;
    const layer = graph.getGraphLayer();
    const holdRetarget = layer.holdRetarget.bind(layer);
    const releases: jest.Mock[] = [];
    const expired = jest.fn();
    const spy = jest.spyOn(layer, "holdRetarget").mockImplementation((onExpire) => {
      const release = jest.fn(
        holdRetarget(() => {
          expired();
          onExpire?.();
        })
      );
      releases.push(release);
      return release;
    });
    pointAtAnchor(graph);
    suspendViews.current = true;
    const errors = jest.spyOn(console, "error").mockImplementation(() => undefined);
    mounted.at(1);
    const transitionFrame = (): void => act(() => startTransition(() => graph.scheduler.performUpdate()));
    transitionFrame();
    expect(releases.length === 1 && releases[0].mock.calls.length === 0).toBe(true);
    if (how === "newer list") {
      act(() => graph.api.updateBlock({ id: "c", x: 300 }));
      // The hit test takes the move in the first frame, the list asks for the newer list in the second.
      transitionFrame();
      transitionFrame();
    } else if (how === "level") {
      mounted.at(0.5);
    } else {
      mounted.unmount();
    }
    errors.mockRestore();
    expect([releases[0].mock.calls.length > 0, expired.mock.calls.length]).toEqual([true, 0]);
    spy.mockRestore();
    if (how !== "unmount") mounted.unmount();
  });

  it("keeps an anchor targeted on rapid re-entry while the previously requested list is pending", () => {
    const suspendViews = { current: false };
    const mounted = mount({}, 0.5, { suspendViews });
    const { graph, nameOf } = mounted;
    pointAtAnchor(graph);
    suspendViews.current = true;
    mounted.at(1);
    mounted.frames(1);
    // Leave and re-enter between frames. The second entry sees the same requested list, still uncommitted.
    mounted.at(0.5);
    mounted.at(1);
    mounted.frames(1);
    expect(nameOf(graph.getGraphLayer().$hoveredComponent.value)).toBe("anchor");
    mounted.frames(4);
    expect(nameOf(graph.getGraphLayer().$hoveredComponent.value)).toBe("block");
    mounted.unmount();
  });

  it("keeps the retarget waiting through a scene change that comes before React commits the views", () => {
    const mounted = mount({}, 0.5);
    const { graph, log } = mounted;
    pointAtAnchor(graph);
    log.splice(0);
    act(() => {
      const scale = 1;
      graph.cameraService.set({ scale, x: POINTER.x - ANCHOR.x * scale, y: POINTER.y - ANCHOR.y * scale });
      // The frame asks React for the views; act commits them when it returns.
      graph.scheduler.performUpdate();
      // A camera write that moves nothing: the scene changes again with the same blocks in view, before the commit.
      graph.cameraService.set({});
      graph.scheduler.performUpdate();
    });
    mounted.frames(6);
    expect(mounted.nameOf(graph.getGraphLayer().$hoveredComponent.value)).toBe("anchor");
    expect(log).toEqual([]);
    mounted.unmount();
  });

  it.each([
    ["schematic", 0.5, "anchor", []],
    ["minimalistic", 0.1, "block", ["leave:anchor", "enter:block"]],
  ])("leaving detailed for %s: no held hit lingers once the frame hides the HTML", (_level, scale, target, events) => {
    const mounted = mount({}, 1);
    const { graph, log } = mounted;
    pointAtAnchor(graph);
    expect(log).toEqual(["enter:anchor"]);
    log.splice(0);
    mounted.at(scale as number);
    mounted.frames(1);
    // The frame that hides the HTML: the anchor is hit only where the scene draws it (schematic), not at
    // minimalistic, and the still pointer's target follows in that frame.
    expect(mounted.layer.current?.isHtmlActive()).toBe(false);
    const view = graph.rootStore.blocksList.getBlockState("a")?.getViewComponent();
    expect([view?.isHeldByHtml(), view?.isShownOutsideScene()]).toEqual([false, false]);
    expect(mounted.nameOf(graph.getElementOverPoint(ANCHOR))).toBe(target);
    expect(mounted.nameOf(graph.getGraphLayer().$hoveredComponent.value)).toBe(target);
    expect(log).toEqual(events);
    mounted.frames(4);
    expect(log).toEqual(events);
    mounted.unmount();
  });
});
