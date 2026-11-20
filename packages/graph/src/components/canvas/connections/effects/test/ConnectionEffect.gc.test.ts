/** @jest-environment node */
import { setFlagsFromString } from "node:v8";
import { runInNewContext } from "node:vm";

import { defineSceneEffect } from "../../../../../lib/scene/effects/defineSceneEffect";

setFlagsFromString("--expose-gc");
// The flag exposes `gc` only to contexts created afterwards; the vm result is that native function.
const collectGarbage = runInNewContext("gc") as () => void;

const FRAGMENT = "vec4 effect(PathFragment f, vec4 color) { return color; }";

/** Collects the dropped objects and lets the finalization callbacks run. */
async function collect(): Promise<void> {
  for (let i = 0; i < 3; i += 1) {
    // Leave the current job: objects stay alive until it ends.
    await new Promise((resolve) => setTimeout(resolve, 0));
    collectGarbage();
  }
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("connection effect objects per fragment", () => {
  let warn: jest.SpyInstance;

  beforeEach(() => {
    warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    warn.mockRestore();
  });

  it("counts the objects alive at once: graphs that clone an effect per mount do not warn", async () => {
    const effect = defineSceneEffect({ kind: "path", fragment: `${FRAGMENT} // a clone per mount` });
    // Each mount creates 63 clones plus the shared effect, right at the warning threshold.
    Array.from({ length: 63 }, () => effect.clone());
    await collect();

    const alive = Array.from({ length: 63 }, () => effect.clone());
    expect(warn).not.toHaveBeenCalled();

    alive.push(effect.clone());
    expect(alive).toHaveLength(64);
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
