import { expect, test } from "@playwright/test";

import { GraphPageObject } from "../page-objects/GraphPageObject";

const BLOCKS = [
  {
    id: "block-a",
    is: "Block" as const,
    x: 100,
    y: 100,
    width: 180,
    height: 90,
    name: "Block A",
    anchors: [],
    selected: false,
  },
  {
    id: "block-b",
    is: "Block" as const,
    x: 380,
    y: 100,
    width: 180,
    height: 90,
    name: "Block B",
    anchors: [],
    selected: false,
  },
];

const CONNECTIONS = [
  {
    id: "connection-a-b",
    sourceBlockId: "block-a",
    targetBlockId: "block-b",
  },
];

type THighlightModesByEntity = Record<string, number | undefined>;

async function getModes(graphPO: GraphPageObject): Promise<THighlightModesByEntity> {
  return graphPO.page.evaluate(() => {
    const { GraphComponent } = window.GraphModule;
    const components = window.graph.getElementsOverRect(
      {
        x: -100000,
        y: -100000,
        width: 200000,
        height: 200000,
      },
      [GraphComponent],
    ) as Array<{
      getEntityType(): string;
      getEntityId(): string | number;
      getHighlightVisualMode(): number | undefined;
    }>;

    const result: THighlightModesByEntity = {};
    for (const component of components) {
      result[`${component.getEntityType()}:${String(component.getEntityId())}`] = component.getHighlightVisualMode();
    }

    return result;
  });
}

test.describe("HighlightService API", () => {
  let graphPO: GraphPageObject;

  test.beforeEach(async ({ page }) => {
    graphPO = new GraphPageObject(page);
    await graphPO.initialize({
      blocks: BLOCKS,
      connections: CONNECTIONS,
    });
    await graphPO.waitForFrames(4);
  });

  test("highlight() highlights only targets", async () => {
    await graphPO.page.evaluate(() => {
      window.graph.highlight({
        block: ["block-a"],
      });
    });
    await graphPO.waitForFrames(2);

    const modes = await getModes(graphPO);

    expect(modes["block:block-a"]).toBe(20);
    expect(modes["block:block-b"]).toBeUndefined();
    expect(modes["connection:connection-a-b"]).toBeUndefined();
  });

  test("focus() lowlights non-target entities", async () => {
    await graphPO.page.evaluate(() => {
      window.graph.focus({
        block: ["block-a"],
      });
    });
    await graphPO.waitForFrames(2);

    const modes = await getModes(graphPO);

    expect(modes["block:block-a"]).toBe(20);
    expect(modes["block:block-b"]).toBe(10);
    expect(modes["connection:connection-a-b"]).toBe(10);
  });

  test("clearHighlight() resets all highlight modes", async () => {
    await graphPO.page.evaluate(() => {
      window.graph.focus({
        block: ["block-a"],
      });
      window.graph.clearHighlight();
    });
    await graphPO.waitForFrames(2);

    const modes = await getModes(graphPO);

    expect(modes["block:block-a"]).toBeUndefined();
    expect(modes["block:block-b"]).toBeUndefined();
    expect(modes["connection:connection-a-b"]).toBeUndefined();
  });

  test("emits highlight-changed for highlight, focus and clear", async () => {
    const events = await graphPO.page.evaluate(() => {
      const collected: Array<{ mode?: string; previousMode?: string }> = [];

      const handler = (event: CustomEvent<{ mode?: string; previous?: { mode?: string } }>) => {
        collected.push({
          mode: event.detail.mode,
          previousMode: event.detail.previous?.mode,
        });
      };

      window.graph.on("highlight-changed", handler);

      window.graph.highlight({ block: ["block-a"] });
      window.graph.focus({ block: ["block-b"] });
      window.graph.clearHighlight();

      window.graph.off("highlight-changed", handler);

      return collected;
    });

    expect(events).toHaveLength(3);
    expect(events[0]).toEqual({ mode: "highlight", previousMode: undefined });
    expect(events[1]).toEqual({ mode: "focus", previousMode: "highlight" });
    expect(events[2]).toEqual({ mode: undefined, previousMode: "focus" });
  });
});
