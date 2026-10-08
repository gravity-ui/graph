import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const runner = fileURLToPath(new URL("./tsc-projects.mjs", import.meta.url));
const run = (...args) => spawnSync(process.execPath, [runner, ...args], { encoding: "utf8", timeout: 120_000 });

for (const compiler of ["classic", "native"]) {
  test(`${compiler} compiler: passing projects succeed and diagnostics fail the run`, () => {
    const directory = mkdtempSync(path.join(tmpdir(), "tsc-projects-"));
    try {
      writeFileSync(
        path.join(directory, "tsconfig.json"),
        JSON.stringify({ compilerOptions: { strict: true, types: [] }, files: ["index.ts"] })
      );
      writeFileSync(path.join(directory, "index.ts"), "export const value: number = 1;\n");
      const passed = run(`--compiler=${compiler}`, directory);
      assert.equal(passed.status, 0, passed.stderr);
      assert.match(passed.stdout, /^Using Version \d+\.\d+\.\d+ \(typescript@/);
      assert.match(passed.stdout, /All 1 projects passed/);

      writeFileSync(path.join(directory, "index.ts"), "export const value: number = 'text';\n");
      const failed = run(`--compiler=${compiler}`, directory);
      assert.equal(failed.status, 1);
      assert.match(failed.stderr, /TS2322/);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
}

test("compiler selection is explicit and validated", () => {
  assert.equal(run("tests/types").status, 1);
  assert.match(run("--compiler=unknown", "tests/types").stderr, /Unknown compiler/);
});
