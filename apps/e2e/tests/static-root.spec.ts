import { expect, test, type Page } from "@playwright/test";
import type { TBlock } from "@gravity-ui/graph";

import { GraphPageObject } from "../page-objects/GraphPageObject";

class StaticRootGraphPageObject extends GraphPageObject {
  protected override getUrl(): string {
    return "/static-root.html";
  }
}

const block = (id: string, x: number, y: number): TBlock => ({
  id,
  is: "Block",
  x,
  y,
  width: 200,
  height: 120,
  name: id,
  anchors: [],
});

type TBox = { x: number; y: number; width: number; height: number };

async function getBoxes(page: Page): Promise<{ root: TBox; canvas: TBox; position: string }> {
  return page.evaluate(() => {
    const root = document.querySelector<HTMLElement>("#root");
    const canvas = root?.querySelector("canvas");
    if (!root || !canvas) throw new Error("Graph root or canvas not found");
    const rootRect = root.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    return {
      // Layers fill the padding box of their containing block.
      root: {
        x: rootRect.x + root.clientLeft,
        y: rootRect.y + root.clientTop,
        width: root.clientWidth,
        height: root.clientHeight,
      },
      canvas: { x: canvasRect.x, y: canvasRect.y, width: canvasRect.width, height: canvasRect.height },
      position: getComputedStyle(root).position,
    };
  });
}

test.describe("Graph attached to a statically positioned root", () => {
  test("lays layers out inside the root and hit-tests a connection", async ({ page }) => {
    const graph = new StaticRootGraphPageObject(page);
    await graph.initialize({
      blocks: [block("block-a", 100, 100), block("block-b", 500, 300)],
      connections: [{ id: "conn-ab", sourceBlockId: "block-a", targetBlockId: "block-b" }],
    });

    const { root, canvas, position } = await getBoxes(page);
    expect(position).toBe("relative");
    expect(canvas).toEqual(root);

    const connection = graph.connection("conn-ab");
    await connection.click();
    expect(await connection.isSelected()).toBe(true);
  });

  test("keeps a position set by the application", async ({ page }) => {
    const graph = new StaticRootGraphPageObject(page);
    await graph.initialize({ blocks: [block("block-a", 100, 100)] });
    await page.addStyleTag({ content: "#root { position: absolute; left: 40px; top: 40px; }" });
    await graph.waitForFrames(2);

    const { root, canvas, position } = await getBoxes(page);
    expect(position).toBe("absolute");
    expect(canvas).toEqual(root);
  });

  test("keeps a position set in an application cascade layer", async ({ page }) => {
    const graph = new StaticRootGraphPageObject(page);
    await graph.initialize({ blocks: [block("block-a", 100, 100)] });
    await page.addStyleTag({
      content: "@layer app { #root { position: absolute; left: 40px; top: 40px; } }",
    });
    await graph.waitForFrames(2);

    const { root, canvas, position } = await getBoxes(page);
    expect(position).toBe("absolute");
    expect(canvas).toEqual(root);
  });
});
