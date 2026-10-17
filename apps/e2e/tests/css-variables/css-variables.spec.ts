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

async function addCSSVariablesLayer(page: Page, containerClass: string): Promise<void> {
  await page.evaluate((className) => {
    const { CSSVariablesLayer } = window.GraphModule;
    const changes: string[] = [];
    window.cssVariableChanges = changes;
    window.cssVariablesLayer = window.graph.addLayer(CSSVariablesLayer, {
      containerClass: className,
      onChange: (batch) => changes.push(...batch.map((change) => `${change.name}=${change.value}`)),
    });
  }, containerClass);
}

function readBlockBackground(page: Page): Promise<string> {
  return page.evaluate(() => window.graph.graphColors.block.background);
}

function readCanvasBackground(page: Page): Promise<string> {
  return page.evaluate(() => window.graph.graphColors.canvas.layerBackground);
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
    await addCSSVariablesLayer(page, "e2e-graph-theme");

    expect(await readBlockBackground(page)).toBe("rgb(10, 20, 30)");
    expect(await page.evaluate(() => window.graph.graphConstants.system.GRID_SIZE)).toBe(24);
    expect(await page.evaluate(() => window.cssVariableChanges)).toEqual(
      expect.arrayContaining(["--graph-block-background=rgb(10, 20, 30)", "--graph-grid-size=24"])
    );
  });

  test("follows theme switches, inline overrides and stylesheet changes", async ({ page }) => {
    await page.evaluate(() => document.querySelector("#root")?.classList.add("e2e-theme-light"));
    await addCSSVariablesLayer(page, "e2e-graph-theme");
    expect(await readCanvasBackground(page)).toBe("rgb(250, 250, 250)");
    expect(await page.evaluate(() => window.graph.graphConstants.block.WIDTH)).toBe(220);

    // The container inherits theme variables from an ancestor of the graph.
    await page.evaluate(() => document.querySelector("#root")?.classList.replace("e2e-theme-light", "e2e-theme-dark"));
    await expect.poll(() => readCanvasBackground(page)).toBe("rgb(20, 20, 20)");
    await expect.poll(() => page.evaluate(() => window.graph.graphConstants.block.WIDTH)).toBe(240);

    await setRootVariable(page, "--graph-canvas-background", "rgb(5, 6, 7)");
    await expect.poll(() => readCanvasBackground(page)).toBe("rgb(5, 6, 7)");

    await page.addStyleTag({ content: ".e2e-graph-theme { --graph-block-background: rgb(40, 50, 60); }" });
    await expect.poll(() => readBlockBackground(page)).toBe("rgb(40, 50, 60)");
    expect(await page.evaluate(() => window.cssVariableChanges)).toContain("--graph-block-background=rgb(40, 50, 60)");
  });

  // Known defect, unchanged by the package extraction: style-observer misses the first assignment of a
  // variable that had no value when observation started; later changes are reported.
  test.fixme("applies a variable first defined after the layer is added", async ({ page }) => {
    await addCSSVariablesLayer(page, "e2e-graph-theme");
    await setRootVariable(page, "--graph-canvas-dots", "rgb(3, 3, 3)");
    await expect.poll(() => page.evaluate(() => window.graph.graphColors.canvas.dots)).toBe("rgb(3, 3, 3)");
  });

  // Known defect, unchanged by the package extraction: propsChanged() recreates the container with the
  // previous containerClass and does not restart the observer.
  test.fixme("observes the new container class after setProps", async ({ page }) => {
    await addCSSVariablesLayer(page, "e2e-graph-theme");
    await expect.poll(() => readBlockBackground(page)).toBe("rgb(10, 20, 30)");

    await page.evaluate(() => window.cssVariablesLayer?.setProps({ containerClass: "e2e-other-theme" }));
    await expect.poll(() => readBlockBackground(page)).toBe("rgb(1, 2, 3)");
    await expect(page.locator(".e2e-graph-theme")).toHaveCount(0);
    await expect(page.locator(".e2e-other-theme")).toHaveCount(1);
  });

  test("removing the layer removes its container and stops syncing", async ({ page }) => {
    await page.evaluate(() => document.querySelector("#root")?.classList.add("e2e-theme-light"));
    await addCSSVariablesLayer(page, "e2e-graph-theme");
    await expect(page.locator(".e2e-graph-theme")).toHaveCount(1);
    expect(await readCanvasBackground(page)).toBe("rgb(250, 250, 250)");

    await page.evaluate(() => {
      if (window.cssVariablesLayer) window.graph.removeLayer(window.cssVariablesLayer);
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
    expect(await readCanvasBackground(page)).toBe("rgb(250, 250, 250)");
    expect(await readBlockBackground(page)).toBe("rgb(10, 20, 30)");
  });
});
