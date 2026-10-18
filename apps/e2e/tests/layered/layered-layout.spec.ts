import { expect, test } from "@playwright/test";

import type { TBlock, TConnection, TMultipointConnection } from "@gravity-ui/graph";

import { GraphPageObject } from "../../page-objects/GraphPageObject";
import { ReactGraphPageObject } from "../../page-objects/ReactGraphPageObject";

type TScenario = {
  blocks: TBlock[];
  connections: TConnection[];
};

const BLOCK_IDS = ["a", "b", "c", "d"];

function createBlocks(withAnchors = false): TBlock[] {
  return BLOCK_IDS.map((id) => ({
    is: "Block",
    id,
    name: id,
    x: 0,
    y: 0,
    width: 200,
    height: 100,
    selected: false,
    anchors: withAnchors
      ? [
          { id: "in", blockId: id, type: "IN" },
          { id: "out", blockId: id, type: "OUT" },
        ]
      : [],
  }));
}

// a → b → d, a → c → d, and a → d, which skips a level and is routed through a dummy node.
const BLOCK_CONNECTIONS: TConnection[] = [
  { id: "a-b", sourceBlockId: "a", targetBlockId: "b" },
  { id: "a-c", sourceBlockId: "a", targetBlockId: "c" },
  { id: "b-d", sourceBlockId: "b", targetBlockId: "d" },
  { id: "c-d", sourceBlockId: "c", targetBlockId: "d" },
  { id: "a-d", sourceBlockId: "a", targetBlockId: "d" },
];

async function expectLayeredPlacement(graph: GraphPageObject): Promise<void> {
  const [a, b, c, d] = await Promise.all(BLOCK_IDS.map((id) => graph.block(id).getGeometry()));

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

/** Runs the framework-free pipeline in the page and applies the result through public graph APIs. */
async function applyLayeredLayout(graph: GraphPageObject, scenario: TScenario): Promise<void> {
  await graph.evaluate(async (target, { blocks, connections }) => {
    const { computeLevels, layoutGraph, layeredConverter, MultipointConnection } = window.GraphModule;
    const levels = computeLevels(
      blocks.map((block) => block.id),
      connections
    );
    const layout = await layoutGraph({
      nodes: blocks.map((block) => ({ ...block, id: String(block.id), level: levels.get(block.id) ?? 0 })),
      edges: connections.map((c) => ({ from: String(c.sourceBlockId), to: String(c.targetBlockId) })),
    });
    const result = layeredConverter({
      layoutResult: layout,
      connections,
      blockSizes: new Map(blocks.map((block) => [String(block.id), block])),
    });

    target.updateSettings({ connection: MultipointConnection });
    target.setEntities({
      blocks: blocks.map((block) => ({ ...block, ...result.blocks[block.id] })),
      connections: connections.map((c) => (c.id === undefined ? c : { ...c, ...result.edges[c.id] })),
    });
  }, scenario);
  await graph.waitForFrames(3);
}

/** Mounts a React component that uses useLayeredLayout and applies its result to the graph. */
async function applyLayeredLayoutWithHook(graph: GraphPageObject, scenario: TScenario): Promise<void> {
  await graph.evaluate(async (target, { blocks, connections }) => {
    const { React, ReactDOM, useLayeredLayout, MultipointConnection } = window.GraphModule;
    const loadingStates: boolean[] = [];

    function LayeredLayoutApplier(): null {
      const { result, isLoading } = useLayeredLayout({ blocks, connections });
      loadingStates.push(isLoading);

      React.useEffect(() => {
        if (isLoading || !result) return;
        target.updateSettings({ connection: MultipointConnection });
        target.setEntities({
          blocks: blocks.map((block) => ({ ...block, ...result.blocks[block.id] })),
          connections: connections.map((c) => (c.id === undefined ? c : { ...c, ...result.edges[c.id] })),
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
  }, scenario);
  await graph.waitForFrames(3);
}

test.describe("Layered layout", () => {
  test("lays out block-to-block connections", async ({ page }) => {
    const graph = new GraphPageObject(page);
    await graph.initialize({});
    await applyLayeredLayout(graph, { blocks: createBlocks(), connections: BLOCK_CONNECTIONS });

    await expectLayeredPlacement(graph);

    // The connection is drawn along its points: clicking the bend selects it.
    const longEdge = (await graph.connection("a-d").getState()) as TMultipointConnection | null;
    const bend = longEdge?.points?.[1];
    expect(bend).toBeDefined();
    await graph.camera().zoomToCenter();
    await graph.clickAt(bend ?? { x: 0, y: 0 });
    expect(await graph.connection("a-d").isSelected()).toBe(true);
  });

  test("ignores anchors of block connections", async ({ page }) => {
    const graph = new GraphPageObject(page);
    await graph.initialize({});
    const anchored = BLOCK_CONNECTIONS.map((c) => ({ ...c, sourceAnchorId: "out", targetAnchorId: "in" }));
    await applyLayeredLayout(graph, { blocks: createBlocks(true), connections: anchored });

    // Documented limitation: points use the block middles, and the anchors stay on the connection.
    await expectLayeredPlacement(graph);
    expect(await graph.connection("a-d").getState()).toMatchObject({ sourceAnchorId: "out", targetAnchorId: "in" });
  });

  test("applies the layout computed by useLayeredLayout in a React app", async ({ page }) => {
    const graph = new ReactGraphPageObject(page);
    await graph.initialize({});
    await applyLayeredLayoutWithHook(graph, { blocks: createBlocks(), connections: BLOCK_CONNECTIONS });

    await expectLayeredPlacement(graph);
  });

  test("keeps port-only connections unchanged next to laid out block connections", async ({ page }) => {
    const graph = new ReactGraphPageObject(page);
    await graph.initialize({});
    const portId = await page.evaluate(() => {
      const { createAnchorPortId } = window.GraphModule;
      return { source: createAnchorPortId("a", "out"), target: createAnchorPortId("d", "in") };
    });
    const portConnection: TConnection = { id: "ports", sourcePortId: portId.source, targetPortId: portId.target };
    await applyLayeredLayoutWithHook(graph, {
      blocks: createBlocks(true),
      connections: [...BLOCK_CONNECTIONS, portConnection],
    });

    await expectLayeredPlacement(graph);
    expect(await graph.connection("ports").exists()).toBe(true);
    const state = (await graph.connection("ports").getState()) as TMultipointConnection | null;
    expect(state).toMatchObject(portConnection);
    expect(state?.points).toBeUndefined();
  });
});
