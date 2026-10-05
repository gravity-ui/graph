import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

for (const built of [false, true]) {
  test(`strict public consumer fixtures check ${built ? "declarations" : "source APIs"}`, () => {
    const fixtures = [
      "tests/package-contract/fixtures/apps/vanilla/app.ts",
      "tests/package-contract/fixtures/apps/vanilla/scheduling.ts",
      "tests/package-contract/fixtures/apps/react/app.tsx",
    ].map((file) => path.join(root, file));
    const configPath = path.join(root, "packages/graph-react/tsconfig.json");
    const config = ts.readConfigFile(configPath, ts.sys.readFile);
    assert.equal(config.error, undefined);
    const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, path.dirname(configPath));
    assert.deepEqual(parsed.errors, []);
    const program = ts.createProgram([
      ...fixtures,
      path.join(root, "packages/graph/src/assets.d.ts"),
      path.join(root, "packages/graph-react/src/assets.d.ts"),
    ], {
      ...parsed.options, strict: true, noEmit: true, skipLibCheck: false,
      typeRoots: [path.join(root, "packages/graph-react/node_modules/@types"), path.join(root, "node_modules/@types")],
      paths: {
        "react": [path.join(root, "packages/graph-react/node_modules/@types/react/index.d.ts")],
        "react-dom/*": [path.join(root, "packages/graph-react/node_modules/@types/react-dom/*")],
        "@gravity-ui/graph": [path.join(root, built ? "packages/graph/build/index.d.ts" : "packages/graph/src/index.ts")],
        "@gravity-ui/graph-react": [path.join(root, built ? "packages/graph-react/build/index.d.ts" : "packages/graph-react/src/index.ts")],
      },
    });
    // Production source debt is checked separately by the exact strict diagnostic gate.
    // Positive consumer examples must compile; negative examples use expect-error directives to require rejection.
    // If an invalid access becomes accepted (for example through any), TypeScript reports an unused directive.
    // The same fixtures are also compiled against packed declarations by the package-contract harness.
    const errors = ts.getPreEmitDiagnostics(program).filter((diagnostic) =>
      diagnostic.category === ts.DiagnosticCategory.Error &&
      (!diagnostic.file || fixtures.includes(diagnostic.file.fileName))
    );
    assert.deepEqual(errors.map((error) => ts.flattenDiagnosticMessageText(error.messageText, "\n")), []);
  });
}

for (const strict of [true, false]) {
  for (const built of [false, true]) {
    test(`public factories and scheduling helpers preserve validated arguments (${strict ? "strict" : "non-strict"}, ${built ? "declarations" : "source"})`, () => {
      const fixtures = ["component-factories.ts", "scheduling.ts"].map((file) =>
        path.join(root, "tests/package-contract/fixtures/apps/vanilla", file)
      );
      const program = ts.createProgram(fixtures, {
        strict, noEmit: true, skipLibCheck: true,
        target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        paths: { "@gravity-ui/graph": [path.join(root, built ? "packages/graph/build/index.d.ts" : "packages/graph/src/index.ts")] },
      });
      const errors = ts.getPreEmitDiagnostics(program).filter((error) =>
        error.category === ts.DiagnosticCategory.Error && (!error.file || fixtures.includes(error.file.fileName))
      );
      assert.deepEqual(errors.map((error) => ts.flattenDiagnosticMessageText(error.messageText, "\n")), []);
    });
  }
}
