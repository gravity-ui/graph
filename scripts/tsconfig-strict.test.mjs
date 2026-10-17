import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const tsc = createRequire(import.meta.url).resolve("typescript/bin/tsc");

// --showConfig resolves the whole extends chain (including arrays and comments) with the workspace compiler.
function effectiveCompilerOptions(config) {
  const result = spawnSync(process.execPath, [tsc, "-p", path.join(root, config), "--showConfig"], {
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout).compilerOptions;
}

// `pnpm run typecheck` skips projects without a typecheck script and uses each tsconfig's own strict setting.
test("every project typechecks its permanently strict tsconfig", () => {
  for (const project of [
    "packages/graph",
    "packages/graph-react",
    "packages/graph-minimap",
    "packages/graph-devtools",
    "apps/storybook",
    "apps/e2e",
  ]) {
    const { scripts } = JSON.parse(readFileSync(path.join(root, project, "package.json"), "utf8"));
    assert.match(scripts.typecheck, /^tsc -p tsconfig\.json( --noEmit)?$/, project);
    assert.equal(effectiveCompilerOptions(`${project}/tsconfig.json`).strict, true, project);
  }
});

test("devtools source and publish configs permanently enable strict", () => {
  for (const config of ["tsconfig.json", "tsconfig.publish.json"]) {
    const options = effectiveCompilerOptions(`packages/graph-devtools/${config}`);
    assert.equal(options.strict, true, config);
    assert.equal(options.skipLibCheck, false, config);
  }
});
