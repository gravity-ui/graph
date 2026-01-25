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
├── page-objects/          # PageObject classes for interacting with graph
│   ├── GraphPageObject.ts         # Base PageObject for Canvas graph
│   ├── ReactGraphPageObject.ts    # PageObject for React version
│   ├── BlockPageObject.ts         # Block interactions
│   ├── CameraPageObject.ts        # Camera controls
│   └── ConnectionPageObject.ts    # Connection operations
├── utils/                 # Utility classes
│   └── CoordinateTransformer.ts   # World ↔ Screen coordinate transformations
├── tests/                 # Test files
│   ├── block-click.spec.ts        # Block click and selection tests
│   ├── camera-control.spec.ts     # Camera zoom and pan tests
│   └── drag-and-drop.spec.ts      # Drag and drop tests
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

## PageObject Pattern

Tests use the PageObject pattern to provide a clean API for interacting with the graph.

### Example Usage

```typescript
import { test, expect } from "@playwright/test";
import { GraphPageObject } from "../page-objects/GraphPageObject";

test("should select block on click", async ({ page }) => {
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
        // ... other properties
      },
    ],
    connections: [],
  });

  // Interact with blocks
  await graphPO.blocks.click("block-1");

  // Verify selection
  const selectedBlocks = await graphPO.blocks.getSelected();
  expect(selectedBlocks).toContain("block-1");
});
```

## PageObject API

### GraphPageObject

Main PageObject providing access to all graph functionality:

- `initialize(config)` - Initialize graph with configuration
- `waitForReady()` - Wait for graph to be ready
- `camera` - Access to CameraPageObject
- `blocks` - Access to BlockPageObject
- `connections` - Access to ConnectionPageObject
- `event(type, xy)` - Trigger mouse event at coordinates
- `waitForEvent(eventName)` - Wait for specific graph event

### BlockPageObject

Methods for interacting with blocks:

- `getGeometry(blockId)` - Get block position and size
- `getScreenCenter(blockId)` - Get screen coordinates of block center
- `click(blockId)` - Click on block
- `doubleClick(blockId)` - Double click on block
- `dragTo(blockId, worldPos)` - Drag block to new world position
- `isSelected(blockId)` - Check if block is selected
- `getSelected()` - Get all selected block IDs

### CameraPageObject

Methods for camera control:

- `getState()` - Get current camera state (x, y, scale)
- `zoomToScale(scale)` - Zoom to specific scale
- `pan(dx, dy)` - Pan camera by offset
- `zoomToCenter()` - Zoom to center
- `zoomToBlocks(blockIds)` - Zoom to specific blocks
- `getCanvasBounds()` - Get canvas bounding box

### ConnectionPageObject

Methods for working with connections:

- `getAll()` - Get all connections
- `getById(connectionId)` - Get connection by ID
- `existsBetween(sourceId, targetId)` - Check if connection exists
- `getCount()` - Get number of connections

## Coordinate Transformation

The library uses three coordinate spaces:

1. **World Space** - Graph coordinates where blocks are positioned
2. **Camera Space** - Coordinates accounting for camera scale
3. **Screen Space** - Pixel coordinates on the canvas element

The `CoordinateTransformer` utility handles transformations:

```typescript
import { CoordinateTransformer } from "../utils/CoordinateTransformer";

// World to Screen
const screenPos = CoordinateTransformer.worldToScreen(
  { x: 100, y: 100 },
  cameraState
);

// Screen to World
const worldPos = CoordinateTransformer.screenToWorld(screenPos, cameraState);
```

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

PageObject methods automatically wait for frames where appropriate:

- `blocks.click()` - Waits 2 frames after click
- `blocks.dragTo()` - Waits between drag phases
- `camera.zoomToScale()` - Waits 3 frames for zoom animation
- `camera.pan()` - Waits 2 frames after pan

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

// Screen to World
const worldPos = CoordinateTransformer.screenToWorld(
  { x: 500, y: 300 },
  cameraState
);
```

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

## CI/CD Integration

Tests can be integrated into CI/CD pipelines. See `playwright.config.ts` for CI-specific configuration.

Example GitHub Actions workflow:

```yaml
- name: Install dependencies
  run: npm ci

- name: Install Playwright
  run: npx playwright install --with-deps chromium

- name: Build project
  run: npm run build

- name: Run E2E tests
  run: npm run e2e:test

- name: Upload test results
  if: failure()
  uses: actions/upload-artifact@v3
  with:
    name: playwright-report
    path: playwright-report/
```
