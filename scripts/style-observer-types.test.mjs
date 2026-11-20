import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { test } from "node:test";
import ts from "typescript";

test("MultiWeakMap signatures in the dependency patch match its runtime operations", async () => {
  const requirePackage = createRequire(new URL("../packages/graph-css-variables/package.json", import.meta.url));
  const root = path.dirname(requirePackage.resolve("style-observer"));
  const { default: MultiWeakMap } = await import(pathToFileURL(path.join(root, "src/util/MultiWeakMap.js")).href);
  /** @type {import("../packages/graph-css-variables/node_modules/style-observer/types/src/util/MultiWeakMap.js").default} */
  const map = new MultiWeakMap();
  const key = {};
  /** @type {boolean} */
  const initiallyPresent = map.has(key);
  assert.equal(initiallyPresent, false);
  map.add(key, "first");
  map.add(key, "second");
  assert.equal(map.has(key), true);
  /** @type {boolean} */
  const hasFirst = map.has(key, "first");
  assert.equal(hasFirst, true);
  assert.equal(map.has(key, "missing"), false);
  /** @type {void} */
  const removed = map.delete(key, "first");
  assert.equal(removed, undefined);
  assert.equal(map.has(key), true);
  assert.equal(map.has(key, "first"), false);
  assert.equal(map.delete(key, "second"), undefined);
  assert.equal(map.has(key), false);
});

test("the patched declarations accept the same consumer calls", () => {
  const program = ts.createProgram([fileURLToPath(import.meta.url)], {
    allowJs: true,
    checkJs: true,
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.NodeNext,
    types: ["node"],
  });
  const errors = ts.getPreEmitDiagnostics(program);
  assert.deepEqual(
    errors.map((error) => ts.flattenDiagnosticMessageText(error.messageText, "\n")),
    []
  );
});
