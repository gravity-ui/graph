import { expect, test } from "@playwright/test";

import type { TBlock, TMultipointConnection } from "@gravity-ui/graph";
import type { LayeredLayoutInput } from "@gravity-ui/graph-layered";

import { GraphPageObject } from "../../page-objects/GraphPageObject";
import { ReactGraphPageObject } from "../../page-objects/ReactGraphPageObject";

// a → b → d, a → c → d, and a → d, which skips a level and is routed through a dummy node.
const INPUT: LayeredLayoutInput = {
  blocks: ["a", "b", "c", "d"].map((id) => ({ id, width: 200, height: 100 })),
  connections: [
    { id: "a-b", sourceBlockId: "a", targetBlockId: "b" },
    { id: "a-c", sourceBlockId: "a", targetBlockId: "c" },
    { id: "b-d", sourceBlockId: "b", targetBlockId: "d" },
    { id: "c-d", sourceBlockId: "c", targetBlockId: "d" },
    { id: "a-d", sourceBlockId: "a", targetBlockId: "d" },
  ],
};

async function expectLayeredPlacement(graph: GraphPageObject): Promise<void> {
  const [a, b, c, d] = await Promise.all(["a", "b", "c", "d"].map((id) => graph.block(id).getGeometry()));

  // Levels become left-to-right columns; blocks of one level share a column without overlapping.
  expect(b.x).toBeGreaterThan(a.x + a.width);
  expect(c.x).toBe(b.x);
  expect(d.x).toBeGreaterThan(b.x + b.width);
  expect(Math.abs(b.y - c.y)).toBeGreaterThanOrEqual(b.height);

  // The level-skipping connection leaves a's right side, bends through the dummy node, and enters d's left side.
  const longEdge = (await graph.connection("a-d").getState()) as TMultipointConnection | null;
  expect(longEdge?.points).toHaveLength(3);
  expect(longEdge?.points?.[0]).toEqual({ x: a.x + a.width, y: a.y + a.height / 2 });
  expect(longEdge?.points?.[2]).toEqual({ x: d.x, y: d.y + d.height / 2 });
}

test.describe("Layered layout", () => {
  test("positions blocks and routes connections computed by the layered layout", async ({ page }) => {
    const graph = new GraphPageObject(page);
    await graph.initialize({});

    await graph.evaluate(async (target, input) => {
      const { computeLevels, layoutGraph, layeredConverter, MultipointConnection } = window.GraphModule;
      const levels = computeLevels(
        input.blocks.map((block) => block.id),
        input.connections
      );
      const layout = await layoutGraph({
        nodes: input.blocks.map((block) => ({ ...block, id: String(block.id), level: levels.get(block.id) ?? 0 })),
        edges: input.connections.map((c) => ({ from: String(c.sourceBlockId), to: String(c.targetBlockId) })),
      });
      const result = layeredConverter({
        layoutResult: layout,
        connectionIdBySourceTarget: new Map(
          input.connections.map((c) => [`${c.sourceBlockId}/${c.targetBlockId}`, [c.id ?? ""]])
        ),
        blockSizes: new Map(input.blocks.map((block) => [String(block.id), block])),
      });

      target.updateSettings({ connection: MultipointConnection });
      target.setEntities({
        blocks: input.blocks.map(
          (block): TBlock => ({
            ...block,
            ...result.blocks[block.id],
            is: "Block",
            name: String(block.id),
            selected: false,
            anchors: [],
          })
        ),
        connections: input.connections.map((c) => ({ ...c, ...result.edges[c.id ?? ""] })),
      });
    }, INPUT);
    await graph.waitForFrames(3);

    await expectLayeredPlacement(graph);

    // The connection is drawn along its points: clicking the bend selects it.
    const longEdge = (await graph.connection("a-d").getState()) as TMultipointConnection | null;
    const bend = longEdge?.points?.[1];
    expect(bend).toBeDefined();
    await graph.camera().zoomToCenter();
    await graph.clickAt(bend ?? { x: 0, y: 0 });
    expect(await graph.connection("a-d").isSelected()).toBe(true);
  });

  test("applies the layout computed by useLayeredLayout in a React app", async ({ page }) => {
    const graph = new ReactGraphPageObject(page);
    await graph.initialize({});

    await graph.evaluate(async (target, input) => {
      const { React, ReactDOM, useLayeredLayout, MultipointConnection } = window.GraphModule;
      const loadingStates: boolean[] = [];

      function LayeredLayoutApplier(): null {
        const { result, isLoading } = useLayeredLayout(input);
        loadingStates.push(isLoading);

        React.useEffect(() => {
          if (isLoading || !result) return;
          target.updateSettings({ connection: MultipointConnection });
          target.setEntities({
            blocks: input.blocks.map(
              (block): TBlock => ({
                ...block,
                ...result.blocks[block.id],
                is: "Block",
                name: String(block.id),
                selected: false,
                anchors: [],
              })
            ),
            connections: input.connections.map((c) => ({ ...c, ...result.edges[c.id ?? ""] })),
          });
        }, [isLoading, result]);

        return null;
      }

      await new Promise<void>((resolve) => {
        const host = document.createElement("div");
        document.body.appendChild(host);
        ReactDOM.createRoot(host).render(React.createElement(LayeredLayoutApplier));
        const waitForBlocks = (): void => {
          if (target.blocks.getBlockState("d")) {
            resolve();
          } else {
            requestAnimationFrame(waitForBlocks);
          }
        };
        waitForBlocks();
      });

      // The hook reports loading until the layout is ready.
      if (loadingStates[0] !== true || loadingStates[loadingStates.length - 1] !== false) {
        throw new Error(`Unexpected loading states: ${loadingStates.join(",")}`);
      }
    }, INPUT);
    await graph.waitForFrames(3);

    await expectLayeredPlacement(graph);
  });
});
