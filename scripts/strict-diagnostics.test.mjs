import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  compareDiagnostics,
  decodeCompilerResult,
  validateSnapshot,
  PROJECTS,
  COMPILER,
  EVENT_CONTRACT_FILES,
  COMPONENT_CONTRACT_FILES,
} from "./strict-diagnostics.mjs";

const diagnostic = {
  project: PROJECTS[0],
  file: "packages/graph/src/lib/Tree.ts",
  code: 2564,
  message: "Property 'parent' has no initializer.",
  count: 1,
};
const snapshot = (diagnostics = []) => ({ schemaVersion: 1, compiler: COMPILER, projects: PROJECTS, diagnostics });

test("allows decreases but rejects new identities and increased occurrence counts", () => {
  assert.deepEqual(compareDiagnostics(snapshot([]), snapshot([diagnostic])), []);
  assert.equal(compareDiagnostics(snapshot([{ ...diagnostic, count: 2 }]), snapshot([diagnostic])).length, 1);
  for (const change of [{ file: "other.ts" }, { project: PROJECTS[1] }, { code: 2322 }, { message: "different" }]) {
    assert.equal(compareDiagnostics(snapshot([{ ...diagnostic, ...change }]), snapshot([diagnostic])).length, 1);
  }
});

test("diagnostic identity has no source position and retains complete messages", () => {
  assert.deepEqual(compareDiagnostics(snapshot([diagnostic]), snapshot([diagnostic])), []);
  assert.equal(
    compareDiagnostics(
      snapshot([{ ...diagnostic, message: diagnostic.message + "\n  Detail" }]),
      snapshot([diagnostic])
    ).length,
    1
  );
});

test("Scheduler errors cannot be admitted even by a baseline", () => {
  const debt = { ...diagnostic, file: "packages/graph/src/lib/Scheduler/Scheduler.test.ts" };
  assert.throws(() => validateSnapshot(snapshot([debt])), /Scheduler/);
});

test("Resolved configuration errors cannot be admitted even by a baseline", () => {
  for (const file of [
    "packages/graph/src/graphConfig.ts",
    "packages/graph/src/store/settings.ts",
    "packages/graph/src/graphEvents.ts",
    "packages/graph/src/utils/functions/mergeDefined.ts",
  ]) {
    assert.throws(() => validateSnapshot(snapshot([{ ...diagnostic, file }])), /configuration/);
  }
});

test("Layer lifecycle and Block initialization/null errors cannot be admitted by a baseline", () => {
  for (const file of ["packages/graph/src/services/Layer.ts", "packages/graph/src/services/LayersService.ts"]) {
    assert.throws(() => validateSnapshot(snapshot([{ ...diagnostic, file }])), /Layer lifecycle/);
  }
  for (const code of [2564, 2532, 18047, 18048]) {
    assert.throws(
      () =>
        validateSnapshot(
          snapshot([
            {
              ...diagnostic,
              code,
              file: "packages/graph/src/components/canvas/blocks/Block.ts",
            },
          ])
        ),
      /Block lifecycle/
    );
  }
});

test("rejects malformed baseline metadata and duplicate diagnostic identities", () => {
  for (const invalid of [
    null,
    { ...snapshot(), compiler: "other" },
    { ...snapshot(), projects: [] },
    snapshot([{ ...diagnostic, count: 0 }]),
    snapshot([{ ...diagnostic, message: null }]),
    snapshot([diagnostic, diagnostic]),
  ]) {
    assert.throws(() => validateSnapshot(invalid));
  }
});

test("compiler result must be successful, parseable and from the requested project", () => {
  const output = JSON.stringify(snapshot([diagnostic]));
  assert.deepEqual(decodeCompilerResult({ status: 0, stdout: output, stderr: "" }, PROJECTS[0]), [diagnostic]);
  for (const result of [
    { status: 1, stdout: output },
    { status: null, signal: "SIGTERM", stdout: output },
    { status: 0, stdout: "" },
    { status: 0, stdout: "{}" },
    { status: 0, stdout: output, error: new Error("spawn failed") },
  ]) {
    assert.throws(() => decodeCompilerResult(result, PROJECTS[0]));
  }
  assert.throws(() => decodeCompilerResult({ status: 0, stdout: output }, PROJECTS[1]), /project/);
});

