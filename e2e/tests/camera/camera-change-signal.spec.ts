import { test, expect } from "@playwright/test";

import { GraphPageObject } from "../../page-objects/GraphPageObject";

test.describe("camera-change event and $camera signal", () => {
  let graphPO: GraphPageObject;

  test.beforeEach(async ({ page }) => {
    graphPO = new GraphPageObject(page);
    await graphPO.initialize({
      blocks: [
        {
          id: "block-1",
          is: "Block",
          x: 100,
          y: 100,
          width: 200,
          height: 100,
          name: "Block 1",
          anchors: [],
          selected: false,
        },
      ],
      connections: [],
      settings: {
        canDragCamera: true,
        canZoomCamera: true,
      },
    });
  });

  test("preventDefault on camera-change skips committed state and $camera update", async ({ page }) => {
    await page.evaluate(() => {
      window.graph.on("camera-change", (event: Event) => {
        event.preventDefault();
      });
    });

    const camera = graphPO.getCamera();
    const initial = await camera.getState();
    const initialSignal = await graphPO.getCameraSignalSnapshot();

    await camera.pan(120, 80);

    const final = await camera.getState();
    const finalSignal = await graphPO.getCameraSignalSnapshot();

    expect(final.x).toBe(initial.x);
    expect(final.y).toBe(initial.y);
    expect(final.scale).toBe(initial.scale);
    expect(finalSignal.x).toBe(initialSignal.x);
    expect(finalSignal.y).toBe(initialSignal.y);
    expect(finalSignal.scale).toBe(initialSignal.scale);
  });

  test("successful camera move updates $camera after commit", async ({ page }) => {
    const readSignalUpdates = await graphPO.collectCameraSignalUpdates();

    const camera = graphPO.getCamera();
    const before = await camera.getState();
    const n0 = (await readSignalUpdates()).length;

    await camera.pan(100, 50);
    await graphPO.waitForFrames(2);

    const after = await camera.getState();
    const updates = (await readSignalUpdates()).slice(n0);

    expect(after.x).not.toBe(before.x);
    expect(after.y).not.toBe(before.y);
    expect(updates.length).toBeGreaterThan(0);

    const last = updates[updates.length - 1];
    expect(last.x).toBe(after.x);
    expect(last.y).toBe(after.y);
    expect(last.scale).toBe(after.scale);
  });

  test("during camera-change event, $camera still holds previous committed state", async ({ page }) => {
    await page.evaluate(() => {
      const log: Array<{
        phase: "event" | "signal";
        detailX?: number;
        signalX: number;
        serviceX: number;
      }> = [];
      (window as unknown as { __cameraCommitLog: typeof log }).__cameraCommitLog = log;

      window.graph.on("camera-change", (event: CustomEvent<{ x: number }>) => {
        log.push({
          phase: "event",
          detailX: event.detail.x,
          signalX: window.graph.$camera.value.x,
          serviceX: window.graph.cameraService.getCameraState().x,
        });
      });

      window.graph.$camera.subscribe((state) => {
        log.push({
          phase: "signal",
          signalX: state.x,
          serviceX: window.graph.cameraService.getCameraState().x,
        });
      });
    });

    const camera = graphPO.getCamera();
    const before = await camera.getState();

    await camera.pan(100, 0);
    await graphPO.waitForFrames(2);

    const after = await camera.getState();
    const log = await page.evaluate(
      () => (window as unknown as { __cameraCommitLog: Array<{ phase: string; detailX?: number; signalX: number; serviceX: number }> }).__cameraCommitLog
    );

    expect(after.x).not.toBe(before.x);

    const eventEntries = log.filter((e) => e.phase === "event");
    const signalEntries = log.filter((e) => e.phase === "signal");

    expect(eventEntries.length).toBeGreaterThan(0);
    expect(signalEntries.length).toBeGreaterThan(0);

    const lastEvent = eventEntries[eventEntries.length - 1];
    const lastSignal = signalEntries[signalEntries.length - 1];

    // In the event handler, proposed x is in detail but committed stores are unchanged
    expect(lastEvent.detailX).not.toBe(before.x);
    expect(lastEvent.signalX).toBe(before.x);
    expect(lastEvent.serviceX).toBe(before.x);

    // Signal subscriber runs after commit with the new x
    expect(lastSignal.signalX).toBe(after.x);
    expect(lastSignal.serviceX).toBe(after.x);
  });

  test("collectGraphEventDetails receives proposed state even when change is prevented", async ({ page }) => {
    await page.evaluate(() => {
      window.graph.on("camera-change", (event: Event) => {
        event.preventDefault();
      });
    });

    const readEvents = await graphPO.collectGraphEventDetails<{ scale: number; x: number; y: number }>("camera-change");
    const n0 = (await readEvents()).length;

    const camera = graphPO.getCamera();
    const before = await camera.getState();

    await camera.pan(80, 40);

    const events = (await readEvents()).slice(n0);
    expect(events.length).toBeGreaterThan(0);

    const last = events[events.length - 1];
    expect(last.x).not.toBe(before.x);
    expect(last.y).not.toBe(before.y);

    const committed = await camera.getState();
    expect(committed.x).toBe(before.x);
    expect(committed.y).toBe(before.y);
  });
});
