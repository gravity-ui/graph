import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import ts from "typescript";

const root = fileURLToPath(new URL("../", import.meta.url));

test("devtools source and publish configs permanently enable strict", () => {
  for (const config of ["tsconfig.json", "tsconfig.publish.json"]) {
    const configPath = path.join(root, "packages/graph-devtools", config);
    const parsed = ts.getParsedCommandLineOfConfigFile(
      configPath,
      {},
      {
        ...ts.sys,
        onUnRecoverableConfigFileDiagnostic: (diagnostic) =>
          assert.fail(ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")),
      }
    );
    assert.equal(parsed?.options.strict, true, config);
    assert.equal(parsed?.options.skipLibCheck, false, config);
  }
});

for (const strict of [true, false]) {
  test(`devtools consumer compiles against source with strict=${strict}`, () => {
    const configPath = path.join(root, "tests/package-contract/fixtures/types/devtools-node-esm/tsconfig.json");
    const parsed = ts.getParsedCommandLineOfConfigFile(
      configPath,
      {
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        strict,
        paths: { "@gravity-ui/graph-devtools": [path.join(root, "packages/graph-devtools/src/index.ts")] },
      },
      {
        ...ts.sys,
        onUnRecoverableConfigFileDiagnostic: (diagnostic) =>
          assert.fail(ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")),
      }
    );
    assert.ok(parsed);
    const program = ts.createProgram(
      [...parsed.fileNames, path.join(root, "packages/graph-devtools/src/assets.d.ts")],
      parsed.options
    );
    const diagnostics = [...parsed.errors, ...ts.getPreEmitDiagnostics(program)];
    assert.equal(
      diagnostics.length,
      0,
      ts.formatDiagnosticsWithColorAndContext(diagnostics, {
        getCanonicalFileName: (file) => file,
        getCurrentDirectory: () => root,
        getNewLine: () => "\n",
      })
    );
  });
}
