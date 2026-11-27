// Run against a built or running Storybook: STORYBOOK_URL=http://localhost:6006 node --test apps/storybook/tests/pointer-drag.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";

import { chromium, devices, expect } from "@playwright/test";

test("the ETL port stays under the first finger while the panel reports a second contact", async (t) => {
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const page = await browser.newPage({ ...devices["iPhone 13"], viewport: { width: 320, height: 720 } });
  const url = new URL(
    "iframe.html?id=canvas-sceneeffects--pointer-drag&viewMode=story",
    process.env.STORYBOOK_URL || "http://localhost:6006/"
  );
  await page.goto(url.href);
  const root = page.locator(".graph-root");
  await page.waitForFunction(
    () => document.querySelector(".graph-root")?.[Symbol.for("@gravity-ui/graph/instance")]?.scene.state === "ready"
  );
  await page.getByRole("button", { name: "Focus ports" }).click();
  const { source, target, count } = await root.evaluate((element) => {
    const graph = element[Symbol.for("@gravity-ui/graph/instance")];
    const rect = element.getBoundingClientRect();
    const point = (id) => {
      const port = graph.connections.getPort(id);
      const [x, y] = graph.cameraService.getAbsoluteXY(port.x, port.y);
      return { x: rect.left + x, y: rect.top + y };
    };
    return {
      source: point("p01/orders/out-0"),
      target: point("p01/extract/in-0"),
      count: graph.connections.getConnections().length,
    };
  });
  const cdp = await page.context().newCDPSession(page);
  const touch = (type, id, point) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: [{ id, ...point }] });
  const other = { x: target.x, y: target.y + 70 };
  const history = page.getByRole("log", { name: "Gesture history" });

  await touch("touchStart", 1, source);
  await touch("touchMove", 1, { x: source.x + 15, y: source.y });
  await expect(history).toHaveText("connection-create-start");
  await touch("touchStart", 2, other);
  await touch("touchMove", 2, { x: other.x, y: other.y + 8 });
  // Use the original coordinates: a wrapping diagnostic label used to push the target away mid-drag.
  await touch("touchMove", 1, target);
  await touch("touchEnd", 1, target);
  await touch("touchEnd", 2, other);

  await expect(history).toHaveText("connection-create-start → 2 fingers → connection-created → connection-create-drop");
  await expect(page.getByLabel("Last pointer gesture")).toContainText("1 → 2 → 1 → 0");
  const connections = await root.evaluate((el) => el[Symbol.for("@gravity-ui/graph/instance")].connections.toJSON());
  assert.equal(connections.length, count + 1);
  assert(
    connections.some(
      (c) =>
        c.sourceBlockId === "p01/orders" &&
        c.targetBlockId === "p01/extract" &&
        c.sourceAnchorId === "out-0" &&
        c.targetAnchorId === "in-0"
    )
  );
});
