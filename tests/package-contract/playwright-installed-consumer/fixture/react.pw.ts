import { expect, test } from "@playwright/test";
import type { TBlock } from "@gravity-ui/graph";
import { GraphPO } from "@gravity-ui/graph/playwright";

test("installed package exposes a working React entrypoint", async ({ page }) => {
  await page.goto("/react.html");

  const root = page.locator("#react-root");
  await expect(root).toHaveAttribute("data-state", "ready");

  const graph = new GraphPO(page.locator("#react-shell"));
  await graph.waitForReady();

  const blockState: TBlock | null = await graph.block("react-source").getState();
  expect(blockState).toMatchObject({ id: "react-source", name: "React source" });
  await expect(page.getByTestId("react-block-react-source")).toHaveText("React source");
});
