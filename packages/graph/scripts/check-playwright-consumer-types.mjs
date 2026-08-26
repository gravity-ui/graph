import path from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturePath = path.join(
  rootDir,
  "tests",
  "package-contract",
  "playwright-installed-consumer",
  "fixture",
  "public-types.ts"
);
const buildDir = `${path.join(rootDir, "build")}${path.sep}`;

// The v1 build uses skipLibCheck, so it can emit declarations that work inside
// this repository but fail for consumers (for example, baseUrl-only imports or
// ambient globals that are not emitted). Check the public Playwright entry
// against build/ with skipLibCheck disabled. Keep this focused guard until v2
// replaces the declaration pipeline.
const program = ts.createProgram([fixturePath], {
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  noEmit: true,
  skipLibCheck: false,
  strict: true,
  target: ts.ScriptTarget.ES2020,
});

const diagnostics = ts.getPreEmitDiagnostics(program).filter((diagnostic) => {
  if (!diagnostic.file) {
    return true;
  }

  const fileName = path.resolve(diagnostic.file.fileName);
  return fileName === fixturePath || fileName.startsWith(buildDir);
});

if (diagnostics.length > 0) {
  process.stderr.write(
    ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCanonicalFileName: (fileName) => fileName,
      getCurrentDirectory: () => rootDir,
      getNewLine: () => "\n",
    })
  );
  process.exitCode = 1;
}
