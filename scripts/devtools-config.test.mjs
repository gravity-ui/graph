import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const packageRoot = fileURLToPath(new URL("../packages/graph-devtools/", import.meta.url));

// Reads compiler options through a relative "extends" chain without the compiler API.
function readCompilerOptions(configPath) {
  const config = JSON.parse(readFileSync(configPath, "utf8"));
  const inherited = config.extends
    ? readCompilerOptions(path.resolve(path.dirname(configPath), `${config.extends.replace(/\.json$/, "")}.json`))
    : {};
  return { ...inherited, ...config.compilerOptions };
}

test("devtools source and publish configs permanently enable strict", () => {
  for (const config of ["tsconfig.json", "tsconfig.publish.json"]) {
    const options = readCompilerOptions(path.join(packageRoot, config));
    assert.equal(options.strict, true, config);
    assert.equal(options.skipLibCheck, false, config);
  }
});
