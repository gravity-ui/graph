import { test, expect } from "@playwright/test";
import { GraphPageObject } from "../../page-objects/GraphPageObject";

test.describe("Block Click Selection", () => {
  let graphPO: GraphPageObject;

  test.beforeEach(async ({ page }) => {
    graphPO = new GraphPageObject(page);

    // Initialize graph with test blocks
    await graphPO.initialize({
      settings: { doubleClickInterval: 2000 },
      blocks: [
        {
          id: "block-1",
          is: "Block",
          x: 100,
          y: 100,
          width: 200,
          height: 100,
          name: "Block 1",
          anchors: [],
        },
        {
          id: "block-2",
          is: "Block",
          x: 400,
          y: 200,
          width: 200,
          height: 100,
          name: "Block 2",
          anchors: [],
        },
        {
          id: "block-3",
          is: "Block",
          x: 100,
          y: 400,
          width: 200,
          height: 100,
          name: "Block 3",
          anchors: [],
        },
      ],
      connections: [],
    });
  });

  test("should select block on click", async () => {
    // Get block COM
    const block1 = graphPO.block("block-1");

    // Click on block
    await block1.click();

    // Check if block is selected
    const isSelected = await block1.isSelected();
    expect(isSelected).toBe(true);

    // Check selected blocks list
    const selectedBlocks = await graphPO.getSelectedBlockIds();
    expect(selectedBlocks).toContain("block-1");
    expect(selectedBlocks).toHaveLength(1);
  });

  test("the first click after leaving a focused HTML input selects the block", async ({ page }) => {
    await page.evaluate(() => {
      const input = document.createElement("input");
      input.setAttribute("aria-label", "Block name");
      document.body.append(input);
      input.focus();
    });
    const field = page.getByRole("textbox", { name: "Block name" });
    await expect(field).toBeFocused();
    await graphPO.block("block-1").click();
    await expect(field).not.toBeFocused();
    expect(await graphPO.getSelectedBlockIds()).toEqual(["block-1"]);
  });

  test("Enter and Space activate an embedded HTML button once each and preserve graph selection", async ({ page }) => {
    const block = graphPO.block("block-1");
    await block.click();
    const activations = await page.evaluateHandle(() => {
      const graph = window.graph;
      const root = graph.layers.$root;
      if (!root) throw new Error("Missing graph root");
      const button = document.createElement("button");
      button.textContent = "Run block";
      root.append(button);
      const counts = { html: 0, graph: 0 };
      button.addEventListener("click", () => counts.html++);
      graph.on("click", () => counts.graph++, { capture: true });
      return counts;
    });
    const button = page.getByRole("button", { name: "Run block" });
    await button.press("Enter");
    expect.soft(await activations.jsonValue()).toEqual({ html: 1, graph: 0 });
    await button.press("Space");
    expect.soft(await activations.jsonValue()).toEqual({ html: 2, graph: 0 });
    await button.click();
    expect(await activations.jsonValue()).toEqual({ html: 3, graph: 0 });
    expect(await graphPO.getSelectedBlockIds()).toEqual(["block-1"]);
    await activations.dispose();
  });

  test("two slow activations on the same block use the configured double-click interval", async ({ page }) => {
    const activations = await page.evaluateHandle(() => {
      const events: string[] = [];
      window.graph.on("click", () => events.push("click"), { capture: true });
      window.graph.on("dblclick", () => events.push("dblclick"), { capture: true });
      for (const type of ["mousedown", "mouseup", "click", "dblclick"]) {
        document.addEventListener(type, (event) => event.stopImmediatePropagation(), { capture: true });
      }
      return events;
    });
    const block = graphPO.block("block-1");
    await block.click();
    expect.soft(await activations.jsonValue()).toEqual(["click"]);
    await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 600)));
    await block.click();
    expect(await activations.jsonValue()).toEqual(["click", "click", "dblclick"]);
    expect(await graphPO.getSelectedBlockIds()).toEqual(["block-1"]);
    await activations.dispose();
  });

  test("exclusive double-click leaves a block unselected and the following single selects it", async ({ page }) => {
    const log = await page.evaluateHandle(() => {
      const graph = window.graph;
      graph.updateSettings({ clickPolicy: "exclusive", doubleClickInterval: 250 });
      const events: string[] = [];
      graph.on("click", ({ type }) => events.push(type));
      graph.on("dblclick", ({ type }) => events.push(type));
      return events;
    });
    const block = graphPO.block("block-1");
    await block.doubleClick();
    expect(await log.jsonValue()).toEqual(["dblclick"]);
    expect(await block.isSelected()).toBe(false);
    await block.click();
    await expect.poll(() => block.isSelected()).toBe(true);
    expect(await log.jsonValue()).toEqual(["dblclick", "click"]);
  });

  test("should deselect block when clicking on empty space", async () => {
    // Get block COM
    const block1 = graphPO.block("block-1");

    // Select block first
    await block1.click();

    // Verify it's selected
    let selectedBlocks = await graphPO.getSelectedBlockIds();
    expect(selectedBlocks).toContain("block-1");

    // Click on empty space (top-left corner)
    await graphPO.page.mouse.click(10, 10);
    await graphPO.waitForFrames(2);

    // Check that no blocks are selected
    selectedBlocks = await graphPO.getSelectedBlockIds();
    expect(selectedBlocks).toHaveLength(0);
  });

  test("should select multiple blocks with Ctrl+Click", async () => {
    // Get block COMs
    const block1 = graphPO.block("block-1");
    const block2 = graphPO.block("block-2");

    // Select first block
    await block1.click();

    // Click second block with Ctrl modifier (Cmd on Mac)
    await block2.click({ modifiers: ["ControlOrMeta"] });

    // Check that both blocks are selected
    const selectedBlocks = await graphPO.getSelectedBlockIds();
    expect(selectedBlocks).toHaveLength(2);
    expect(selectedBlocks).toContain("block-1");
    expect(selectedBlocks).toContain("block-2");
  });
});
