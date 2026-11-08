import { setFlagsFromString } from "node:v8";
import { runInNewContext } from "node:vm";

import { defineConnectionEffect } from "./ConnectionEffect";

setFlagsFromString("--expose-gc");
// The flag exposes `gc` only to contexts created afterwards; the vm result is that native function.
const collectGarbage = runInNewContext("gc") as () => void;

const FRAGMENT = "vec4 effect(ConnectionFragment f, vec4 color) { return color; }";

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
    const effect = defineConnectionEffect({ fragment: `${FRAGMENT} // a clone per mount` });
    // 120 clones over three mounts, at most 41 objects alive at once.
    for (let mount = 0; mount < 3; mount += 1) {
      for (let i = 0; i < 40; i += 1) effect.clone();
      await collect();
    }
    expect(warn).not.toHaveBeenCalled();

    // More than 64 alive at once still warn.
    const alive = Array.from({ length: 70 }, () => effect.clone());
    expect(alive).toHaveLength(70);
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
