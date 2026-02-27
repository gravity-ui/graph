import { test, expect } from "@playwright/test";

test("html blocks disappear after reload with double setEntities", async ({ page }) => {
  await page.goto("/react.html");
  
  await page.waitForFunction(() => (window as any).graphLibraryLoaded === true);

  const blocks = [
    { id: "b1", is: "Block", x: 100, y: 100, width: 200, height: 100, name: "B1", anchors: [], selected: false },
    { id: "b2", is: "Block", x: 400, y: 100, width: 200, height: 100, name: "B2", anchors: [], selected: false },
  ];

  await page.evaluate((blocks) => {
    const { Graph, GraphCanvas, GraphBlock, React, ReactDOM } = (window as any).GraphModule;
    const rootEl = document.getElementById("root");
    const graph = new Graph({}, rootEl);
    const reactRoot = ReactDOM.createRoot(rootEl);
    
    const renderBlock = (g: any, block: any) => {
      return React.createElement(
        GraphBlock,
        { graph: g, block },
        React.createElement("div", { "data-testid": `block-${block.id}` }, block.name)
      );
    };
    
    reactRoot.render(React.createElement(GraphCanvas, { graph, renderBlock }));
    graph.setEntities({ blocks, connections: [] });
    graph.start();
    graph.zoom({ scale: 1.0 });
    window.graph = graph;
    window.graphInitialized = true;
  }, blocks);
  
  await page.waitForFunction(() => window.graphInitialized === true);
  
  // Wait enough for initial render
  await page.evaluate(() => new Promise<void>(resolve => {
    let n = 10;
    const tick = () => { if (--n <= 0) resolve(); else requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }));
  
  const initialState = await page.evaluate(() => {
    const els = document.querySelectorAll("[data-testid^='block-']");
    return { count: els.length, scale: window.graph.cameraService.getCameraScale() };
  });
  console.log("Initial state:", initialState);
  
  // Now simulate "reload" - double setEntities
  await page.evaluate((blocks) => {
    window.graph.setEntities({ blocks: [], connections: [] });
    window.graph.setEntities({ blocks, connections: [] });
  }, blocks);
  
  await page.evaluate(() => new Promise<void>(resolve => {
    let n = 20;
    const tick = () => { if (--n <= 0) resolve(); else requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }));
  
  const afterReloadState = await page.evaluate(() => {
    const els = document.querySelectorAll("[data-testid^='block-']");
    const storeBlocks = window.graph.rootStore.blocksList.$blocks.value.map((b: any) => b.id);
    const scale = window.graph.cameraService.getCameraScale();
    const cameraLevel = window.graph.cameraService.getCameraBlockScaleLevel();
    return { count: els.length, storeBlocks, scale, cameraLevel };
  });
  console.log("After reload state:", afterReloadState);
  
  expect(afterReloadState.count).toBe(2);
});