test("CLI baseline is reproducible across line shifts and rejects regressions/config failures", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "strict-gate-"));
  try {
    mkdirSync(path.join(directory, "scripts"), { recursive: true });
    mkdirSync(path.join(directory, "node_modules"));
    mkdirSync(path.join(directory, "docs/audits"), { recursive: true });
    copyFileSync(
      fileURLToPath(new URL("./strict-diagnostics.mjs", import.meta.url)),
      path.join(directory, "scripts/strict-diagnostics.mjs")
    );
    symlinkSync(
      realpathSync(fileURLToPath(new URL("../node_modules/typescript", import.meta.url))),
      path.join(directory, "node_modules/typescript")
    );
    mkdirSync(path.join(directory, "node_modules/untyped"));
    writeFileSync(path.join(directory, "node_modules/untyped/package.json"), '{"name":"untyped","main":"index.js"}');
    writeFileSync(path.join(directory, "node_modules/untyped/index.js"), "module.exports = 1;");
    for (const project of PROJECTS) {
      const projectRoot = path.join(directory, path.dirname(project));
      mkdirSync(projectRoot, { recursive: true });
      writeFileSync(
        path.join(directory, project),
        JSON.stringify({
          compilerOptions: { types: [], skipLibCheck: true, moduleResolution: "node" },
          files: ["source.ts"],
        })
      );
      writeFileSync(
        path.join(projectRoot, "source.ts"),
        "import value from 'untyped';\nexport const text: string = null;\n"
      );
    }
    const run = (...args) =>
      spawnSync(process.execPath, [path.join(directory, "scripts/strict-diagnostics.mjs"), ...args], {
        encoding: "utf8",
        timeout: 120_000,
      });
    assert.equal(run("--write-baseline").status, 0);
    const baselineFile = path.join(directory, "docs/audits/strict-typescript-baseline.json");
    const baseline = readFileSync(baselineFile, "utf8");
    writeFileSync(
      path.join(directory, "packages/graph/source.ts"),
      "\n\nimport value from 'untyped';\nexport const text: string = null;\n"
    );
    assert.equal(run("--write-baseline").status, 0);
    assert.equal(readFileSync(baselineFile, "utf8"), baseline);
    assert.equal(run().status, 0);
    const relocated = path.join(directory, "relocated");
    mkdirSync(relocated);
    for (const entry of ["scripts", "packages", "apps", "docs", "node_modules"]) {
      cpSync(path.join(directory, entry), path.join(relocated, entry), { recursive: true });
    }
    const relocatedResult = spawnSync(process.execPath, [path.join(relocated, "scripts/strict-diagnostics.mjs")], {
      encoding: "utf8",
      timeout: 120_000,
    });
    assert.equal(relocatedResult.status, 0, relocatedResult.stderr);

    writeFileSync(
      path.join(directory, "packages/graph/source.ts"),
      "export const value: string = null;\nexport const other: string = null;\n"
    );
    const regression = run();
    assert.equal(regression.status, 1);
    assert.match(regression.stderr, /increased strict diagnostics/);
    writeFileSync(path.join(directory, PROJECTS[0]), "{ malformed");
    const failure = run();
    assert.equal(failure.status, 1);
    assert.match(failure.stderr, /compiler process failed/);
    assert.equal(readFileSync(baselineFile, "utf8"), baseline);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("nullable lookup contracts reject diagnostics even in a baseline", () => {
  for (const file of [
    "packages/graph/src/api/PublicGraphApi.ts",
    "packages/graph-react/src/hooks/useBlockState.ts",
    "packages/graph-react/src/hooks/useBlockAnchorState.ts",
  ]) {
    const value = {
      schemaVersion: 1,
      compiler: COMPILER,
      projects: PROJECTS,
      diagnostics: [{ project: PROJECTS[0], file, code: 2322, message: "new debt", count: 1 }],
    };
    assert.throws(() => validateSnapshot(value), /Nullable lookups must have zero/);
  }
});

test("completed event contracts cannot be added to a baseline", () => {
  for (const file of EVENT_CONTRACT_FILES) {
    assert.throws(() => validateSnapshot(snapshot([{ ...diagnostic, file }])), /Event contracts/);
  }
  for (const file of ["packages/graph/src/graph.ts", "packages/graph/src/components/canvas/blocks/Block.ts"]) {
    assert.throws(() => validateSnapshot(snapshot([{ ...diagnostic, file, code: 2345 }])), /Event contracts/);
  }
});

test("completed component contracts cannot be added to a baseline", () => {
  for (const file of COMPONENT_CONTRACT_FILES) {
    assert.throws(() => validateSnapshot(snapshot([{ ...diagnostic, file }])), /Component contracts/);
  }
});
