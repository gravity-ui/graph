import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { test } from "node:test";
import { assertNativeResult } from "./check-native-configs.mjs";

test("native CLI errors, signals and launch failures cannot pass compatibility checks", () => {
  assert.doesNotThrow(() => assertNativeResult({ status: 0, stdout: "", stderr: "" }, "fixture"));
  for (const result of [
    { status: 1, stdout: "TS5108: removed option" },
    { status: 1, stdout: "TS2882: CSS import" },
    { status: null, signal: "SIGTERM" },
    { status: 0, error: new Error("spawn failed") },
    { status: 0, stdout: "error TS2307: unresolved import" },
    { status: 0, stdout: "malformed compiler output" },
    { status: 0, stderr: "compiler error" },
  ]) {
    assert.throws(() => assertNativeResult(result, "fixture"));
  }
});

test("configuration helpers can be imported from stdin without running their CLI", () => {
  const script = `import ${JSON.stringify(new URL("./check-native-configs.mjs", import.meta.url).href)};`;
  const result = spawnSync(process.execPath, ["--input-type=module", "-"], { input: script, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "");
});
