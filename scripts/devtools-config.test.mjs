import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const packageRoot = fileURLToPath(new URL("../packages/graph-devtools/", import.meta.url));
const tsc = createRequire(import.meta.url).resolve("typescript/bin/tsc");

// --showConfig resolves the whole extends chain (including arrays and comments) with the workspace compiler.
function effectiveCompilerOptions(config) {
  const result = spawnSync(process.execPath, [tsc, "-p", path.join(packageRoot, config), "--showConfig"], {
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout).compilerOptions;
}

test("devtools source and publish configs permanently enable strict", () => {
  for (const config of ["tsconfig.json", "tsconfig.publish.json"]) {
    const options = effectiveCompilerOptions(config);
    assert.equal(options.strict, true, config);
    assert.equal(options.skipLibCheck, false, config);
  }
});
