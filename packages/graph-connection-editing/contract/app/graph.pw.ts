import { expect, test } from "@playwright/test";
import { createAnchorPortId } from "@gravity-ui/graph";
import { GraphPO } from "@gravity-ui/graph-playwright";

const sourcePortId = String(createAnchorPortId("source", "out"));
const targetPortId = String(createAnchorPortId("target", "in"));

test("installed connection editing layer creates a connection in the consumer graph", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  const graph = new GraphPO(page.locator("#graph-shell"));
  await graph.waitForReady();
  const root = page.locator("#graph");
  await expect(root).toHaveAttribute("data-connection-editing-ready", "true");
  const ports = await graph.evaluate(
    (consumerGraph, ids) => {
      const point = (id: string) => {
        const port = consumerGraph.connections.getPort(id);
        return port && !port.lookup ? { x: port.x, y: port.y } : null;
      };
      return { source: point(ids.sourcePortId), target: point(ids.targetPortId) };
    },
    { sourcePortId, targetPortId }
  );
  if (!ports.source || !ports.target) throw new Error("Anchor ports are not positioned.");

  await graph.drag(ports.source, ports.target);

  await expect(root).toHaveAttribute("data-created", `${sourcePortId}->${targetPortId}`);
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
