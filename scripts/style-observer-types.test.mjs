import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";

test("MultiWeakMap signatures in the dependency patch match its runtime operations", async () => {
  const requireGraph = createRequire(new URL("../packages/graph/package.json", import.meta.url));
  const root = path.dirname(requireGraph.resolve("style-observer"));
  const { default: MultiWeakMap } = await import(pathToFileURL(path.join(root, "src/util/MultiWeakMap.js")));
  const map = new MultiWeakMap();
  const key = {};
  assert.equal(map.has(key), false);
  map.add(key, "first");
  map.add(key, "second");
  assert.equal(map.has(key), true);
  assert.equal(map.has(key, "first"), true);
  assert.equal(map.has(key, "missing"), false);
  assert.equal(map.delete(key, "first"), undefined);
  assert.equal(map.has(key), true);
  assert.equal(map.has(key, "first"), false);
  assert.equal(map.delete(key, "second"), undefined);
  assert.equal(map.has(key), false);
});
