# Testing graph applications with Playwright

The package exposes Playwright page objects through a separate entry point. They let tests interact with canvas-rendered blocks and connections without depending on internal DOM structure.

```bash
npm install --save-dev @playwright/test
```

## Setup

Give the graph an application-owned locator. The locator may be the element passed to `graph.attach()` or an ancestor containing exactly one graph.

```tsx
<div data-testid="workflow-graph">
  <GraphCanvas graph={graph} renderBlock={renderBlock} />
</div>
```

```ts
import { expect, test } from "@playwright/test";
import { GraphPO } from "@gravity-ui/graph/playwright";

test("selects a graph block", async ({ page }) => {
  await page.goto("/workflow");

  const graph = new GraphPO(page.getByTestId("workflow-graph"));
  await graph.waitForReady();

  const block = graph.block("block-1");
  await block.click();

  await expect.poll(() => block.isSelected()).toBe(true);
});
```

`waitForReady()` waits for the application to attach and start the graph. `GraphPO` does not create a graph or navigate to an application page.

## Page objects

- `graph.block(id)` returns a `GraphBlockPO` for state, geometry, click, hover, double-click, and drag operations.
- `graph.connection(id)` returns a `GraphConnectionPO` for connection state and curve interactions.
- `graph.camera()` returns a `GraphCameraPO` for camera state, zoom, pan, and wheel gestures.
- `graph.clickAt()`, `hoverAt()`, and `drag()` interact with arbitrary world coordinates.

Use `ControlOrMeta` for portable multi-selection tests:

```ts
await graph.block("block-1").click();
await graph.block("block-2").click({ modifiers: ["ControlOrMeta"] });
```

## Browser evaluation escape hatch

For application-specific assertions, `evaluate()` runs a serializable callback in the browser against the matching `Graph` instance:

```ts
const blockName = await graph.evaluate((instance, blockId) => instance.blocks.getBlock(blockId)?.name, "block-1");
```

Callbacks cannot capture variables from the Node.js test context. Pass values through the second argument.
