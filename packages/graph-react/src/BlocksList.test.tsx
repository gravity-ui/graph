import React from "react";

import { CanvasBlock, ECameraScaleLevel, Graph } from "@gravity-ui/graph";
import type { TSceneLevel } from "@gravity-ui/graph";
import { act, render } from "@testing-library/react";

import { BlocksList } from "./BlocksList";

/** A block class the hit test finds on the schematic level only (`hitLevels`). */
class SchematicHitBlock extends CanvasBlock {
  public static override hitLevels: readonly TSceneLevel[] = ["schematic"];
}

describe("BlocksList", () => {
  it("keeps the graph visible during a suspended handover and commits the current entity on re-entry", async () => {
    const block = { is: "Block", id: "a", name: "old", x: 0, y: 0, width: 100, height: 60, anchors: [] };
    const graph = new Graph({ blocks: [block] });
    const root = document.createElement("div");
    document.body.appendChild(root);
    graph.attach(root);
    graph.start();
    graph.cameraService.set({ scale: 0.5, width: 800, height: 600 });
    const frames = () => {
      for (let i = 0; i < 3; i++) act(() => graph.scheduler.performUpdate());
    };
    frames();
    let ready = false;
    let release!: () => void;
    const loading = new Promise<void>((resolve) => {
      release = resolve;
    });
    const mounted: string[] = [];
    function Card({ name }: { name: string }) {
      React.useEffect(() => {
        mounted.push(name);
      }, [name]);
      if (!ready) throw loading;
      return <button>{name}</button>;
    }
    const { queryByTestId, getByRole, unmount } = render(
      <React.Suspense fallback={<span data-testid="fallback" />}>
        <BlocksList graphObject={graph} renderBlock={(_, current) => <Card name={current.name} />} />
      </React.Suspense>
    );
    act(() => graph.cameraService.set({ scale: 0.8 }));
    frames();
    expect(queryByTestId("fallback")).toBeNull();
    act(() => graph.cameraService.set({ scale: 0.5 }));
    frames();
    act(() => graph.setEntities({ blocks: [] }));
    frames();
    act(() => graph.setEntities({ blocks: [{ ...block, name: "new" }] }));
    act(() => graph.cameraService.set({ scale: 0.8 }));
    frames();
    await act(async () => {
      ready = true;
      release();
      await loading;
    });
    const button = getByRole("button");
    expect(button.textContent).toBe("new");
    expect(mounted).toEqual(["new"]);
    frames();
    button.focus();
    act(() => {
      graph.setEntities({ blocks: [] });
      graph.setEntities({ blocks: [{ ...block, name: "replacement" }] });
    });
    frames();
    expect(getByRole("button")).toBe(button);
    expect(button.textContent).toBe("replacement");
    expect(document.activeElement).toBe(button);
    unmount();
    graph.unmount();
    root.remove();
  });

  it("renders the HTML of a block whose class is not hit on the detailed level: hits do not decide HTML", () => {
    const graph = new Graph({
      blocks: [{ is: "SchematicHit", id: "b1", name: "b1", x: 0, y: 0, width: 100, height: 60, anchors: [] }],
      settings: { blockComponents: { SchematicHit: SchematicHitBlock } },
    });
    const root = document.createElement("div");
    document.body.appendChild(root);
    graph.attach(root);
    graph.start();
    graph.cameraService.set({ scale: 1, width: 800, height: 600 });
    act(() => {
      graph.scheduler.performUpdate();
    });

    const { queryByTestId } = render(
      <BlocksList graphObject={graph} renderBlock={(_g, block) => <div data-testid={block.id}>{block.id}</div>} />
    );
    act(() => {
      graph.scheduler.performUpdate();
    });

    expect(graph.scene.$level.value).toBe("detailed");
    // The hit queries leave it out at this level; the HTML view is rendered all the same.
    expect(graph.getElementsInViewport([CanvasBlock])).toHaveLength(0);
    expect(queryByTestId("b1")).not.toBeNull();
    act(() => graph.unmount());
    document.body.removeChild(root);
  });

  it("renders blocks at scale 0.55 when a custom strategy makes the level detailed from 0.5 (G7)", () => {
    const graph = new Graph({
      blocks: [{ is: "Block", id: "b1", name: "b1", x: 0, y: 0, width: 100, height: 60, anchors: [] }],
      settings: {
        getCameraBlockScaleLevel: (_g: Graph, scale: number) =>
          scale >= 0.5 ? ECameraScaleLevel.Detailed : ECameraScaleLevel.Schematic,
      },
    });
    const root = document.createElement("div");
    document.body.appendChild(root);
    graph.attach(root);
    graph.start();
    graph.cameraService.set({ scale: 0.55, width: 800, height: 600 });
    act(() => {
      graph.scheduler.performUpdate();
    });
    expect(graph.graphConstants.block.SCALES[2]).toBe(0.7);

    const { queryByTestId } = render(
      <BlocksList graphObject={graph} renderBlock={(_g, block) => <div data-testid={block.id}>{block.id}</div>} />
    );
    act(() => {
      graph.scheduler.performUpdate();
    });

    expect(graph.scene.$level.value).toBe("detailed");
    expect(queryByTestId("b1")).not.toBeNull();
    act(() => graph.unmount());
    document.body.removeChild(root);
  });
});
