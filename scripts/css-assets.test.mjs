import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import ts from "typescript";
import { validateCssImports, validateStyleEntry } from "./css-assets.mjs";

test("wildcard declarations cannot hide missing static or dynamic CSS imports", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "graph-css-"));
  try {
    await writeFile(path.join(root, "tsconfig.json"), JSON.stringify({ files: ["index.ts", "assets.d.ts"] }));
    await writeFile(path.join(root, "assets.d.ts"), 'declare module "*.css";');
    await writeFile(path.join(root, "real.css"), "body {}");
    for (const source of [
      'import "./missing.css";',
      'import("./missing.css");',
      "import(`./missing.css`);",
      'import("./missing.css", {with: {type: "css"}});',
      'export {} from "./missing.css";',
    ]) {
      await writeFile(path.join(root, "index.ts"), source);
      const program = ts.createProgram([path.join(root, "index.ts"), path.join(root, "assets.d.ts")], {
        noEmit: true,
        noUncheckedSideEffectImports: true,
        types: [],
        target: ts.ScriptTarget.ES2020,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
      });
      assert.deepEqual(ts.getPreEmitDiagnostics(program), []);
      await assert.rejects(validateCssImports(path.join(root, "tsconfig.json")), /missing.css/);
    }
    await writeFile(path.join(root, "index.ts"), 'import "./real.css"; const example = `import "./missing.css";`;');
    await validateCssImports(path.join(root, "tsconfig.json"));
    await mkdir(path.join(root, "directory.css"));
    await writeFile(path.join(root, "index.ts"), 'import "./directory.css";');
    await assert.rejects(validateCssImports(path.join(root, "tsconfig.json")), /regular file/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("public styles must point to the built file and packages without styles cannot advertise it", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "graph-style-entry-"));
  try {
    const manifest = { exports: { "./styles.css": "./build/styles.css" } };
    await assert.rejects(validateStyleEntry(root, manifest, true), /styles.css/);
    await mkdir(path.join(root, "build"));
    await writeFile(path.join(root, "build/styles.css"), "body {}");
    await validateStyleEntry(root, manifest, true);
    await assert.rejects(validateStyleEntry(root, { exports: { "./styles.css": "./build/wrong.css" } }, true), /entry/);
    await assert.rejects(validateStyleEntry(root, manifest, false), /entry/);
    await validateStyleEntry(root, { exports: {} }, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
