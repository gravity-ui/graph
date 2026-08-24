import { expect, test } from "@playwright/test";
import type { Graph, TBlock, TConnection } from "@gravity-ui/graph";
import { GraphPO } from "@gravity-ui/graph/playwright";

test("installed package exposes working typed Graph page objects", async ({ page }) => {
  await page.goto("/");

  // Use an application-owned wrapper to make sure consumers do not need to
  // depend on internal Graph markup or CSS selectors.
  const graph = new GraphPO(page.locator("#graph-shell"));
  await graph.waitForReady();

  const evaluated = await graph.evaluate(
    (instance: Graph, ids) => {
      const block: TBlock | null = instance.blocks.getBlockState(ids.block)?.asTBlock() ?? null;
      const connection: TConnection | null = instance.connections.getConnection(ids.connection) ?? null;

      return {
        state: instance.state,
        block,
        connection,
      };
    },
    { block: "source", connection: "source-to-target" }
  );

  expect(evaluated).toMatchObject({
    state: 2,
    block: { id: "source", name: "Source" },
    connection: {
      id: "source-to-target",
      sourceBlockId: "source",
      targetBlockId: "target",
    },
  });

  const block = graph.block("source");
  const blockState: TBlock | null = await block.getState();
  expect(blockState).toMatchObject({ id: "source", name: "Source" });

  await block.click();
  expect(await block.isSelected()).toBe(true);

  const connection = graph.connection("source-to-target");
  const connectionState: TConnection | null = await connection.getState();
  expect(connectionState).toMatchObject({
    id: "source-to-target",
    sourceBlockId: "source",
    targetBlockId: "target",
  });

  await connection.click();
  expect(await connection.isSelected()).toBe(true);

  const initialCenter = await block.getCenter();
  const targetCenter = { x: initialCenter.x + 120, y: initialCenter.y + 80 };
  await block.dragTo(targetCenter, { steps: 5 });
  expect(await block.getCenter()).toEqual(targetCenter);

  await graph.camera().zoomToScale(0.75);
  expect((await graph.camera().getState()).scale).toBeCloseTo(0.75);
});
