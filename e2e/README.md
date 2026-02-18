# E2E Testing with Playwright

This directory contains end-to-end tests for the @gravity-ui/graph library using Playwright and the PageObject pattern.

## Key Features

- **RAF-based Waiting**: Tests use `requestAnimationFrame` for synchronization instead of arbitrary timeouts, ensuring reliable tests that wait for the actual rendering cycle
- **PageObject Pattern**: Clean API for interacting with graph components
- **Coordinate Transformations**: Automatic conversion between world and screen coordinates
- **Full Event Emulation**: Proper mouse event sequences for realistic interactions

## Structure

```
e2e/
├── page-objects/          # Component Object Model classes
│   ├── GraphPageObject.ts                  # Main PageObject with factory methods
│   ├── GraphBlockComponentObject.ts        # COM for individual blocks
│   ├── GraphCameraComponentObject.ts       # COM for camera
│   └── GraphConnectionComponentObject.ts   # COM for connections
├── tests/                 # Test files
│   ├── block/                     # Block-related tests
│   │   ├── block-click.spec.ts        # Block click and selection tests
│   │   └── block-hover.spec.ts        # Block cursor hover tests
│   ├── camera-control.spec.ts     # Camera zoom and pan tests
│   ├── drag-and-drop.spec.ts      # Drag and drop tests
│   └── selection-test.spec.ts     # Selection tests
├── pages/                 # HTML pages for tests
│   └── base.html                  # Minimal base page
├── server.js              # HTTP server for serving test pages
├── tsconfig.json          # TypeScript configuration
└── global.d.ts            # TypeScript type definitions

## Prerequisites

The project will be automatically built before running tests. No manual build step is required.

## Running Tests

### Run all tests (with automatic build)

```bash
npm run e2e:test
```

This will automatically:
1. Build the project (`npm run build`)
2. Start the test server
3. Run all tests
4. Stop the server when done

### Run tests in UI mode (interactive)

```bash
npm run e2e:test:ui
```

### Run tests in debug mode

```bash
npm run e2e:test:debug
```

### Development mode with watch

For active development with auto-rebuild on changes:

```bash
npm run e2e:dev
```

Then in another terminal:

```bash
npx playwright test --ui
```

This will:
- Watch for source file changes and rebuild automatically
- Keep the test server running
- Allow you to run tests multiple times without restarting

### Run specific test file

```bash
npx playwright test block-click
```

## Component Object Model Pattern

Tests use the Component Object Model (COM) pattern to provide a clean, declarative API for interacting with the graph. Each graph entity (block, connection, camera) has its own COM class representing a single instance.

### Benefits

1. **More Declarative** - `block1.click()` instead of `graphPO.blocks.click("block-1")`
2. **Better Encapsulation** - Each COM object represents a specific entity instance
3. **Natural OOP** - Objects have methods and state, not just collections
4. **Easier to Read** - Tests read like user stories
5. **Type Safety** - Each COM has its own strongly-typed API

### Example Usage

```typescript
import { test, expect } from "@playwright/test";
import { GraphPageObject } from "../page-objects/GraphPageObject";

test("should interact with graph elements", async ({ page }) => {
  const graphPO = new GraphPageObject(page);

  // Initialize graph with configuration
  await graphPO.initialize({
    blocks: [
      {
        id: "block-1",
        x: 100,
        y: 100,
        width: 200,
        height: 100,
        name: "Block 1",
        // ... other properties
      },
      {
        id: "block-2",
        x: 400,
        y: 200,
        width: 200,
        height: 100,
        name: "Block 2",
        // ... other properties
      },
    ],
    connections: [],
  });

  // Get Component Object Models for specific blocks
  const block1 = graphPO.getBlockCOM("block-1");
  const block2 = graphPO.getBlockCOM("block-2");

  // Interact with blocks
  await block1.click();
  
  // Check block state
  const isSelected = await block1.isSelected();
  expect(isSelected).toBe(true);

  // Multi-select with modifier key
  await block2.click({ ctrl: true });

  // Get all selected blocks from graph
  const selectedBlocks = await graphPO.getSelectedBlocks();
  expect(selectedBlocks).toHaveLength(2);

  // Drag a block
  await block1.dragTo({ x: 300, y: 300 });

  // Work with camera
  const camera = graphPO.getCamera();
  await camera.zoomToScale(0.5);
  await camera.pan(100, 50);

  // Get connection COM if needed
  const conn = graphPO.getConnectionCOM("connection-1");
  const connExists = await conn.exists();

  // You can also use universal methods directly with world coordinates
  await graphPO.click(500, 300); // Click at world coordinates
  await graphPO.dragTo(100, 100, 200, 200); // Drag from (100,100) to (200,200)
});
```

### Using Universal Methods vs Component Objects

You have two ways to interact with the graph:

**Option 1: Through Component Objects (Recommended for entity interactions)**
```typescript
const block1 = graphPO.getBlockCOM("block-1");
await block1.click(); // COM knows its geometry, delegates to graphPO.click()
await block1.dragTo({ x: 300, y: 300 });
```

**Option 2: Direct Universal Methods (Recommended for arbitrary positions)**
```typescript
// Click at any world coordinates
await graphPO.click(250, 150);

