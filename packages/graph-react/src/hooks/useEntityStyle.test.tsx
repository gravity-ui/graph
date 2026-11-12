import React from "react";

import { Anchor, CanvasBlock as Block, ESelectionStrategy, Graph, defineTag, selectedTag } from "@gravity-ui/graph";
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
        { is: "Block", id: "p1", name: "p1", x: 200, y: 0, width: 100, height: 60, anchors: [] },
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
                className={`n-${anchor.id}`}
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

  it("GraphBlockAnchor gets graph-tag-selected and keeps graph-block-anchor-selected", () => {
    const { graph, container, cleanup } = setup();
    const el = container.querySelector<HTMLElement>(".n-a1") as HTMLElement;
    expect(el.classList.contains("graph-tag-selected")).toBe(false);
    act(() => {
      graph.scene.styles.add([
        { target: Anchor, tags: [selectedTag], style: { parts: { anchor: { color: "#654321" } } } },
      ]);
    });
    expect(el.style.getPropertyValue("--graph-block-anchor-anchor-color")).not.toBe("#654321");
    act(() => graph.selectionService.select("anchor", ["a1"], ESelectionStrategy.REPLACE));
    expect(el.style.getPropertyValue("--graph-block-anchor-anchor-color")).toBe("#654321");
    expect(el.classList.contains("graph-tag-selected")).toBe(true);
    expect(el.classList.contains("graph-block-anchor-selected")).toBe(true);
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
