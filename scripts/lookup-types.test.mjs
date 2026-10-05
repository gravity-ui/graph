import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("strict public consumer fixtures check source APIs as well as packed declarations", () => {
  const fixtures = [
    "tests/package-contract/fixtures/apps/vanilla/app.ts",
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
      "@gravity-ui/graph": [path.join(root, "packages/graph/src/index.ts")],
      "@gravity-ui/graph-react": [path.join(root, "packages/graph-react/src/index.ts")],
    },
  });
  // Production source debt is checked separately by the exact strict diagnostic gate.
  // Here the same positive/negative consumer fixtures must accept the source entrypoints.
  const errors = ts.getPreEmitDiagnostics(program).filter((diagnostic) =>
    diagnostic.category === ts.DiagnosticCategory.Error &&
    (!diagnostic.file || fixtures.includes(diagnostic.file.fileName))
  );
  assert.deepEqual(errors.map((error) => ts.flattenDiagnosticMessageText(error.messageText, "\n")), []);
});