// Drag between any world positions
await graphPO.dragTo(100, 100, 400, 400);

// This is useful for:
// - Clicking on empty canvas areas
// - Testing drag gestures independent of entities
// - Precise coordinate-based testing
```

## Component Object Model API

### GraphPageObject

Main PageObject providing access to graph and factory methods for Component Objects:

**Initialization & Utilities:**
- `initialize(config)` - Initialize graph with configuration
- `waitForFrames(count)` - Wait for N animation frames
- `waitForSchedulerIdle()` - Wait until scheduler has no pending tasks
- `waitForEvent(eventName)` - Wait for specific graph event

**Component Object Factory Methods:**
- `getBlockCOM(blockId)` - Get Component Object Model for a specific block
- `getConnectionCOM(connectionId)` - Get Component Object Model for a specific connection
- `getCamera()` - Get Component Object Model for camera

**Universal Interaction Methods:**
These methods work with world coordinates and handle all coordinate transformations internally. All methods automatically wait for animation frames after the interaction (configurable via `waitFrames` option):
- `click(worldX, worldY, options?)` - Click at world coordinates
  - Options: `shift`, `ctrl`, `meta` (modifiers), `waitFrames` (default: 2)
- `doubleClick(worldX, worldY, options?)` - Double click at world coordinates
  - Options: `waitFrames` (default: 2)
- `hover(worldX, worldY, options?)` - Hover at world coordinates
  - Options: `waitFrames` (default: 1)
- `dragTo(fromWorldX, fromWorldY, toWorldX, toWorldY, options?)` - Drag from one world position to another
  - Options: `waitFrames` (default: 20)

**Graph-level Queries:**
- `getSelectedBlocks()` - Get all selected block IDs
- `getAllConnections()` - Get all connections
- `hasConnectionBetween(sourceId, targetId)` - Check if connection exists between blocks

### GraphBlockComponentObject

Component Object representing a single block instance. Get it via `graphPO.getBlockCOM(blockId)`:

**State & Geometry:**
- `getGeometry()` - Get block position and size in world coordinates
- `getState()` - Get full block state
- `getWorldCenter()` - Get world coordinates of block center
- `isSelected()` - Check if block is selected
- `getId()` - Get block ID

**Interactions:**
All interaction methods delegate to `GraphPageObject` universal methods and support `waitFrames` option:
- `click(options?)` - Click on the block center
  - Options: `shift`, `ctrl`, `meta` (modifiers), `waitFrames` (default: 2)
- `doubleClick(options?)` - Double click on the block center
  - Options: `waitFrames` (default: 2)
- `hover(options?)` - Hover over the block center
  - Options: `waitFrames` (default: 1)
- `dragTo(worldPos, options?)` - Drag block to new world position
  - Options: `waitFrames` (default: 20)

### GraphCameraComponentObject

Component Object representing the camera. Get it via `graphPO.getCamera()`:

**State & Info:**
- `getState()` - Get current camera state (x, y, scale)
- `getCanvasBounds()` - Get canvas bounding box

**Programmatic Control:**
- `zoomToScale(scale)` - Zoom to specific scale
- `pan(dx, dy)` - Pan camera by offset (in screen pixels)
- `zoomToCenter()` - Zoom to center
- `zoomToBlocks(blockIds)` - Zoom to specific blocks

**User Interaction Emulation:**
- `emulateZoom(deltaY, position?)` - Emulate mouse wheel zoom
- `emulatePan(deltaX, deltaY, startPosition?)` - Emulate camera pan with mouse drag
  - Temporarily disables block dragging (`canDrag: "none"`) to prevent accidental block movement
  - Restores original `canDrag` setting after the pan completes

### GraphConnectionComponentObject

Component Object representing a single connection. Get it via `graphPO.getConnectionCOM(connectionId)`:

**State & Info:**
- `getState()` - Get connection state (id, source, target, anchors)
- `exists()` - Check if connection exists
- `isSelected()` - Check if connection is selected
- `getId()` - Get connection ID

## Coordinate Transformation

The library uses two main coordinate spaces:

1. **World Space (Relative)** - Graph coordinates where blocks are positioned
2. **Screen Space (Absolute)** - Pixel coordinates on the canvas element

Coordinate transformations are performed using the camera's built-in methods:

```typescript
// In page.evaluate context:
// World to Screen (relative to absolute)
const [screenX, screenY] = window.graph.cameraService.getAbsoluteXY(
  worldX,
  worldY
);

