import { expect, test, type Page } from "@playwright/test";

import type { CSSVariablesLayer } from "@gravity-ui/graph-css-variables";

import { GraphPageObject } from "../../page-objects/GraphPageObject";

declare global {
  interface Window {
    cssVariablesLayer?: CSSVariablesLayer;
    cssVariableChanges?: string[];
  }
}

const THEME_STYLES = `
  .e2e-graph-theme {
    --graph-block-background: rgb(10, 20, 30);
    --graph-grid-size: 24;
  }
  .e2e-theme-light {
    --graph-canvas-background: rgb(250, 250, 250);
    --graph-block-width: 220px;
  }
  .e2e-theme-dark {
    --graph-canvas-background: rgb(20, 20, 20);
    --graph-block-width: 240px;
  }
  .e2e-other-theme {
    --graph-block-background: rgb(1, 2, 3);
  }
`;

// Globals hold only what the graph cannot return: the layer instance and the onChange log.
async function addCSSVariablesLayer(graphPO: GraphPageObject, containerClass: string): Promise<void> {
  await graphPO.evaluate((graph, className) => {
    const { CSSVariablesLayer } = window.GraphModule;
    const changes: string[] = [];
    window.cssVariableChanges = changes;
    window.cssVariablesLayer = graph.addLayer(CSSVariablesLayer, {
      containerClass: className,
      onChange: (batch) => changes.push(...batch.map((change) => `${change.name}=${change.value}`)),
    });
  }, containerClass);
}

function readBlockBackground(graphPO: GraphPageObject): Promise<string> {
  return graphPO.evaluate((graph) => graph.graphColors.block.background);
}

function readCanvasBackground(graphPO: GraphPageObject): Promise<string> {
  return graphPO.evaluate((graph) => graph.graphColors.canvas.layerBackground);
}

function readBlockWidth(graphPO: GraphPageObject): Promise<number> {
  return graphPO.evaluate((graph) => graph.graphConstants.block.WIDTH);
}

async function setRootVariable(page: Page, name: string, value: string): Promise<void> {
  await page.evaluate(
    ([variable, variableValue]) =>
      document.querySelector<HTMLElement>("#root")?.style.setProperty(variable, variableValue),
    [name, value] as const
  );
}

