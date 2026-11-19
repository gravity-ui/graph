import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { build } from "esbuild";

const repo = new URL("../../", import.meta.url);
const scratch = await mkdtemp(join(tmpdir(), "etl-camera-motion-"));
const outfile = join(scratch, "motion.cjs");
let motion;
try {
  await build({
    stdin: {
      contents: `export { startEtlCameraMotion } from "./apps/storybook/src/stories/canvas/sceneEffects/etlCameraMotion";
        export { schedule, ESchedulerPriority } from "@gravity-ui/graph";`,
      resolveDir: fileURLToPath(repo),
    },
    alias: { "@gravity-ui/graph": fileURLToPath(new URL("packages/graph/src/index.ts", repo)) },
    loader: { ".css": "empty" },
    outfile,
    bundle: true,
    format: "cjs",
    platform: "node",
  });
  motion = (await import(pathToFileURL(outfile))).default;
} finally {
  await rm(scratch, { recursive: true, force: true });
}

test("ETL camera motion waits for sizing and restarts or cancels cleanly", (t) => {
  const { startEtlCameraMotion, schedule, ESchedulerPriority } = motion;
  const pending = new Map();
  let now = 0;
  t.mock.method(performance, "now", () => now);
  let nextId = 0;
  globalThis.window = {
    requestAnimationFrame(callback) {
      pending.set(++nextId, callback);
      return nextId;
    },
    cancelAnimationFrame(id) {
      pending.delete(id);
    },
  };
  t.after(() => {
    delete globalThis.window;
  });

  function frame(time) {
    assert.equal(pending.size, 1);
    const [id, callback] = pending.entries().next().value;
    pending.delete(id);
    now = time;
    callback(time);
  }

  const state = { x: -300, y: 95, scale: 0.15, width: 0, height: 0 };
  const camera = {
    getCameraState: () => state,
    set: (patch) => Object.assign(state, patch),
  };
  const block = (x, y, pipeline) => ({ x, y, width: 100, height: 80, pipeline });
  const data = {
    blocks: [block(0, 0, "left"), block(940, 500, "center"), block(1100, 660, "center"), block(2000, 1200, "right")],
    pipelines: ["left", "center", "right"],
  };

  function close(actual, expected) {
    assert(Math.abs(actual - expected) < 1e-9, `${actual} should be close to ${expected}`);
  }

  let paintedX;
  const stopRender = schedule(
    () => {
      paintedX = state.x;
    },
    { priority: ESchedulerPriority.MEDIUM, frameInterval: 1 }
  );
  let cancel = startEtlCameraMotion(camera, data, "pan");
  frame(1_000);
  assert.deepEqual(state, { x: -300, y: 95, scale: 0.15, width: 0, height: 0 });
  Object.assign(state, { width: 1_300, height: 800 });
  frame(2_000);
  assert.deepEqual(state, { x: -300, y: 95, scale: 0.15, width: 1_300, height: 800 });
  frame(6_000);
  close(state.x, -60);
  close(paintedX, -60);
  close(state.y, -145);
  frame(18_000);
  close(state.x, -300);
  close(state.y, 95);
  close(state.scale, 0.15);
  cancel();
  stopRender();
  assert.equal(pending.size, 0);

  Object.assign(state, { x: 220, y: -40, scale: 0.4 });
  cancel = startEtlCameraMotion(camera, data, "pan");
  frame(38_000);
  assert.deepEqual(state, { x: 220, y: -40, scale: 0.4, width: 1_300, height: 800 });
  cancel();
  assert.equal(pending.size, 0);

  cancel = startEtlCameraMotion(camera, data, "zoom");
  for (const [time, scale] of [
    [40_000, 0.05],
    [45_000, Math.sqrt(0.05 * 0.9)],
    [50_000, 0.9],
    [60_000, 0.05],
  ]) {
    frame(time);
    close(state.scale, scale);
    close(1_070 * scale + state.x, 650);
    close(620 * scale + state.y, 400);
  }
  cancel();
  assert.equal(pending.size, 0);

  cancel = startEtlCameraMotion(
    {
      ...camera,
      set: () => {
        throw new Error("failed camera");
      },
    },
    data,
    "pan"
  );
  assert.throws(() => frame(70_000), /failed camera/);
  assert.equal(pending.size, 0);
  cancel();
});