// Screen to World (absolute to relative)
const [worldX, worldY] = window.graph.cameraService.getRelativeXY(
  screenX,
  screenY
);
```

The Component Object Model handles these transformations internally through `GraphPageObject` universal methods, so you typically don't need to call camera transformation methods directly in tests.

### Architecture

The e2e testing framework uses a clean separation of concerns:

1. **GraphPageObject** - Central orchestrator that:
   - Provides universal interaction methods (`click`, `hover`, `dragTo`)
   - Handles all coordinate transformations (world → screen)
   - Manages mouse interactions and keyboard modifiers
   - Provides graph-level utilities and queries

2. **Component Objects (COM)** - Entity-specific wrappers that:
   - Know about their geometry in world coordinates
   - Provide entity-specific state queries
   - Delegate all interactions to `GraphPageObject` universal methods
   - No direct mouse/keyboard interaction logic

This architecture ensures:
- **No code duplication** - All coordinate transformation logic is in one place
- **Easy extensibility** - New interaction types only need to be added to `GraphPageObject`
- **Testability** - Can click/drag anywhere on the graph, not just on specific entities
- **Maintainability** - Changes to interaction logic only require updates in `GraphPageObject`

## RAF-based Synchronization

The library uses a Scheduler with `requestAnimationFrame` (RAF) for rendering. Tests must wait for animation frames instead of using arbitrary timeouts for reliable synchronization.

### Available Waiting Methods

**`waitForFrames(count)`** - Wait for N animation frames to complete:

```typescript
// Wait for 2 frames after clicking
await graphPO.blocks.click("block-1");
// Click method already waits internally, no manual wait needed

// Manual wait if needed
await graphPO.waitForFrames(2);
```

**`waitForSchedulerIdle()`** - Wait until scheduler has no pending tasks:

```typescript
await graphPO.waitForSchedulerIdle();
```

### Automatic Waiting

All interaction methods in `GraphPageObject` automatically wait for animation frames after the interaction:

- `click()` - Waits 2 frames after click (configurable)
- `doubleClick()` - Waits 2 frames after double click (configurable)
- `hover()` - Waits 1 frame after hover (configurable)
- `dragTo()` - Waits 20 frames after drag (configurable)
- `camera.zoomToScale()` - Waits 3 frames for zoom animation
- `camera.pan()` - Waits 2 frames after pan

You can customize the number of frames to wait:

```typescript
// Use default waiting (2 frames)
await block1.click();

// Wait longer if needed
await block1.click({ waitFrames: 5 });

// No waiting (0 frames)
await graphPO.hover(100, 100, { waitFrames: 0 });

// Custom wait for drag
await block1.dragTo({ x: 300, y: 300 }, { waitFrames: 30 });
```

### Why RAF over Timeouts?

❌ **Don't use timeouts**:
```typescript
// Unreliable - may be too fast or too slow
await page.waitForTimeout(100);
```

✅ **Use RAF-based waiting**:
```typescript
// Reliable - syncs with actual render cycle
await graphPO.waitForFrames(2);
```

Benefits:
- **Reliable**: Tests wait for actual rendering, not arbitrary time
- **Fast**: No unnecessary delays
- **Deterministic**: Tests behave consistently across different machines

## Writing New Tests

1. Create a new test file in `e2e/tests/`
2. Import `GraphPageObject` or `ReactGraphPageObject`
3. Initialize graph in `beforeEach` hook
4. Use PageObject methods to interact with graph
5. Use Playwright's `expect` for assertions

## Debugging Tests

### Visual Debugging

Use UI mode to see tests running in real-time:

```bash
npm run e2e:test:ui
```

### Debug Mode

Run with debugging enabled:

```bash
npm run e2e:test:debug
```

### Screenshots

Failed tests automatically capture screenshots in `test-results/`

### Videos

Configure video recording in `playwright.config.ts`

## Best Practices

1. **Use PageObjects** - Never interact with page directly in tests
2. **Wait for Updates** - Use `page.waitForTimeout()` after actions that trigger updates
3. **Coordinate Transformations** - Always use world coordinates for positioning
4. **Clean State** - Each test should initialize its own graph configuration
5. **Descriptive Names** - Use clear test and variable names

