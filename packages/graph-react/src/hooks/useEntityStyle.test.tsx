import React, { StrictMode } from "react";

import {
  Anchor,
  CanvasBlock as Block,
  ESelectionStrategy,
  Graph,
  anchorEntityId,
  defineTag,
  selectedTag,
} from "@gravity-ui/graph";
import { act, render, renderHook } from "@testing-library/react";

import { GraphBlockAnchor } from "../Anchor";
import { GraphBlock } from "../Block";
import { BlocksList } from "../BlocksList";

import { useEntityStyle } from "./useEntityStyle";

it("returns tag classes and part colour variables", () => {
  const graph = new Graph({});
  const running = defineTag("running");
  graph.scene.styles.add([{ target: Block, tags: [running], style: { parts: { border: { color: "#2e7d32" } } } }]);
  const { result } = renderHook(() => useEntityStyle(graph, { type: "block", id: "a" }, Block, "graph-block"));
  expect(result.current.className).toBe("");
  act(() => graph.scene.tags.add(running, { block: ["a"] }));
  expect(result.current.className).toBe("graph-tag-running");
  expect(result.current.style).toMatchObject({ "--graph-block-border-color": "#2e7d32" });
});

it("keeps an HTML style across equivalent levels and follows a level rule without a bound scene element", () => {
  const graph = new Graph({});
  graph.cameraService.set({ scale: 0.8 });
  const { result, unmount } = renderHook(() => useEntityStyle(graph, { type: "block", id: "a" }, Block, "graph-block"));
  const first = result.current;
  act(() => graph.cameraService.set({ scale: 0.69 }));
  expect(result.current).toBe(first);
  act(() => {
    graph.scene.styles.add([
      { target: Block, scope: { levels: ["detailed"] }, style: { parts: { border: { color: "#558877" } } } },
    ]);
    graph.cameraService.set({ scale: 0.8 });
  });
  expect(result.current.style).toMatchObject({ "--graph-block-border-color": "#558877" });
  unmount();
  graph.unmount();
});

it("exposes the effective block motion to an HTML face and removes it when the rule stops matching", () => {
  const graph = new Graph({});
  const running = defineTag("running");
  const { result } = renderHook(() => useEntityStyle(graph, { type: "block", id: "a" }, Block, "graph-block"));
  act(() => graph.scene.tags.add(running, { block: ["a"] }));
  let remove: () => void;
  act(() => {
    remove = graph.scene.styles.add([{ target: Block, tags: [running], style: { motion: "shake" } }]);
  });
  expect(result.current.className.split(" ")).toContain("graph-motion-shake");
  act(() => remove());
  expect(result.current.className).toBe("graph-tag-running");
});

it("keeps tag classes and part colour variables current under StrictMode, without another style subscriber", () => {
  // No block "a" exists, so nothing but the hook subscribes to its tags. StrictMode subscribes, unsubscribes (the
  // store releases the signal) and subscribes again to the same signal.
  const graph = new Graph({});
  const running = defineTag("running");
  graph.scene.styles.add([{ target: Block, tags: [running], style: { parts: { border: { color: "#2e7d32" } } } }]);
  const { result } = renderHook(() => useEntityStyle(graph, { type: "block", id: "a" }, Block, "graph-block"), {
    wrapper: StrictMode,
  });
  expect(result.current.className).toBe("");
  act(() => graph.scene.tags.add(running, { block: ["a"] }));
  expect(result.current.className).toBe("graph-tag-running");
  expect(result.current.style).toMatchObject({ "--graph-block-border-color": "#2e7d32" });
  act(() => graph.scene.tags.clear(running));
  expect(result.current.className).toBe("");
  // The theme's border colour again.
  expect(result.current.style).not.toMatchObject({ "--graph-block-border-color": "#2e7d32" });
});

