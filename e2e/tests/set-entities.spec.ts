import { test, expect } from "@playwright/test";
import { ReactGraphPageObject } from "../page-objects/ReactGraphPageObject";

const BLOCKS_DATA = [
  {
    id: "block-1",
    is: "Block" as const,
    x: 100,
    y: 100,
    width: 200,
    height: 100,
    name: "Block 1",
    anchors: [],
    selected: false,
  },
  {
    id: "block-2",
    is: "Block" as const,
    x: 400,
    y: 100,
    width: 200,
    height: 100,
    name: "Block 2",
    anchors: [],
    selected: false,
  },
  {
    id: "block-3",
    is: "Block" as const,
    x: 250,
    y: 300,
    width: 200,
    height: 100,
    name: "Block 3",
    anchors: [],
    selected: false,
  },
];

test.describe("setEntities - HTML blocks rendering (issue #249)", () => {
  let graphPO: ReactGraphPageObject;

  test.beforeEach(async ({ page }) => {
    graphPO = new ReactGraphPageObject(page);

    // Initialize with empty graph at "Detailed" zoom level (scale >= 0.7)
    // so HTML blocks (ReactLayer / BlocksList) are rendered
    await graphPO.initialize({
      blocks: [],
      connections: [],
    });

    // Zoom in to "Detailed" scale level (>= 0.7) to activate HTML block rendering
    const camera = graphPO.getCamera();
    await camera.zoomToScale(1.0);
  });

  test("should render HTML blocks after initial setEntities", async () => {
    await graphPO.setEntities({ blocks: BLOCKS_DATA, connections: [] });
    await graphPO.waitForFrames(5);

    const count = await graphPO.getRenderedHtmlBlockCount();
    expect(count).toBe(3);
  });

  test("should render HTML blocks after setEntities with empty then full data (issue #249)", async () => {
    // This is the exact scenario from the issue:
    // calling setEntities twice rapidly - first clear, then populate
    await graphPO.page.evaluate((blocks) => {
      // Call both setEntities back-to-back with no await between them
      window.graph.setEntities({ blocks: [], connections: [] });
      window.graph.setEntities({ blocks, connections: [] });
    }, BLOCKS_DATA);

    // Wait enough frames for the rendering to complete
    await graphPO.waitForFrames(10);

    // All 3 HTML blocks should be visible
    const count = await graphPO.getRenderedHtmlBlockCount();
    expect(count).toBe(3);

    const ids = await graphPO.getRenderedHtmlBlockIds();
    expect(ids).toContain("block-1");
    expect(ids).toContain("block-2");
    expect(ids).toContain("block-3");
  });

  test("should render HTML blocks after setEntities with small delay between calls", async () => {
    // As described in the issue, even a small timeout may not prevent the problem
    await graphPO.page.evaluate(async (blocks) => {
      window.graph.setEntities({ blocks: [], connections: [] });

      // Small synchronous delay (setTimeout 0 - one tick)
      await new Promise<void>((resolve) => setTimeout(resolve, 0));

      window.graph.setEntities({ blocks, connections: [] });
    }, BLOCKS_DATA);

    await graphPO.waitForFrames(10);

    const count = await graphPO.getRenderedHtmlBlockCount();
    expect(count).toBe(3);
  });

  test("should update HTML blocks when setEntities replaces blocks with different data", async () => {
    // Set initial blocks
    await graphPO.setEntities({ blocks: BLOCKS_DATA, connections: [] });
    await graphPO.waitForFrames(5);

    expect(await graphPO.getRenderedHtmlBlockCount()).toBe(3);

    // Replace with different blocks
    const newBlocks = [
      {
        id: "new-block-1",
        is: "Block" as const,
        x: 200,
        y: 200,
        width: 200,
        height: 100,
        name: "New Block 1",
        anchors: [],
        selected: false,
      },
    ];

    await graphPO.page.evaluate((blocks) => {
      window.graph.setEntities({ blocks: [], connections: [] });
      window.graph.setEntities({ blocks, connections: [] });
    }, newBlocks);

    await graphPO.waitForFrames(10);

    const count = await graphPO.getRenderedHtmlBlockCount();
    expect(count).toBe(1);

    const rendered = await graphPO.isHtmlBlockRendered("new-block-1");
    expect(rendered).toBe(true);
  });
});
