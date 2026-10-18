import { expect, test } from "@playwright/test";
import { GraphPO } from "@gravity-ui/graph-playwright";

test("installed page objects drive blocks, connections and the camera of a consumer graph", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");

  // An application-owned wrapper, not the graph's internal markup.
  const graph = new GraphPO(page.locator("#graph-shell"));
  await graph.waitForReady();

  const source = graph.block("source");
  expect(await source.exists()).toBe(true);
  await source.click();
  expect(await graph.getSelectedBlockIds()).toEqual(["source"]);

  const endpoints = { sourceBlockId: "source", targetBlockId: "target", sourceAnchorId: "out", targetAnchorId: "in" };
  expect(await graph.hasConnectionBetween("source", "target", { sourceAnchorId: "out", targetAnchorId: "in" })).toBe(
    true
  );
  const connectionId = await graph.findConnectionId(endpoints);
  if (connectionId === null) throw new Error("The anchor connection was not found.");
  const connection = graph.connection(connectionId);
  await connection.click();
  expect(await connection.isSelected()).toBe(true);
  expect(await graph.getSelectedConnectionIds()).toEqual([connectionId]);

  await source.dragTo({ x: 300, y: 500 }, { steps: 2 });
  expect(await source.getCenter()).toEqual({ x: 300, y: 500 });

  await graph.camera().zoomToScale(0.5);
  expect((await graph.camera().getState()).scale).toBeCloseTo(0.5);
  expect(errors).toEqual([]);
});
