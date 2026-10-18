# @gravity-ui/graph-playwright

Playwright page objects for applications built with `@gravity-ui/graph`. They let tests interact with canvas-rendered blocks and connections without depending on internal DOM structure.

This package is being developed on the unpublished v2 branch. Use it with the matching v2 core build.

```bash
npm install --save-dev @gravity-ui/graph-playwright @playwright/test
```

`@gravity-ui/graph` and `@playwright/test` are required peer dependencies. The page objects run in the Playwright (Node) process and load the core for types only; the package works from both ESM and CommonJS test files.

## Setup

Give the graph an application-owned locator. The locator may be the element passed to `graph.attach()` or an ancestor containing exactly one graph.

```tsx
<div data-testid="workflow-graph">
  <GraphCanvas graph={graph} renderBlock={renderBlock} />
</div>
```

```ts
import { expect, test } from "@playwright/test";
import { GraphPO } from "@gravity-ui/graph-playwright";

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
- `graph.hasConnectionBetween(sourceBlockId, targetBlockId, { sourceAnchorId?, targetAnchorId? })`,
  `hasConnectionBetweenPorts(sourcePortId, targetPortId)` and `findConnectionId(endpoints)` find connections by
  block/anchor or port endpoints, including port-only connections created without an id.
- `graph.getSelectedBlockIds()` and `getSelectedConnectionIds()` return the current selection.

Values returned from the page are serialized, so symbol port ids are not supported.

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

## Migration from `@gravity-ui/graph/playwright`

In v2 the page objects moved out of the core. Install this package and replace the import:

```diff
- import { GraphPO } from "@gravity-ui/graph/playwright";
+ import { GraphPO } from "@gravity-ui/graph-playwright";
```

Exported names and behavior are unchanged, except that graphs are discovered only through
`Symbol.for(GRAPH_INSTANCE_SYMBOL_KEY)`; the undocumented `Symbol.for("graph")` key is no longer used. See the
[v1 to v2 migration guide](https://github.com/gravity-ui/graph/blob/v2/packages/graph/docs/migration-guides/v1-to-v2.md#playwright-package-boundary)
and the [core documentation](https://github.com/gravity-ui/graph/blob/v2/packages/graph/README.md).
