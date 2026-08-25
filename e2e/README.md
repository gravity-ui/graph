# E2E testing with Playwright

This directory contains the library's end-to-end tests. The suite uses the same
`GraphPO`, `GraphBlockPO`, `GraphConnectionPO`, and `GraphCameraPO` classes that
are published for consumers from `@gravity-ui/graph/playwright`.

## Structure

```text
e2e/
├── page-objects/
│   ├── GraphPageObject.ts            # Test-page setup built on public GraphPO
│   ├── GraphCameraComponentObject.ts # Repository-only camera emulation helpers
│   ├── GraphEventProbe.ts             # Repository-only graph event collector
│   └── ReactGraphPageObject.ts        # React fixture setup
├── pages/                             # HTML fixtures
├── tests/                             # Playwright tests
├── global.d.ts                        # Fixture-page globals
├── server.js                          # Test server
└── tsconfig.json
```

`GraphPageObject` is deliberately small: it navigates to a fixture page,
creates a graph, and adapts `waitForFrames` to the library scheduler. General
graph actions and queries belong to the public page objects in `src/playwright`.
Tests that inspect implementation details use a focused internal extension such
as `GraphEventProbe` instead of expanding the general graph PO.

## Running tests

The standard command builds the project, starts the test server, runs the suite,
and stops the server:

```bash
pnpm run test:e2e
```

Other useful commands:

```bash
pnpm run test:e2e:ui
pnpm run test:e2e:debug
pnpm run e2e:dev
pnpm exec playwright test block-click
```

With `e2e:dev`, run `pnpm exec playwright test --ui` in another terminal.

## Example

```typescript
import { expect, test } from "@playwright/test";

import { GraphPageObject } from "../page-objects/GraphPageObject";

test("interacts with graph entities", async ({ page }) => {
  const graph = new GraphPageObject(page);
  await graph.initialize({
    blocks: [
      { id: "block-1", x: 100, y: 100, width: 200, height: 100, name: "One" },
      { id: "block-2", x: 400, y: 200, width: 200, height: 100, name: "Two" },
    ],
    connections: [{ id: "connection-1", sourceBlockId: "block-1", targetBlockId: "block-2" }],
  });

  const firstBlock = graph.block("block-1");
  await firstBlock.click();
  expect(await firstBlock.isSelected()).toBe(true);

  await graph.block("block-2").click({ modifiers: ["ControlOrMeta"] });
  expect(await graph.getSelectedBlockIds()).toHaveLength(2);

  await firstBlock.dragTo({ x: 300, y: 300 }, { waitForFrames: 20 });
  await graph.camera().zoomToScale(0.5);

  expect(await graph.connection("connection-1").exists()).toBe(true);

  await graph.clickAt({ x: 500, y: 300 });
  await graph.drag({ x: 100, y: 100 }, { x: 200, y: 200 });
});
```

## Public page-object API used by the suite

`GraphPO` provides:

- `block(id)`, `connection(id)`, and `camera()`
- `evaluate(callback, arg?)`
- `clickAt`, `doubleClickAt`, `hoverAt`, and `drag`
- `getSelectedBlockIds`, `getConnections`, and `hasConnectionBetween`
- `waitForReady`, `waitForFrames`, and `getBounds`

`GraphBlockPO` provides block state, geometry, selection, and interactions.
`GraphConnectionPO` provides connection state, geometry-based interactions, and
selection. `GraphCameraPO` provides camera state, zoom, pan, bounds, and wheel
gestures.

The methods accept `waitForFrames` where an interaction needs a configurable
post-action wait:

```typescript
await graph.block("block-1").click({ waitForFrames: 5 });
await graph.hoverAt({ x: 100, y: 100 }, { waitForFrames: 0 });
await graph.block("block-1").dragTo({ x: 300, y: 300 }, { waitForFrames: 20 });
```

## Repository-only extensions

Some tests intentionally verify library internals. Keep these capabilities out
of the published consumer API unless they represent a real consumer use case.

- `graph.events.listen(name)` keeps complete events in the browser for
  browser-context analysis.
- `graph.events.collectDetails(name)` collects serializable event details.
- `graph.camera()` returns the internal camera subclass in this suite, adding
  device emulation and camera-signal assertions to the public camera API.
- `graph.setEntities(config)` updates the fixture graph.

If an internal helper is only used by one scenario, prefer a local helper in
that spec rather than a new method on `GraphPageObject`.

## Coordinates and synchronization

Public interaction methods accept world coordinates and perform the conversion
to graph-root coordinates internally. Tests normally should not call camera
coordinate conversion methods directly.

The library schedules rendering with `requestAnimationFrame`. Use
`waitForFrames` or an interaction's `waitForFrames` option instead of fixed
timeouts:

```typescript
await graph.clickAt({ x: 100, y: 100 }, { waitForFrames: 2 });
await graph.waitForFrames(2);
```

## Adding tests

1. Create a spec under `e2e/tests/`.
2. Initialize `GraphPageObject` (or `ReactGraphPageObject`) in the test fixture.
3. Prefer the public page-object methods for graph interactions.
4. Add a narrowly scoped repository-only probe only when testing an internal
   contract that the public API should not expose.
5. Use Playwright assertions and frame-based synchronization.
