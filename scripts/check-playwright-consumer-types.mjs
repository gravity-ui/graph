import path from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturePath = path.join(rootDir, "e2e", "type-tests", "playwright-consumer.ts");
const buildDir = `${path.join(rootDir, "build")}${path.sep}`;

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
