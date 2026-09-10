import assert from "node:assert/strict";
import { access, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { run } from "../utils.mjs";

const privateSchedulerPackage = "@gravity-ui/graph-scheduler";

const expectedExports = {
  ".": {
    types: "./build/index.d.ts",
    import: "./build/index.js",
    default: "./build/index.js",
  },
  "./playwright": {
    import: {
      types: "./build/playwright/index.d.ts",
      default: "./build/playwright/index.js",
    },
    require: {
      types: "./build/playwright/index.d.cts",
      default: "./build/playwright/index.cjs",
    },
    default: "./build/playwright/index.js",
  },
  "./styles.css": "./build/styles.css",
};

const expectedTypesVersions = {
  "*": {
    playwright: ["build/playwright/index.d.ts"],
  },
};

const allowedPackageRootFiles = new Set(["LICENSE", "README.md", "package.json"]);
const allowedRuntimeFiles = new Set([
  "build/index.js",
  "build/playwright/index.js",
  "build/playwright/index.cjs",
  "build/playwright/index.d.cts",
  "build/styles.css",
]);
const forbiddenPackedPathPatterns = [
  /(?:^|\/)(?:src|story|stories|__tests__)(?:\/|$)/i,
  /(?:^|\/)[^/]*\.(?:test|spec|story|stories)\.[^/]+$/i,
  /(?:^|\/)(?:tsconfig(?:\.[^/]+)?\.json|jest\.[^/]+|eslint\.[^/]+|prettier\.[^/]+)$/i,
  /(?:^|\/)(?:pnpm-lock\.yaml|package-lock\.json|yarn\.lock)$/i,
];

function getPackMetadata(output) {
  const metadata = JSON.parse(output);

  return Array.isArray(metadata) ? metadata[0] : metadata;
}

function assertPackedFiles(metadata, react) {
  assert.equal(metadata.name, react ? "@gravity-ui/graph-react" : "@gravity-ui/graph");
  assert.ok(Array.isArray(metadata.files), "pnpm pack did not report the packed file list.");

  const packedFiles = metadata.files.map(({ path: packedPath }) => packedPath).sort();
  const unexpectedFiles = packedFiles.filter((packedPath) => {
    if (allowedPackageRootFiles.has(packedPath) || allowedRuntimeFiles.has(packedPath)) {
      return false;
    }

    return (
      !/^build\/.+\.d\.(?:ts|cts)$/.test(packedPath) &&
      !/^build\/chunks\/[^/]+\.js$/.test(packedPath) &&
      !/^build\/docs\/.+\.md$/.test(packedPath)
    );
  });
  const forbiddenFiles = packedFiles.filter(
    (packedPath) =>
      forbiddenPackedPathPatterns.some((pattern) => pattern.test(packedPath)) ||
      (react
        ? /(?:^|\/)(?:playwright|docs)(?:\/|$)/.test(packedPath)
        : /(?:^|\/)react-components(?:\/|$)/.test(packedPath))
  );

  assert.deepEqual(unexpectedFiles, [], `Tarball contains files outside the public allowlist: ${unexpectedFiles}`);
  assert.deepEqual(forbiddenFiles, [], `Tarball contains repository-only artifacts: ${forbiddenFiles}`);

  for (const requiredFile of [
    ...allowedPackageRootFiles,
    "build/index.js",
    "build/index.d.ts",
    "build/styles.css",
    ...(react
      ? []
      : [
          "build/playwright/index.js",
          "build/playwright/index.d.ts",
          "build/playwright/index.cjs",
          "build/playwright/index.d.cts",
          "build/docs/INDEX.md",
        ]),
  ]) {
    assert.ok(packedFiles.includes(requiredFile), `Tarball is missing required file ${requiredFile}.`);
  }
}

async function assertPathDoesNotExist(targetPath, message) {
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

async function collectGeneratedContractFiles(directory) {
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

export async function buildAndPackArtifact({ packageRoot, staleBuildSentinelPath, tarballPath, react = false }) {
  console.log("\n[package-contract] Building published files...");
  await mkdir(path.dirname(staleBuildSentinelPath), { recursive: true });
  await writeFile(staleBuildSentinelPath, "The production build must remove this stale artifact.\n");
  await run("pnpm", ["run", "build"], { cwd: packageRoot });
  await assertPathDoesNotExist(staleBuildSentinelPath, "The production build did not clean its output directory.");
  await assertNoPrivateSchedulerSpecifiers(packageRoot);

  console.log("\n[package-contract] Packing the package and checking the tarball allowlist...");
  const packMetadata = getPackMetadata(
    await run("pnpm", ["pack", "--out", tarballPath, "--json"], {
      cwd: packageRoot,
      printStdout: false,
    })
  );
  assertPackedFiles(packMetadata, react);

  console.log("\n[package-contract] Linting the packed package metadata...");
  await run("pnpm", ["exec", "publint", tarballPath, "--strict"], { cwd: packageRoot });
}

export async function checkInstalledArtifact(consumerDirectory, expectedVersion, react = false) {
  const packageRoot = path.join(consumerDirectory, "node_modules", "@gravity-ui", react ? "graph-react" : "graph");
  const manifest = JSON.parse(await readFile(path.join(packageRoot, "package.json"), "utf8"));

  assert.equal(manifest.name, react ? "@gravity-ui/graph-react" : "@gravity-ui/graph");
  assert.equal(manifest.version, expectedVersion, "The installed package version does not match the tested artifact.");
  assert.notEqual(manifest.private, true);
  assert.equal(manifest.type, "module");
  assert.equal(manifest.main.replace(/^\.\//, ""), "build/index.js");
  assert.equal(manifest.module.replace(/^\.\//, ""), "build/index.js");
  assert.equal(manifest.types.replace(/^\.\//, ""), "build/index.d.ts");
  assert.deepEqual(manifest.files, ["build"]);
  assert.deepEqual(
    manifest.exports,
    react ? { ".": expectedExports["."], "./styles.css": expectedExports["./styles.css"] } : expectedExports
  );
  assert.deepEqual(manifest.typesVersions, react ? undefined : expectedTypesVersions);
  if (react) {
    assert.equal(manifest.peerDependencies?.react, "^18.0.0");
    assert.equal(manifest.peerDependencies?.["react-dom"], "^18.0.0");
    assert.equal(manifest.peerDependenciesMeta?.react?.optional, undefined);
    assert.equal(manifest.peerDependenciesMeta?.["react-dom"]?.optional, undefined);
    const coreManifest = JSON.parse(await readFile(path.join(packageRoot, "../graph/package.json"), "utf8"));
    assert.equal(manifest.peerDependencies?.["@gravity-ui/graph"], `^${coreManifest.version}`);
    assert.equal(manifest.dependencies?.["@gravity-ui/graph"], undefined);
  } else {
    assert.equal(manifest.peerDependencies?.["@playwright/test"], ">=1.58.0");
    assert.equal(manifest.peerDependenciesMeta?.["@playwright/test"]?.optional, true);
    for (const field of [
      "dependencies",
      "devDependencies",
      "peerDependencies",
      "peerDependenciesMeta",
      "optionalDependencies",
    ]) {
      for (const name of [
        "react",
        "react-dom",
        "@types/react",
        "@types/react-dom",
        "@gravity-ui/graph-react",
        "elkjs",
      ]) {
        assert.equal(manifest[field]?.[name], undefined, `Core must not depend on ${name} through ${field}.`);
      }
    }
  }

  for (const dependencyField of ["dependencies", "optionalDependencies", "peerDependencies"]) {
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
    [
      "build/index.js",
      "build/index.d.ts",
      "build/styles.css",
      ...(react
        ? []
        : [
            "build/playwright/index.js",
            "build/playwright/index.d.ts",
            "build/playwright/index.cjs",
            "build/playwright/index.d.cts",
            "build/docs/INDEX.md",
          ]),
      "README.md",
      "LICENSE",
    ].map((relativePath) => access(path.join(packageRoot, relativePath)))
  );

  await assertPathDoesNotExist(
    path.join(consumerDirectory, "node_modules", ...privateSchedulerPackage.split("/")),
    `The isolated consumer installed the private package ${privateSchedulerPackage}.`
  );
  await assertNoPrivateSchedulerSpecifiers(packageRoot);

  const publicStyles = await readFile(path.join(packageRoot, "build", "styles.css"), "utf8");
  if (react) {
    assert.match(publicStyles, /\.graph-wrapper\b/);
    for (const file of await collectGeneratedContractFiles(path.join(packageRoot, "build"))) {
      assert.doesNotMatch(
        await readFile(file, "utf8"),
        /["']@gravity-ui\/graph\//,
        `React artifact ${file} must reference the public core entrypoint, including inferred declaration types.`
      );
    }
    assert.match(publicStyles, /\.graph-block-container\b/);
    assert.match(publicStyles, /\.graph-block-anchor\b/);
    assert.doesNotMatch(publicStyles, /\.devtools-ruler-bg\b/);
  } else {
    assert.match(publicStyles, /\.layer\b/);
    assert.match(publicStyles, /\.devtools-ruler-bg\b/);
    assert.doesNotMatch(publicStyles, /\.(?:graph-wrapper|graph-block-container|graph-block-anchor)\b/);
    for (const file of await collectGeneratedContractFiles(path.join(packageRoot, "build"))) {
      assert.doesNotMatch(
        await readFile(file, "utf8"),
        /(?:from\s+|import\s*\(|require\s*\()["'](?:react(?:-dom)?(?:\/[^"']*)?|@gravity-ui\/graph-react)["']/
      );
    }
  }
}
