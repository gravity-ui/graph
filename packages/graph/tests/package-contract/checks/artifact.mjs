import assert from "node:assert/strict";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { run } from "../utils.mjs";

const expectedExports = {
  ".": {
    types: "./build/index.d.ts",
    import: "./build/index.js",
    default: "./build/index.js",
  },
  "./react": {
    types: "./build/react-components/index.d.ts",
    import: "./build/react-components/index.js",
    default: "./build/react-components/index.js",
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
    react: ["build/react-components/index.d.ts"],
    playwright: ["build/playwright/index.d.ts"],
  },
};

const allowedPackageRootFiles = new Set(["LICENSE", "README.md", "package.json"]);
const allowedRuntimeFiles = new Set([
  "build/index.js",
  "build/react-components/index.js",
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

function assertPackedFiles(metadata) {
  assert.equal(metadata.name, "@gravity-ui/graph");
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
  const forbiddenFiles = packedFiles.filter((packedPath) =>
    forbiddenPackedPathPatterns.some((pattern) => pattern.test(packedPath))
  );

  assert.deepEqual(unexpectedFiles, [], `Tarball contains files outside the public allowlist: ${unexpectedFiles}`);
  assert.deepEqual(forbiddenFiles, [], `Tarball contains repository-only artifacts: ${forbiddenFiles}`);

  for (const requiredFile of [
    ...allowedPackageRootFiles,
    "build/index.js",
    "build/index.d.ts",
    "build/react-components/index.js",
    "build/react-components/index.d.ts",
    "build/playwright/index.js",
    "build/playwright/index.d.ts",
    "build/playwright/index.cjs",
    "build/playwright/index.d.cts",
    "build/styles.css",
    "build/docs/INDEX.md",
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

export async function buildAndPackArtifact({ packageRoot, staleBuildSentinelPath, tarballPath }) {
  console.log("\n[package-contract] Building published files...");
  await mkdir(path.dirname(staleBuildSentinelPath), { recursive: true });
  await writeFile(staleBuildSentinelPath, "The production build must remove this stale artifact.\n");
  await run("pnpm", ["run", "build"], { cwd: packageRoot });
  await assertPathDoesNotExist(staleBuildSentinelPath, "The production build did not clean its output directory.");

  console.log("\n[package-contract] Packing @gravity-ui/graph and checking the tarball allowlist...");
  const packMetadata = getPackMetadata(
    await run("pnpm", ["pack", "--out", tarballPath, "--json"], {
      cwd: packageRoot,
      printStdout: false,
    })
  );
  assertPackedFiles(packMetadata);

  console.log("\n[package-contract] Linting the packed package metadata...");
  await run("pnpm", ["exec", "publint", tarballPath, "--strict"], { cwd: packageRoot });
}

export async function checkInstalledArtifact(consumerDirectory) {
  const packageRoot = path.join(consumerDirectory, "node_modules", "@gravity-ui", "graph");
  const manifest = JSON.parse(await readFile(path.join(packageRoot, "package.json"), "utf8"));

  assert.equal(manifest.name, "@gravity-ui/graph");
  assert.notEqual(manifest.private, true);
  assert.equal(manifest.type, "module");
  assert.equal(manifest.main.replace(/^\.\//, ""), "build/index.js");
  assert.equal(manifest.module.replace(/^\.\//, ""), "build/index.js");
  assert.equal(manifest.types.replace(/^\.\//, ""), "build/index.d.ts");
  assert.deepEqual(manifest.files, ["build"]);
  assert.deepEqual(manifest.exports, expectedExports);
  assert.deepEqual(manifest.typesVersions, expectedTypesVersions);
  assert.equal(manifest.peerDependencies?.["@playwright/test"], ">=1.58.0");
  assert.equal(manifest.peerDependencies?.react, "^18.0.0");
  assert.equal(manifest.peerDependencies?.["react-dom"], "^18.0.0");
  assert.equal(manifest.peerDependenciesMeta?.["@playwright/test"]?.optional, true);
  assert.equal(manifest.peerDependenciesMeta?.react?.optional, true);
  assert.equal(manifest.peerDependenciesMeta?.["react-dom"]?.optional, true);

  await Promise.all(
    [
      "build/index.js",
      "build/index.d.ts",
      "build/react-components/index.js",
      "build/react-components/index.d.ts",
      "build/playwright/index.js",
      "build/playwright/index.d.ts",
      "build/playwright/index.cjs",
      "build/playwright/index.d.cts",
      "build/styles.css",
      "build/docs/INDEX.md",
      "README.md",
      "LICENSE",
    ].map((relativePath) => access(path.join(packageRoot, relativePath)))
  );

  const publicStyles = await readFile(path.join(packageRoot, "build", "styles.css"), "utf8");
  assert.match(publicStyles, /\.layer\b/, "Public styles do not include the vanilla canvas contract.");
  assert.match(publicStyles, /\.graph-wrapper\b/, "Public styles do not include the React canvas contract.");
  assert.match(publicStyles, /\.graph-block-container\b/, "Public styles do not include the React block contract.");
  assert.match(publicStyles, /\.graph-block-anchor\b/, "Public styles do not include the React anchor contract.");
  assert.match(publicStyles, /\.devtools-ruler-bg\b/, "Public styles do not include the devtools contract.");
}