test.describe("CSSVariablesLayer", () => {
  let graphPO: GraphPageObject;

  test.beforeEach(async ({ page }) => {
    graphPO = new GraphPageObject(page);
    await graphPO.initialize({ blocks: [], connections: [] });
    await page.addStyleTag({ content: THEME_STYLES });
  });

  test("applies variables that exist before the layer is added", async ({ page }) => {
    await addCSSVariablesLayer(graphPO, "e2e-graph-theme");

    expect(await readBlockBackground(graphPO)).toBe("rgb(10, 20, 30)");
    expect(await graphPO.evaluate((graph) => graph.graphConstants.system.GRID_SIZE)).toBe(24);
    expect(await page.evaluate(() => window.cssVariableChanges)).toEqual(
      expect.arrayContaining(["--graph-block-background=rgb(10, 20, 30)", "--graph-grid-size=24"])
    );
  });

  test("follows theme switches, inline overrides and stylesheet changes", async ({ page }) => {
    await page.evaluate(() => document.querySelector("#root")?.classList.add("e2e-theme-light"));
    await addCSSVariablesLayer(graphPO, "e2e-graph-theme");
    expect(await readCanvasBackground(graphPO)).toBe("rgb(250, 250, 250)");
    expect(await readBlockWidth(graphPO)).toBe(220);

    // The container inherits theme variables from an ancestor of the graph.
    await page.evaluate(() => document.querySelector("#root")?.classList.replace("e2e-theme-light", "e2e-theme-dark"));
    await expect.poll(() => readCanvasBackground(graphPO)).toBe("rgb(20, 20, 20)");
    await expect.poll(() => readBlockWidth(graphPO)).toBe(240);

    await setRootVariable(page, "--graph-canvas-background", "rgb(5, 6, 7)");
    await expect.poll(() => readCanvasBackground(graphPO)).toBe("rgb(5, 6, 7)");

    await page.addStyleTag({ content: ".e2e-graph-theme { --graph-block-background: rgb(40, 50, 60); }" });
    await expect.poll(() => readBlockBackground(graphPO)).toBe("rgb(40, 50, 60)");
    expect(await page.evaluate(() => window.cssVariableChanges)).toContain("--graph-block-background=rgb(40, 50, 60)");
  });

  test("applies a variable first defined after the layer is added", async ({ page }) => {
    const readCanvasDots = (): Promise<string> => graphPO.evaluate((graph) => graph.graphColors.canvas.dots);
    await addCSSVariablesLayer(graphPO, "e2e-graph-theme");
    // style-observer re-reads every property once the container is first rendered. Wait past that
    // initial read so the assignment below is caught by change detection alone.
    await graphPO.waitForFrames(5);
    await page.waitForTimeout(100);

    await setRootVariable(page, "--graph-canvas-dots", "rgb(3, 3, 3)");
    await expect.poll(readCanvasDots).toBe("rgb(3, 3, 3)");

    // Unsetting a variable keeps the value applied last; defining it again is reported again.
    await page.evaluate(() =>
      document.querySelector<HTMLElement>("#root")?.style.removeProperty("--graph-canvas-dots")
    );
    // A negative check needs a fixed wait, as in the layer removal test below.
    await graphPO.waitForFrames(5);
    await page.waitForTimeout(200);
    expect(await readCanvasDots()).toBe("rgb(3, 3, 3)");
    await page.addStyleTag({ content: ".e2e-graph-theme { --graph-canvas-dots: rgb(4, 4, 4); }" });
    await expect.poll(readCanvasDots).toBe("rgb(4, 4, 4)");
    const changes = await page.evaluate(() => window.cssVariableChanges ?? []);
    expect(changes.filter((change) => change.startsWith("--graph-canvas-dots="))).toEqual([
      "--graph-canvas-dots=rgb(3, 3, 3)",
      "--graph-canvas-dots=rgb(4, 4, 4)",
    ]);
  });

  test("observes the new container class after setProps", async ({ page }) => {
    await addCSSVariablesLayer(graphPO, "e2e-graph-theme");
    await expect.poll(() => readBlockBackground(graphPO)).toBe("rgb(10, 20, 30)");

    await page.evaluate(() => window.cssVariablesLayer?.setProps({ containerClass: "e2e-other-theme" }));
    await expect.poll(() => readBlockBackground(graphPO)).toBe("rgb(1, 2, 3)");
    await expect(page.locator(".e2e-graph-theme")).toHaveCount(0);
    await expect(page.locator(".e2e-other-theme")).toHaveCount(1);

    // The observer is restarted on the new container, so later changes keep arriving.
    await page.addStyleTag({ content: ".e2e-other-theme { --graph-block-background: rgb(70, 80, 90); }" });
    await expect.poll(() => readBlockBackground(graphPO)).toBe("rgb(70, 80, 90)");
  });

  test("removing the layer removes its container and stops syncing", async ({ page }) => {
    await page.evaluate(() => document.querySelector("#root")?.classList.add("e2e-theme-light"));
    await addCSSVariablesLayer(graphPO, "e2e-graph-theme");
    await expect(page.locator(".e2e-graph-theme")).toHaveCount(1);
    expect(await readCanvasBackground(graphPO)).toBe("rgb(250, 250, 250)");

    await graphPO.evaluate((graph) => {
      if (window.cssVariablesLayer) graph.removeLayer(window.cssVariablesLayer);
    });
    await expect(page.locator(".e2e-graph-theme")).toHaveCount(0);

    await page.evaluate(() => document.querySelector("#root")?.classList.replace("e2e-theme-light", "e2e-theme-dark"));
    // A negative check needs a fixed wait: an attached layer applies this switch within a few frames
    // (see the theme switch test), and no record must reach onChange either.
    await graphPO.waitForFrames(5);
    await page.waitForTimeout(200);
    expect(
      await page.evaluate(() => window.cssVariableChanges?.some((change) => change.includes("rgb(20, 20, 20)")))
    ).toBe(false);
    // Values applied before removal stay in the graph.
    expect(await readCanvasBackground(graphPO)).toBe("rgb(250, 250, 250)");
    expect(await readBlockBackground(graphPO)).toBe("rgb(10, 20, 30)");
  });
});
