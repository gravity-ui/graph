import { expect, test } from "@playwright/test";
import type { TMultipointConnection } from "@gravity-ui/graph";
import { GraphPO } from "@gravity-ui/graph/playwright";

test("installed layered layout positions blocks applied to the consumer graph", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  const graph = new GraphPO(page.locator("#graph-shell"));
  await graph.waitForReady();
  await expect(page.locator("#graph")).toHaveAttribute("data-layered-ready", "true");

  const [source, middle, target] = await Promise.all(
    ["source", "middle", "target"].map((id) => graph.block(id).getGeometry())
  );
  expect(middle.x).toBeGreaterThan(source.x + source.width);
  expect(target.x).toBeGreaterThan(middle.x + middle.width);

  const connection = (await graph.connection("source-middle").getState()) as TMultipointConnection | null;
  expect(connection?.points?.[0]).toEqual({ x: source.x + source.width, y: source.y + source.height / 2 });
  expect(connection?.points?.at(-1)).toEqual({ x: middle.x, y: middle.y + middle.height / 2 });
  expect(errors).toEqual([]);
});
