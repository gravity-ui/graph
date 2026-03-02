import { test, expect } from "@playwright/test";
import { ReactGraphPageObject } from "../page-objects/ReactGraphPageObject";
import { TBlock } from "../../src/components/canvas/blocks/Block";

const blocks: TBlock[] = [
  { id: "b1", is: "Block", x: 100, y: 100, width: 200, height: 100, name: "B1", anchors: [], selected: false },
  { id: "b2", is: "Block", x: 400, y: 100, width: 200, height: 100, name: "B2", anchors: [], selected: false },
];

test("Issue #249: html blocks disappear after reload with double setEntities", async ({ page }) => {
  const graphPage = new ReactGraphPageObject(page);
  await graphPage.initialize({ blocks, connections: [] });
  await graphPage.setZoom(1.0);
  await graphPage.waitForFrames(10);

  // Simulate "reload" — double setEntities
  await graphPage.setEntities({ blocks: [], connections: [] });
  await graphPage.setEntities({ blocks, connections: [] });
  await graphPage.waitForFrames(20);

  expect(await graphPage.getRenderedHtmlBlockCount()).toBe(2);
});
