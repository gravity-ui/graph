import { copyFile, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
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
  const nested = await Promise.all(
    entries.map((entry) => {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        return declarationFiles(path);
      }
      return entry.name.endsWith(".d.ts") ? [path] : [];
    })
  );
  return nested.flat();
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

function rewriteInternalModuleSpecifiers(declarationFile, declaration) {
  const source = ts.createSourceFile(declarationFile, declaration, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const replacements = [];

  function visit(node) {
    if (ts.isStringLiteralLike(node) && isModuleSpecifier(node)) {
      const [root, ...rest] = node.text.split("/");
      if (internalRoots.has(root) && rest.length > 0) {
        const target = resolve(buildRoot, root, ...rest);
        replacements.push({
          start: node.getStart(source) + 1,
          end: node.getEnd() - 1,
          text: relativeSpecifier(declarationFile, target),
        });
      }
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

for (const declarationFile of await declarationFiles(buildRoot)) {
  const declaration = rewriteInternalModuleSpecifiers(declarationFile, await readFile(declarationFile, "utf8"));
  await writeFile(declarationFile, declaration);
}

for (const entryPoint of [resolve(buildRoot, "index.d.ts"), resolve(buildRoot, "react-components/index.d.ts")]) {
  const globalTypes = relativeSpecifier(entryPoint, resolve(buildRoot, "utils/types/global.d.ts"));
  const declaration = await readFile(entryPoint, "utf8");
  await writeFile(entryPoint, `/// <reference path="${globalTypes}" />\n${declaration}`);
}