describe("React wrappers", () => {
  class CustomBlock extends Block {}

  function setup(): { graph: Graph; container: HTMLElement; cleanup: () => void } {
    const graph = new Graph({
      blocks: [
        {
          is: "custom",
          id: "c1",
          name: "c1",
          x: 0,
          y: 0,
          width: 100,
          height: 60,
          anchors: [{ id: "a1", blockId: "c1", type: "IN" }],
        },
        {
          is: "Block",
          id: "p1",
          name: "p1",
          x: 200,
          y: 0,
          width: 100,
          height: 60,
          // The same anchor id as c1's: anchor ids are unique only within their block.
          anchors: [{ id: "a1", blockId: "p1", type: "IN" }],
        },
      ],
      settings: { blockComponents: { custom: CustomBlock } },
    });
    const root = document.createElement("div");
    document.body.appendChild(root);
    graph.attach(root);
    graph.start();
    graph.cameraService.set({ scale: 0.8, width: 800, height: 600 });
    act(() => graph.scheduler.performUpdate());
    const { container } = render(
      <BlocksList
        graphObject={graph}
        renderBlock={(g, block) => (
          <GraphBlock graph={g} block={block} className={`w-${block.id}`}>
            {(block.anchors ?? []).map((anchor) => (
              <GraphBlockAnchor
                key={anchor.id}
                graph={g}
                anchor={anchor}
                position="fixed"
                className={`n-${block.id}-${anchor.id}`}
              />
            ))}
          </GraphBlock>
        )}
      />
    );
    act(() => graph.scheduler.performUpdate());
    return {
      graph,
      container,
      cleanup: () => {
        act(() => graph.unmount());
        document.body.removeChild(root);
      },
    };
  }

  const wrapper = (container: HTMLElement, id: string): HTMLElement => {
    const el = container.querySelector<HTMLElement>(`.w-${id}`);
    if (!el) throw new Error(`no wrapper ${id}`);
    return el;
  };

  it("GraphBlock gets tag classes, selected alias, rule variables and keeps geometry variables", () => {
    const { graph, container, cleanup } = setup();
    const running = defineTag("running");
    act(() => {
      graph.scene.styles.add([{ target: CustomBlock, style: { parts: { title: { color: "#123456" } } } }]);
    });
    const el = wrapper(container, "c1");
    expect(el.style.getPropertyValue("--graph-block-title-color")).toBe("#123456");
    // a plain block does not match the CustomBlock rule: the block.is lookup uses the canvas registry
    expect(wrapper(container, "p1").style.getPropertyValue("--graph-block-title-color")).not.toBe("#123456");
    expect(el.style.getPropertyValue("--graph-block-border-color")).not.toBe("");

    act(() => graph.scene.tags.add(running, { block: ["c1"] }));
    expect(el.classList.contains("graph-tag-running")).toBe(true);
    expect(wrapper(container, "p1").classList.contains("graph-tag-running")).toBe(false);

    act(() => graph.selectionService.select("block", ["c1"], ESelectionStrategy.REPLACE));
    expect(el.classList.contains("selected")).toBe(true);
    expect(el.classList.contains("graph-tag-selected")).toBe(true);

    const blockContainer = el.parentElement as HTMLElement;
    expect(blockContainer.style.getPropertyValue("--graph-block-geometry-width")).not.toBe("");
    cleanup();
  });

  it("subscribes only the styled block and applies the scene's current offset before paint", () => {
    const { graph, container, cleanup } = setup();
    const running = defineTag("motion-test");
    let notify: ((x: number, y: number) => void) | undefined;
    const release = jest.fn();
    const subscribe = jest.spyOn(graph.scene, "onBlockMotion").mockImplementation((_id, listener) => {
      notify = listener;
      listener(0, -6);
      return release;
    });
    act(() => {
      graph.scene.styles.add([{ target: CustomBlock, tags: [running], style: { motion: "bounce" } }]);
    });
    expect(subscribe).not.toHaveBeenCalled();
    const body = wrapper(container, "c1");
    const element = body.parentElement as HTMLElement;
    const offsetY = () => element.style.getPropertyValue("--graph-block-motion-y");

    act(() => graph.scene.tags.add(running, { block: ["c1"] }));
    expect(subscribe).toHaveBeenCalledTimes(1);
    expect(subscribe).toHaveBeenCalledWith("c1", expect.any(Function));
    expect(offsetY()).toBe("-6px");
    act(() => notify?.(0, -3));
    expect(offsetY()).toBe("-3px");
    expect(wrapper(container, "c1")).toBe(body);
    act(() => notify?.(0, 0));
    expect(element.hasAttribute("data-graph-block-motion")).toBe(false);
    expect(offsetY()).toBe("");
    act(() => notify?.(0, -1));
    act(() => graph.scene.tags.clear(running));
    expect(release).toHaveBeenCalledTimes(1);
    expect(offsetY()).toBe("");
    cleanup();
  });

  it("GraphBlockAnchor gets graph-tag-selected and keeps graph-block-anchor-selected", () => {
    const { graph, container, cleanup } = setup();
    const el = container.querySelector<HTMLElement>(".n-c1-a1") as HTMLElement;
    expect(el.classList.contains("graph-tag-selected")).toBe(false);
    act(() => {
      graph.scene.styles.add([
        { target: Anchor, tags: [selectedTag], style: { parts: { anchor: { color: "#654321" } } } },
      ]);
    });
    expect(el.style.getPropertyValue("--graph-block-anchor-anchor-color")).not.toBe("#654321");
    act(() => graph.selectionService.select("anchor", [anchorEntityId("c1", "a1")], ESelectionStrategy.REPLACE));
    expect(el.style.getPropertyValue("--graph-block-anchor-anchor-color")).toBe("#654321");
    expect(el.classList.contains("graph-tag-selected")).toBe(true);
    expect(el.classList.contains("graph-block-anchor-selected")).toBe(true);
    cleanup();
  });

  it("GraphBlockAnchor styles only the selected block's anchor when two blocks share an anchor id", () => {
    const { graph, container, cleanup } = setup();
    const own = container.querySelector<HTMLElement>(".n-p1-a1") as HTMLElement;
    const other = container.querySelector<HTMLElement>(".n-c1-a1") as HTMLElement;
    act(() => graph.api.setAnchorSelection("p1", "a1", true));
    expect(own.classList.contains("graph-tag-selected")).toBe(true);
    expect(own.classList.contains("graph-block-anchor-selected")).toBe(true);
    expect(other.classList.contains("graph-tag-selected")).toBe(false);
    expect(other.classList.contains("graph-block-anchor-selected")).toBe(false);
    cleanup();
  });

  it("re-renders on a rule added after mount, with no tag change", () => {
    const { graph, container, cleanup } = setup();
    const running = defineTag("running");
    act(() => graph.scene.tags.add(running, { block: ["c1"] }));
    const el = wrapper(container, "c1");
    expect(el.style.getPropertyValue("--graph-block-border-color")).not.toBe("#abcdef");
    act(() => {
      graph.scene.styles.add([
        { target: CustomBlock, tags: [running], style: { parts: { border: { color: "#abcdef" } } } },
      ]);
    });
    expect(el.style.getPropertyValue("--graph-block-border-color")).toBe("#abcdef");
    cleanup();
  });
});
