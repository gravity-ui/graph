import { stat } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import ts from "typescript";

async function requireFile(file) {
  if (!(await stat(file)).isFile()) throw new Error(`CSS asset is not a regular file: ${file}`);
}

export async function validateCssImports(configPath) {
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, "\n"));
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, path.dirname(configPath), {}, configPath);
  if (parsed.errors.length)
    throw new Error(parsed.errors.map((error) => ts.flattenDiagnosticMessageText(error.messageText, "\n")).join("\n"));
  for (const file of parsed.fileNames) {
    const contents = ts.sys.readFile(file);
    if (contents === undefined) throw new Error(`Cannot read CSS import source: ${file}`);
    const source = ts.createSourceFile(file, contents, ts.ScriptTarget.Latest, true);
    const imports = [];
    const visit = (node) => {
      if (
        (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
        node.moduleSpecifier &&
        ts.isStringLiteral(node.moduleSpecifier)
      )
        imports.push(node.moduleSpecifier.text);
      if (
        ts.isCallExpression(node) &&
        node.expression.kind === ts.SyntaxKind.ImportKeyword &&
        node.arguments.length >= 1 &&
        ts.isStringLiteralLike(node.arguments[0])
      )
        imports.push(node.arguments[0].text);
      ts.forEachChild(node, visit);
    };
    visit(source);
    for (const specifier of imports.filter((value) => value.endsWith(".css"))) {
      try {
        const resolved = specifier.startsWith(".")
          ? path.resolve(path.dirname(file), specifier)
          : createRequire(file).resolve(specifier);
        await requireFile(resolved);
      } catch (error) {
        throw new Error(`Invalid CSS import ${JSON.stringify(specifier)} in ${file}: ${error.message}`);
      }
    }
  }
}

export async function validateStyleEntry(packageRoot, manifest, styles) {
  const entry = manifest.exports?.["./styles.css"];
  if (styles ? entry !== "./build/styles.css" : entry !== undefined)
    throw new Error(`Invalid public styles.css entry for ${manifest.name ?? packageRoot}`);
  if (styles) await requireFile(path.join(packageRoot, entry));
}
