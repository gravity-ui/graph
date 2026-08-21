import { expect, test } from "@playwright/test";

test.describe("Anchor CSS variables", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/base.html");
    await page.waitForFunction(() => (window as Window & { graphLibraryLoaded?: boolean }).graphLibraryLoaded === true);
  });

  test("provides default width and height values", async ({ page }) => {
    const styles = await page.evaluate(() => {
      const graph = document.createElement("div");
      graph.className = "graph-wrapper";

      const anchor = document.createElement("div");
      anchor.className = "graph-block-anchor";
      graph.appendChild(anchor);
      document.body.appendChild(graph);

      const computedStyle = window.getComputedStyle(anchor);
      return {
        widthVariable: computedStyle.getPropertyValue("--graph-block-anchor-width").trim(),
        heightVariable: computedStyle.getPropertyValue("--graph-block-anchor-height").trim(),
        width: computedStyle.width,
        height: computedStyle.height,
      };
    });

    expect(styles).toEqual({
      widthVariable: "16px",
      heightVariable: "16px",
      width: "16px",
      height: "16px",
    });
  });

  test("allows consumers to override width and height", async ({ page }) => {
    await page.addStyleTag({
      content: `
        .anchor {
          --graph-block-anchor-width: 24px;
          --graph-block-anchor-height: 20px;
        }
      `,
    });

    const styles = await page.evaluate(() => {
      const graph = document.createElement("div");
      graph.className = "graph-wrapper";

      const anchor = document.createElement("div");
      anchor.className = "graph-block-anchor anchor";
      graph.appendChild(anchor);
      document.body.appendChild(graph);

      const computedStyle = window.getComputedStyle(anchor);
      return {
        widthVariable: computedStyle.getPropertyValue("--graph-block-anchor-width").trim(),
        heightVariable: computedStyle.getPropertyValue("--graph-block-anchor-height").trim(),
        width: computedStyle.width,
        height: computedStyle.height,
      };
    });

    expect(styles).toEqual({
      widthVariable: "24px",
      heightVariable: "20px",
      width: "24px",
      height: "20px",
    });
  });
});
