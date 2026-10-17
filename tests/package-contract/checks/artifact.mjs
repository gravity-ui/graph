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
  "./styles.css": "./build/styles.css",
};

const expectedPlaywrightExports = {
  ".": {
    import: {
      types: "./build/index.d.ts",
      default: "./build/index.js",
    },
    require: {
      types: "./build/index.d.cts",
      default: "./build/index.cjs",
    },
    default: "./build/index.js",
  },
};

const allowedPackageRootFiles = new Set(["LICENSE", "README.md", "package.json"]);
const allowedRuntimeFiles = new Set(["build/index.js", "build/styles.css"]);
const allowedPlaywrightRuntimeFiles = new Set(["build/index.js", "build/index.cjs"]);
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

function getRequiredBuildFiles(kind) {
  if (kind === "graph-playwright") {
    return ["build/index.js", "build/index.d.ts", "build/index.cjs", "build/index.d.cts"];
  }

  return [
    "build/index.js",
    "build/index.d.ts",
    "build/styles.css",
    ...(kind === "graph" ? ["build/docs/INDEX.md"] : []),
  ];
}

function assertPackedFiles(metadata, kind) {
  const addon = kind !== "graph";
  const playwright = kind === "graph-playwright";
  const runtimeFiles = playwright ? allowedPlaywrightRuntimeFiles : allowedRuntimeFiles;
  assert.equal(metadata.name, `@gravity-ui/${kind}`);
  assert.ok(Array.isArray(metadata.files), "pnpm pack did not report the packed file list.");

  const packedFiles = metadata.files.map(({ path: packedPath }) => packedPath).sort();
  const unexpectedFiles = packedFiles.filter((packedPath) => {
    if (allowedPackageRootFiles.has(packedPath) || runtimeFiles.has(packedPath)) {
      return false;
    }

    return (
      !(playwright ? /^build\/[^/]+\.d\.(?:ts|cts)$/ : /^build\/.+\.d\.ts$/).test(packedPath) &&
      !(!playwright && /^build\/chunks\/[^/]+\.js$/.test(packedPath)) &&
      !/^build\/docs\/.+\.md$/.test(packedPath)
    );
  });
  const forbiddenFiles = packedFiles.filter(
    (packedPath) =>
      forbiddenPackedPathPatterns.some((pattern) => pattern.test(packedPath)) ||
      (addon
        ? /(?:^|\/)(?:playwright|docs)(?:\/|$)/.test(packedPath)
        : /(?:^|\/)(?:react-components|playwright|plugins\/(?:minimap|devtools))(?:\/|$)/.test(packedPath))
  );

  assert.deepEqual(unexpectedFiles, [], `Tarball contains files outside the public allowlist: ${unexpectedFiles}`);
  assert.deepEqual(forbiddenFiles, [], `Tarball contains repository-only artifacts: ${forbiddenFiles}`);

  for (const requiredFile of [...allowedPackageRootFiles, ...getRequiredBuildFiles(kind)]) {
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

export async function buildAndPackArtifact({ packageRoot, staleBuildSentinelPath, tarballPath, kind = "graph" }) {
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
  assertPackedFiles(packMetadata, kind);

  console.log("\n[package-contract] Linting the packed package metadata...");
  await run("pnpm", ["exec", "publint", tarballPath, "--strict"], { cwd: packageRoot });
}

export async function checkInstalledArtifact(consumerDirectory, expectedVersion, kind = "graph") {
  const addon = kind !== "graph";
  const react = kind === "graph-react";
  const playwright = kind === "graph-playwright";
  const packageRoot = path.join(consumerDirectory, "node_modules", "@gravity-ui", kind);
  const manifest = JSON.parse(await readFile(path.join(packageRoot, "package.json"), "utf8"));

  assert.equal(manifest.name, `@gravity-ui/${kind}`);
  assert.equal(manifest.version, expectedVersion, "The installed package version does not match the tested artifact.");
  assert.notEqual(manifest.private, true);
  assert.equal(manifest.type, "module");
  assert.equal(manifest.main.replace(/^\.\//, ""), "build/index.js");
  assert.equal(manifest.module.replace(/^\.\//, ""), "build/index.js");
  assert.equal(manifest.types.replace(/^\.\//, ""), "build/index.d.ts");
  assert.deepEqual(manifest.files, ["build"]);
  assert.deepEqual(
    manifest.exports,
    playwright
      ? expectedPlaywrightExports
      : addon
        ? { ".": expectedExports["."], "./styles.css": expectedExports["./styles.css"] }
        : expectedExports
  );
  assert.equal(manifest.typesVersions, undefined);
  if (addon) {
    const coreManifest = JSON.parse(await readFile(path.join(packageRoot, "../graph/package.json"), "utf8"));
    assert.equal(manifest.peerDependencies?.["@gravity-ui/graph"], `^${coreManifest.version}`);
    assert.equal(manifest.peerDependenciesMeta?.["@gravity-ui/graph"]?.optional, undefined);
    assert.equal(manifest.dependencies?.["@gravity-ui/graph"], undefined);
  }
  if (react) {
    assert.equal(manifest.peerDependencies?.react, "^18.0.0");
    assert.equal(manifest.peerDependencies?.["react-dom"], "^18.0.0");
    assert.equal(manifest.peerDependenciesMeta?.react?.optional, undefined);
    assert.equal(manifest.peerDependenciesMeta?.["react-dom"]?.optional, undefined);
  }
  if (playwright) {
    assert.deepEqual(Object.keys(manifest.peerDependencies).sort(), ["@gravity-ui/graph", "@playwright/test"]);
    assert.equal(manifest.peerDependencies["@playwright/test"], ">=1.58.0");
    assert.equal(manifest.peerDependenciesMeta, undefined);
    assert.deepEqual(manifest.dependencies ?? {}, {});
    assert.deepEqual(manifest.optionalDependencies ?? {}, {});
  }
  if (!addon) {
    assert.equal(manifest.peerDependencies, undefined);
    assert.equal(manifest.peerDependenciesMeta, undefined);
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
        "@gravity-ui/graph-minimap",
        "@gravity-ui/graph-devtools",
        "@gravity-ui/graph-playwright",
        "@playwright/test",
        "elkjs",
      ]) {
        assert.equal(manifest[field]?.[name], undefined, `Core must not depend on ${name} through ${field}.`);
      }
    }
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
    [...getRequiredBuildFiles(kind), "README.md", "LICENSE"].map((relativePath) =>
      access(path.join(packageRoot, relativePath))
    )
  );

  await assertPathDoesNotExist(
    path.join(consumerDirectory, "node_modules", ...privateSchedulerPackage.split("/")),
    `The isolated consumer installed the private package ${privateSchedulerPackage}.`
  );
  await assertNoPrivateSchedulerSpecifiers(packageRoot);

  if (playwright) {
    const declaredPackages = new Set([
      ...Object.keys(manifest.dependencies ?? {}),
      ...Object.keys(manifest.peerDependencies ?? {}),
    ]);
    const bareSpecifierPattern = /(?<!["'\w])(?:from\s*|import\s*\(?\s*|require\s*\(\s*)["']([^"'./\s][^"'\s]*)["']/g;
    for (const file of await collectGeneratedContractFiles(path.join(packageRoot, "build"))) {
      const contents = await readFile(file, "utf8");
      const runtime = /\.c?js$/.test(file);
      for (const [, specifier] of contents.matchAll(bareSpecifierPattern)) {
        const packageName = specifier.startsWith("@")
          ? specifier.split("/").slice(0, 2).join("/")
          : specifier.split("/")[0];
        assert.ok(
          declaredPackages.has(packageName),
          `Playwright artifact ${file} imports undeclared package ${specifier}.`
        );
        assert.equal(specifier, packageName, `Playwright artifact ${file} uses a deep import ${specifier}.`);
        // The page objects run in Node and use core for types only.
        assert.ok(
          !runtime || packageName !== "@gravity-ui/graph",
          `Playwright runtime ${file} must not load the core runtime in Node.`
        );
      }
    }
    await assertPathDoesNotExist(path.join(packageRoot, "build/styles.css"), "Playwright package ships styles.");
    return;
  }

  const publicStyles = await readFile(path.join(packageRoot, "build", "styles.css"), "utf8");
  if (addon) {
    for (const file of await collectGeneratedContractFiles(path.join(packageRoot, "build"))) {
      assert.doesNotMatch(
        await readFile(file, "utf8"),
        /["']@gravity-ui\/graph\//,
        `Addon artifact ${file} must reference only the public core entrypoint.`
      );
    }
  }
  if (kind === "graph-minimap") {
    assert.deepEqual(Object.keys(manifest.peerDependencies), ["@gravity-ui/graph"]);
    assert.deepEqual(manifest.dependencies ?? {}, {});
    assert.deepEqual(manifest.optionalDependencies ?? {}, {});
    assert.match(publicStyles, /\.graph-minimap/);
    assert.match(publicStyles, /background:\s*lightgr[ae]y/);
    return;
  }
  if (kind === "graph-devtools") {
    assert.deepEqual(Object.keys(manifest.peerDependencies), ["@gravity-ui/graph"]);
    assert.deepEqual(manifest.dependencies ?? {}, {});
    assert.deepEqual(manifest.optionalDependencies ?? {}, {});
    assert.match(publicStyles, /\.devtools-ruler-bg-h\b/);
    assert.match(publicStyles, /\.devtools-ruler-bg-v\b/);
    assert.doesNotMatch(publicStyles, /\.(?:layer|graph-wrapper|graph-block-container|graph-block-anchor)\b/);
    return;
  }
  if (react) {
    assert.match(publicStyles, /\.graph-wrapper\b/);
    assert.match(publicStyles, /\.graph-block-container\b/);
    assert.match(publicStyles, /\.graph-block-anchor\b/);
    assert.doesNotMatch(publicStyles, /\.devtools-ruler-bg\b/);
  } else {
    assert.match(publicStyles, /\.layer\b/);
    assert.doesNotMatch(publicStyles, /\.devtools-ruler-bg\b/);
    assert.doesNotMatch(publicStyles, /\.(?:graph-wrapper|graph-block-container|graph-block-anchor)\b/);
    await assertPathDoesNotExist(
      path.join(packageRoot, "build/playwright"),
      "Core still ships the Playwright page objects."
    );
    await assertPathDoesNotExist(
      path.join(packageRoot, "build/plugins/minimap"),
      "Core still ships minimap declarations."
    );
    assert.doesNotMatch(await readFile(path.join(packageRoot, "build/index.js"), "utf8"), /graph-minimap/);
    await assertPathDoesNotExist(
      path.join(packageRoot, "build/plugins/devtools"),
      "Core still ships DevTools declarations."
    );
    assert.doesNotMatch(await readFile(path.join(packageRoot, "build/index.js"), "utf8"), /devtools-layer/);
    for (const file of await collectGeneratedContractFiles(path.join(packageRoot, "build"))) {
      assert.doesNotMatch(
        await readFile(file, "utf8"),
        /(?:from\s+|import\s*\(|require\s*\()["'](?:react(?:-dom)?(?:\/[^"']*)?|@playwright\/test|@gravity-ui\/graph-(?:react|minimap|devtools|playwright))["']/
      );
    }
  }
}
