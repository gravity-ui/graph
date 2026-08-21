import assert from "node:assert/strict";
import { copyFile, mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const buildRoot = resolve(repositoryRoot, "build");
const internalRoots = new Set(
  (await readdir(resolve(repositoryRoot, "src"), { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && entry.name !== "stories")
    .map((entry) => entry.name)
);

await mkdir(resolve(buildRoot, "utils/types"), { recursive: true });
await copyFile(resolve(repositoryRoot, "src/utils/types/global.d.ts"), resolve(buildRoot, "utils/types/global.d.ts"));

async function declarationFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((entry) => {
        const file = resolve(directory, entry.name);
        return entry.isDirectory()
          ? declarationFiles(file)
          : Promise.resolve(entry.name.endsWith(".d.ts") ? [file] : []);
      })
    )
  ).flat();
}

function relativeSpecifier(fromFile, absoluteTarget) {
  let specifier = relative(dirname(fromFile), absoluteTarget).split(sep).join("/");
  if (!specifier.startsWith(".")) {
    specifier = `./${specifier}`;
  }
  return specifier;
}

function isModuleSpecifier(node) {
  const parent = node.parent;
  return (
    (ts.isImportDeclaration(parent) && parent.moduleSpecifier === node) ||
    (ts.isExportDeclaration(parent) && parent.moduleSpecifier === node) ||
    (ts.isExternalModuleReference(parent) && parent.expression === node) ||
    (ts.isLiteralTypeNode(parent) && ts.isImportTypeNode(parent.parent)) ||
    (ts.isCallExpression(parent) &&
      parent.arguments.includes(node) &&
      parent.expression.kind === ts.SyntaxKind.ImportKeyword)
  );
}

function internalBareSpecifier(node) {
  if (!ts.isStringLiteralLike(node) || !isModuleSpecifier(node)) {
    return false;
  }
  const [root, ...rest] = node.text.split("/");
  return internalRoots.has(root) && rest.length > 0;
}

function rewriteInternalSpecifiers(declarationFile, declaration, rewrittenTargets) {
  const source = ts.createSourceFile(declarationFile, declaration, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const replacements = [];

  function visit(node) {
    if (internalBareSpecifier(node)) {
      const [root, ...rest] = node.text.split("/");
      const target = resolve(buildRoot, root, ...rest);
      replacements.push({
        start: node.getStart(source) + 1,
        end: node.getEnd() - 1,
        text: relativeSpecifier(declarationFile, target),
      });
      rewrittenTargets.push({ declarationFile, specifier: node.text, target });
    }
    ts.forEachChild(node, visit);
  }
  visit(source);

  return replacements
    .sort((left, right) => right.start - left.start)
    .reduce(
      (result, replacement) =>
        `${result.slice(0, replacement.start)}${replacement.text}${result.slice(replacement.end)}`,
      declaration
    );
}

async function declarationTargetExists(target) {
  const candidates = target.endsWith(".js")
    ? [target.slice(0, -3) + ".d.ts"]
    : target.endsWith(".d.ts")
      ? [target]
      : [`${target}.d.ts`, resolve(target, "index.d.ts")];
  for (const candidate of candidates) {
    try {
      if ((await stat(candidate)).isFile()) {
        return true;
      }
    } catch {
      // Try the next TypeScript declaration resolution candidate.
    }
  }
  return false;
}

async function validateDeclarationTargetResolver() {
  const fixture = await mkdtemp(resolve(tmpdir(), "graph-declaration-target-"));
  try {
    const directoryTarget = resolve(fixture, "directory-target");
    await mkdir(directoryTarget);
    assert.equal(await declarationTargetExists(directoryTarget), false);
    await writeFile(resolve(directoryTarget, "index.d.ts"), "export {};\n");
    assert.equal(await declarationTargetExists(directoryTarget), true);

    const fileTarget = resolve(fixture, "file-target");
    await writeFile(`${fileTarget}.d.ts`, "export {};\n");
    assert.equal(await declarationTargetExists(fileTarget), true);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
}

await validateDeclarationTargetResolver();

const files = await declarationFiles(buildRoot);
const rewrittenTargets = [];
for (const declarationFile of files) {
  const declaration = rewriteInternalSpecifiers(
    declarationFile,
    await readFile(declarationFile, "utf8"),
    rewrittenTargets
  );
  await writeFile(declarationFile, declaration);
}

const missingTargets = [];
for (const { declarationFile, specifier, target } of rewrittenTargets) {
  if (!(await declarationTargetExists(target))) {
    missingTargets.push(`${relative(buildRoot, declarationFile)}: ${specifier}`);
  }
}
assert.deepEqual(
  missingTargets,
  [],
  `Rewritten declaration imports have no emitted target:\n${missingTargets.join("\n")}`
);

for (const entryPoint of [resolve(buildRoot, "index.d.ts"), resolve(buildRoot, "react-components/index.d.ts")]) {
  const globalTypes = relativeSpecifier(entryPoint, resolve(buildRoot, "utils/types/global.d.ts"));
  const declaration = await readFile(entryPoint, "utf8");
  const reference = `/// <reference path="${globalTypes}" />`;
  const withoutReference = declaration
    .split(/\r?\n/)
    .filter((line) => line !== reference)
    .join("\n");
  await writeFile(entryPoint, `${reference}\n${withoutReference}`);
}

const unresolved = [];
for (const declarationFile of files) {
  const source = ts.createSourceFile(
    declarationFile,
    await readFile(declarationFile, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
  function visit(node) {
    if (internalBareSpecifier(node)) {
      unresolved.push(`${relative(buildRoot, declarationFile)}: ${node.text}`);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
}
assert.deepEqual(unresolved, [], `Unresolved internal declaration imports:\n${unresolved.join("\n")}`);
