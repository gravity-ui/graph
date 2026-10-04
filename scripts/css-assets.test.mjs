import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { validateStyleEntry } from "./css-assets.mjs";
import { buildPackage } from "./build-package.mjs";

test("package build rejects missing CSS imports even with wildcard declarations", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "graph-css-build-"));
  try {
    await mkdir(path.join(root, "src"));
    await writeFile(path.join(root, "package.json"), JSON.stringify({ name: "css-build-fixture", exports: {} }));
    await writeFile(path.join(root, "tsconfig.json"), JSON.stringify({ include: ["src/**/*.ts"] }));
    await writeFile(path.join(root, "src/assets.d.ts"), 'declare module "*.css";');
    for (const source of ['import "./missing.css";', 'import("./missing.css");', "import(`./missing.css`);"]) {
      await writeFile(path.join(root, "src/index.ts"), source);
      await assert.rejects(buildPackage({ packageRoot: root, styles: false }), (error) => {
        assert.ok(error.errors.some((diagnostic) => diagnostic.text.includes('Could not resolve "./missing.css"')));
        return true;
      });
    }
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
