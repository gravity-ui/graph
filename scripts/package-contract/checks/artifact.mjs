import assert from "node:assert/strict";
import { access, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { run } from "../utils.mjs";

const privateSchedulerPackage = "@gravity-ui/graph-scheduler";

const allowedPackageRootFiles = ["LICENSE", "README.md", "package.json"];
const baseAllowedPatterns = [/^build\/.+\.d\.(?:ts|cts)$/, /^build\/chunks\/[^/]+\.js$/];
const entryFiles = ["build/index.js", "build/index.d.ts"];
const stylesExport = "./styles.css";
const forbiddenPackedPathPatterns = [
  /(?:^|\/)(?:src|story|stories|__tests__)(?:\/|$)/i,
  /^contract(?:\/|$)/,
  /(?:^|\/)[^/]*\.(?:test|spec|story|stories)\.[^/]+$/i,
  /(?:^|\/)(?:tsconfig(?:\.[^/]+)?\.json|jest\.[^/]+|eslint\.[^/]+|prettier\.[^/]+)$/i,
  /(?:^|\/)(?:pnpm-lock\.yaml|package-lock\.json|yarn\.lock)$/i,
];

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

// Every file named by the expected `exports` map must be packed and nothing else may be shipped unless the
// contract allows it, so a package without `./styles.css` in its exports must not pack a stylesheet.
function collectExportTargets(value) {
  if (typeof value === "string") return value.includes("*") ? [] : [value.replace(/^\.\//, "")];
  if (value && typeof value === "object") return Object.values(value).flatMap(collectExportTargets);
  return [];
}

function getPublicFiles(contract) {
  return [...new Set([...entryFiles, ...collectExportTargets(contract.exports)])];
}

function getRequiredFiles(contract) {
  return [...allowedPackageRootFiles, ...getPublicFiles(contract), ...(contract.packedFiles?.requiredFiles ?? [])];
}

function getStylesheetPath(contract) {
  const target = contract.exports?.[stylesExport];
  return typeof target === "string" ? target.replace(/^\.\//, "") : undefined;
}

export const staleBuildSentinelName = "package-contract-stale-sentinel.txt";

function getPackMetadata(output) {
  const metadata = JSON.parse(output);

  return Array.isArray(metadata) ? metadata[0] : metadata;
}

function assertPackedFiles(metadata, contract) {
  const packed = contract.packedFiles ?? {};
  const allowedFiles = new Set([
    ...allowedPackageRootFiles,
    ...getPublicFiles(contract),
    ...(packed.runtimeFiles ?? []),
  ]);
  const allowedPatterns = [...baseAllowedPatterns, ...(packed.allowedPatterns ?? [])];
  const forbiddenPatterns = [...forbiddenPackedPathPatterns, ...(packed.forbiddenPatterns ?? [])];

  assert.equal(metadata.name, contract.packageName);
  assert.ok(Array.isArray(metadata.files), "pnpm pack did not report the packed file list.");

  const packedFiles = metadata.files.map(({ path: packedPath }) => packedPath).sort();
  const unexpectedFiles = packedFiles.filter(
    (packedPath) => !allowedFiles.has(packedPath) && !allowedPatterns.some((pattern) => pattern.test(packedPath))
  );
  const forbiddenFiles = packedFiles.filter((packedPath) =>
    forbiddenPatterns.some((pattern) => pattern.test(packedPath))
  );

  assert.deepEqual(unexpectedFiles, [], `Tarball contains files outside the public allowlist: ${unexpectedFiles}`);
  assert.deepEqual(forbiddenFiles, [], `Tarball contains repository-only artifacts: ${forbiddenFiles}`);

  for (const requiredFile of getRequiredFiles(contract)) {
    assert.ok(packedFiles.includes(requiredFile), `Tarball is missing required file ${requiredFile}.`);
  }
}

export async function assertPathDoesNotExist(targetPath, message) {
  try {
    await access(targetPath);
  } catch (error) {
    if (error?.code === "ENOENT") {
      return;
    }
    throw error;
  }

  assert.fail(message);
}

export async function collectGeneratedContractFiles(directory) {
  const generatedFiles = [];

  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      generatedFiles.push(...(await collectGeneratedContractFiles(entryPath)));
    } else if ([".js", ".cjs", ".d.ts", ".d.cts"].some((suffix) => entry.name.endsWith(suffix))) {
      generatedFiles.push(entryPath);
    }
  }

  return generatedFiles;
}

async function assertNoPrivateSchedulerSpecifiers(packageRoot) {
  const buildDirectory = path.join(packageRoot, "build");

  for (const generatedFile of await collectGeneratedContractFiles(buildDirectory)) {
    const contents = await readFile(generatedFile, "utf8");

    assert.equal(
      contents.includes(privateSchedulerPackage),
      false,
      `Generated artifact ${path.relative(packageRoot, generatedFile)} references ${privateSchedulerPackage}.`
    );
  }
}

export async function buildPackage(contract) {
  console.log(`\n[package-contract] Building ${contract.packageName}...`);
  const sentinelPath = path.join(contract.packageRoot, "build", staleBuildSentinelName);
  await mkdir(path.dirname(sentinelPath), { recursive: true });
  await writeFile(sentinelPath, "The production build must remove this stale artifact.\n");
  await run("pnpm", ["run", "build"], { cwd: contract.packageRoot });
  await assertPathDoesNotExist(sentinelPath, `The ${contract.packageName} build did not clean its output directory.`);
  await assertNoPrivateSchedulerSpecifiers(contract.packageRoot);
}

export async function buildAndPackArtifact(contract, tarballPath) {
  await buildPackage(contract);

  console.log(`\n[package-contract] Packing ${contract.packageName} and checking the tarball allowlist...`);
  const packMetadata = getPackMetadata(
    await run("pnpm", ["pack", "--out", tarballPath, "--json"], {
      cwd: contract.packageRoot,
      printStdout: false,
    })
  );
  assertPackedFiles(packMetadata, contract);

  console.log(`\n[package-contract] Linting the packed ${contract.packageName} metadata...`);
  await run("pnpm", ["exec", "publint", tarballPath, "--strict"], { cwd: contract.packageRoot });
}

export async function checkInstalledArtifact({
  consumerDirectory,
  contract,
  expectedVersion,
  coreContract,
  workspace,
}) {
  const isCore = contract.packageName === coreContract.packageName;
  const installedRoot = path.join(consumerDirectory, "node_modules", ...contract.packageName.split("/"));
  const manifest = JSON.parse(await readFile(path.join(installedRoot, "package.json"), "utf8"));

  assert.equal(manifest.name, contract.packageName);
  assert.equal(manifest.version, expectedVersion, "The installed package version does not match the tested artifact.");
  assert.notEqual(manifest.private, true);
  assert.equal(manifest.type, "module");
  assert.equal(manifest.main.replace(/^\.\//, ""), "build/index.js");
  assert.equal(manifest.module.replace(/^\.\//, ""), "build/index.js");
  assert.equal(manifest.types.replace(/^\.\//, ""), "build/index.d.ts");
  assert.deepEqual(manifest.files, ["build"]);
  assert.deepEqual(manifest.exports, contract.exports);
  assert.deepEqual(manifest.typesVersions, contract.typesVersions);

  if (!isCore) {
    const coreManifest = JSON.parse(
      await readFile(
        path.join(consumerDirectory, "node_modules", ...coreContract.packageName.split("/"), "package.json"),
        "utf8"
      )
    );
    assert.equal(manifest.peerDependencies?.[coreContract.packageName], `^${coreManifest.version}`);
    assert.equal(manifest.peerDependenciesMeta?.[coreContract.packageName]?.optional, undefined);
    assert.equal(manifest.dependencies?.[coreContract.packageName], undefined);
  }

  for (const dependencyField of ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]) {
    assert.equal(
      manifest[dependencyField]?.[privateSchedulerPackage],
      undefined,
      `Packed manifest exposes ${privateSchedulerPackage} through ${dependencyField}.`
    );
  }

  for (const bundledDependencyField of ["bundledDependencies", "bundleDependencies"]) {
    const bundledDependencies = manifest[bundledDependencyField];

    assert.equal(
      Array.isArray(bundledDependencies) && bundledDependencies.includes(privateSchedulerPackage),
      false,
      `Packed manifest bundles the private package through ${bundledDependencyField}.`
    );
  }

  await Promise.all(
    getRequiredFiles(contract)
      .filter((relativePath) => relativePath !== "package.json")
      .map((relativePath) => access(path.join(installedRoot, relativePath)))
  );

  await assertPathDoesNotExist(
    path.join(consumerDirectory, "node_modules", ...privateSchedulerPackage.split("/")),
    `The isolated consumer installed the private package ${privateSchedulerPackage}.`
  );
  await assertNoPrivateSchedulerSpecifiers(installedRoot);

  const generatedFiles = await collectGeneratedContractFiles(path.join(installedRoot, "build"));
  if (!isCore) {
    // Only module specifiers count: other strings may legitimately start with the core package name.
    const deepCoreImport = new RegExp(
      `(?:\\bfrom\\s*|\\bimport\\s*\\(?\\s*|\\brequire\\s*\\(\\s*)["']${escapeRegExp(coreContract.packageName)}/`
    );
    for (const file of generatedFiles) {
      assert.doesNotMatch(
        await readFile(file, "utf8"),
        deepCoreImport,
        `Artifact ${file} must reference only the public core entrypoint.`
      );
    }
  }

  const stylesheetPath = getStylesheetPath(contract);
  await contract.checkArtifact?.({
    manifest,
    installedRoot,
    styles: stylesheetPath ? await readFile(path.join(installedRoot, stylesheetPath), "utf8") : undefined,
    generatedFiles,
    readText: (relativePath) => readFile(path.join(installedRoot, relativePath), "utf8"),
    assertMissing: (relativePath, message) => assertPathDoesNotExist(path.join(installedRoot, relativePath), message),
    otherWorkspacePackages: workspace.filter((name) => name !== contract.packageName),
  });
}
