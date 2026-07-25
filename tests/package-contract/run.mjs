import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, readdir, rm, cp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { build as bundle } from "esbuild";
import ts from "typescript";

const fixtureRoot = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(fixtureRoot, "../..");
const baselinePath = join(fixtureRoot, "public-api.json");
const update = process.argv.includes("--update");
const artifactOnly = process.argv.includes("--artifact-only");
const temporaryRoot = await mkdtemp(join(tmpdir(), "gravity-graph-package-contract-"));
const npmCache = join(temporaryRoot, "npm-cache");
const internalRoots = new Set(
  (await readdir(join(repositoryRoot, "src"), { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && entry.name !== "stories")
    .map((entry) => entry.name)
);

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      npm_config_cache: npmCache,
      npm_config_audit: "false",
      npm_config_fetch_retries: "0",
      npm_config_fetch_timeout: "10000",
      npm_config_fund: "false",
      npm_config_update_notifier: "false",
    },
    ...options,
  });

  if (result.status !== 0) {
    process.stderr.write(result.stdout ?? "");
    process.stderr.write(result.stderr ?? "");
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}`);
  }

  return result.stdout.trim();
}

function normalizeDeclaration(text) {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+$/gm, "")
    .trim();
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

async function assertNoInternalBareSpecifiers(declarationRoot) {
  const declarationFiles = [];

  async function collect(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        await collect(path);
      } else if (entry.name.endsWith(".d.ts")) {
        declarationFiles.push(path);
      }
    }
  }
  await collect(declarationRoot);

  const unresolved = [];
  for (const declarationFile of declarationFiles) {
    const declaration = await readFile(declarationFile, "utf8");
    const source = ts.createSourceFile(declarationFile, declaration, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    function visit(node) {
      if (ts.isStringLiteralLike(node) && isModuleSpecifier(node)) {
        const [root, ...rest] = node.text.split("/");
        if (internalRoots.has(root) && rest.length > 0) {
          unresolved.push(`${declarationFile}: ${node.text}`);
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }

  assert.deepEqual(
    unresolved,
    [],
    `Packed declarations contain internal bare module aliases:\n${unresolved.join("\n")}`
  );
}

function assertPackageDeclarationDiagnostics(entryPoints) {
  const program = ts.createProgram(entryPoints, {
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    target: ts.ScriptTarget.ES2020,
    skipLibCheck: false,
    types: [],
  });
  const packageDiagnostics = ts
    .getPreEmitDiagnostics(program)
    .filter(
      (diagnostic) =>
        !diagnostic.file || !resolve(diagnostic.file.fileName).startsWith(resolve(repositoryRoot, "node_modules"))
    );
  assert.equal(
    packageDiagnostics.length,
    0,
    packageDiagnostics.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")).join("\n")
  );
}

function snapshotEntryPoint(declarationFile) {
  const program = ts.createProgram([declarationFile], {
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    target: ts.ScriptTarget.ES2020,
    skipLibCheck: true,
    types: [],
  });
  const diagnostics = ts.getPreEmitDiagnostics(program);
  assert.equal(
    diagnostics.length,
    0,
    diagnostics.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")).join("\n")
  );

  const source = program.getSourceFile(declarationFile);
  assert(source, `Missing declaration source ${declarationFile}`);
  const moduleSymbol = program.getTypeChecker().getSymbolAtLocation(source);
  assert(moduleSymbol, `Missing module symbol for ${declarationFile}`);

  return program
    .getTypeChecker()
    .getExportsOfModule(moduleSymbol)
    .map((symbol) => {
      const target = symbol.flags & ts.SymbolFlags.Alias ? program.getTypeChecker().getAliasedSymbol(symbol) : symbol;
      const declarations = target.getDeclarations() ?? symbol.getDeclarations() ?? [];

      return {
        name: symbol.getName(),
        declarations: declarations
          .map((declaration) => ({
            kind: ts.SyntaxKind[declaration.kind],
            text: normalizeDeclaration(declaration.getText()),
          }))
          .sort((left, right) => `${left.kind}\n${left.text}`.localeCompare(`${right.kind}\n${right.text}`)),
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}

async function installConsumer(name, tarball, dependencies, fixture) {
  const consumerRoot = join(temporaryRoot, name);
  await mkdir(consumerRoot, { recursive: true });
  await cp(join(fixtureRoot, "fixtures", fixture), join(consumerRoot, "index.ts"));
  if (fixture.endsWith(".tsx")) {
    await rm(join(consumerRoot, "index.ts"));
    await cp(join(fixtureRoot, "fixtures", fixture), join(consumerRoot, "index.tsx"));
  }
  await cp(join(fixtureRoot, "fixtures", "tsconfig.json"), join(consumerRoot, "tsconfig.json"));
  await writeFile(
    join(consumerRoot, "package.json"),
    `${JSON.stringify({ name: `package-contract-${name}`, private: true }, null, 2)}\n`
  );

  run("npm", ["install", "--ignore-scripts", "--no-package-lock", "--save-exact", tarball, ...dependencies], {
    cwd: consumerRoot,
  });

  run(process.execPath, [join(repositoryRoot, "node_modules", "typescript", "bin", "tsc"), "-p", "tsconfig.json"], {
    cwd: consumerRoot,
  });

  const bundleResult = await bundle({
    absWorkingDir: consumerRoot,
    entryPoints: [join(consumerRoot, fixture.endsWith(".tsx") ? "index.tsx" : "index.ts")],
    bundle: true,
    format: "esm",
    platform: "browser",
    write: false,
    logLevel: "silent",
  });
  const javascript = bundleResult.outputFiles.find((output) => output.path.endsWith(".js"));
  assert(javascript, `${name} did not produce a JavaScript runtime bundle`);
  await import(`data:text/javascript;base64,${Buffer.from(javascript.contents).toString("base64")}`);
}

try {
  run("npm", ["run", "build:publish"]);
  const packOutput = JSON.parse(
    run("npm", ["pack", "--json", "--ignore-scripts", "--pack-destination", temporaryRoot])
  );
  assert.equal(packOutput.length, 1, "npm pack must produce exactly one tarball");
  const tarball = join(temporaryRoot, packOutput[0].filename);
  const packedFiles = new Set(packOutput[0].files.map(({ path }) => path));
  const unpackedRoot = join(temporaryRoot, "unpacked");
  await mkdir(unpackedRoot);
  run("tar", ["-xzf", tarball, "-C", unpackedRoot]);
  await assertNoInternalBareSpecifiers(join(unpackedRoot, "package", "build"));

  const contract = JSON.parse(await readFile(join(fixtureRoot, "contract.json"), "utf8"));
  const packageJson = JSON.parse(await readFile(join(repositoryRoot, "package.json"), "utf8"));
  assert.deepEqual(packageJson.exports, contract.exports, "Published export map changed");
  assert.deepEqual(packageJson.typesVersions, contract.typesVersions, "typesVersions changed");

  for (const [entryPoint, declaration] of Object.entries(contract.entryPoints)) {
    assert(packedFiles.has(declaration), `${entryPoint} declaration is missing: ${declaration}`);
    const runtime = packageJson.exports[entryPoint].default.replace(/^\.\//, "");
    assert(packedFiles.has(runtime), `${entryPoint} runtime is missing: ${runtime}`);
  }
  for (const style of contract.styles) {
    assert(packedFiles.has(style), `Required published style is missing: ${style}`);
  }
  assertPackageDeclarationDiagnostics(
    Object.values(contract.entryPoints).map((declaration) => join(repositoryRoot, declaration))
  );

  const publicApi = Object.fromEntries(
    Object.entries(contract.entryPoints).map(([entryPoint, declaration]) => [
      entryPoint,
      snapshotEntryPoint(join(repositoryRoot, declaration)),
    ])
  );
  const serializedApi = `${JSON.stringify(publicApi, null, 2)}\n`;
  if (update) {
    await writeFile(baselinePath, serializedApi);
  } else {
    assert.equal(
      serializedApi,
      await readFile(baselinePath, "utf8"),
      "Public API changed. Review it and run with --update only for an approved v1 contract change."
    );
  }

  if (artifactOnly) {
    process.stdout.write("Packed artifact and public API baseline checks passed.\n");
    process.exitCode = 0;
  } else {
    await installConsumer("vanilla", tarball, ["react@18.3.1", "react-dom@18.3.1"], "vanilla/index.ts");
    await installConsumer(
      "react-17",
      tarball,
      ["react@17.0.2", "react-dom@17.0.2", "@types/react@17.0.90", "@types/react-dom@17.0.26"],
      "react/index.tsx"
    );
    await installConsumer(
      "react-18",
      tarball,
      ["react@18.3.1", "react-dom@18.3.1", "@types/react@18.3.28", "@types/react-dom@18.3.7"],
      "react/index.tsx"
    );

    process.stdout.write(
      `Package contract passed: ${packOutput[0].filename}, ${packedFiles.size} packed files, React 17/18 consumers.\n`
    );
  }
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
