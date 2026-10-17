import { expect, test } from "@playwright/test";
import { GraphPO } from "@gravity-ui/graph/playwright";

test("installed connection editing layer creates a connection in the consumer graph", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  const graph = new GraphPO(page.locator("#graph-shell"));
  await graph.waitForReady();
  const root = page.locator("#graph");
  await expect(root).toHaveAttribute("data-connection-editing-ready", "true");
  const ports = await graph.evaluate((consumerGraph) => {
    const point = (id: string) => {
      const port = consumerGraph.connections.getPort(id);
      return port && !port.lookup ? { x: port.x, y: port.y } : null;
    };
    return { source: point("source/out"), target: point("target/in") };
  });
  if (!ports.source || !ports.target) throw new Error("Anchor ports are not positioned.");

  await graph.drag(ports.source, ports.target);

  await expect(root).toHaveAttribute("data-created", "source/out->target/in");
  expect(await graph.getConnections()).toEqual([
    expect.objectContaining({
      sourceBlockId: "source",
      sourceAnchorId: "out",
      targetBlockId: "target",
      targetAnchorId: "in",
    }),
  ]);
  expect(errors).toEqual([]);
});
