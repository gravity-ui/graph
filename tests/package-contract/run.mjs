import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildAndPackArtifact, checkInstalledArtifact } from "./checks/artifact.mjs";
import { checkBrowserConsumer, preserveBrowserArtifacts } from "./checks/browser.mjs";
import { checkRuntimeConsumer } from "./checks/runtime.mjs";
import { checkConsumerTypes, checkTarballTypes } from "./checks/types.mjs";
import { run } from "./utils.mjs";

const fixturesDirectory = fileURLToPath(new URL("./fixtures", import.meta.url));
const workspaceRoot = fileURLToPath(new URL("../../", import.meta.url));
const packageRoot = path.join(workspaceRoot, "packages/graph");
const reactPackageRoot = path.join(workspaceRoot, "packages/graph-react");
const temporaryDirectory = await mkdtemp(path.join(tmpdir(), "gravity-graph-package-contract-"));
const requestedTarballPath = process.env.PACKAGE_CONTRACT_TARBALL_PATH;
const defaultTarballPath = path.join(temporaryDirectory, "tarballs", "gravity-ui-graph.tgz");
const testingReactPackage = process.argv[2] === "graph-react";
const workspaceTarballs = JSON.parse(process.env.PACKAGE_CONTRACT_WORKSPACE_TARBALLS || "{}");
const suppliedCoreTarball = testingReactPackage ? workspaceTarballs["@gravity-ui/graph"] : undefined;
const tarballPath = suppliedCoreTarball
  ? path.resolve(suppliedCoreTarball)
  : requestedTarballPath && !testingReactPackage
    ? path.resolve(requestedTarballPath)
    : defaultTarballPath;
const reactTarballPath =
  requestedTarballPath && testingReactPackage
    ? path.resolve(requestedTarballPath)
    : path.join(temporaryDirectory, "tarballs", "gravity-ui-graph-react.tgz");
const reactStaleBuildSentinelPath = path.join(reactPackageRoot, "build", "package-contract-stale-sentinel.txt");
const staleBuildSentinelPath = path.join(packageRoot, "build", "package-contract-stale-sentinel.txt");
const consumerNames = ["vanilla", "react"];

async function getInstalledVersion(packageName) {
  const owner = ["react", "react-dom", "@types/react", "@types/react-dom"].includes(packageName)
    ? reactPackageRoot
    : packageName === "@preact/signals-core"
      ? packageRoot
      : workspaceRoot;
  const manifestPath = path.join(owner, "node_modules", ...packageName.split("/"), "package.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

  if (!manifest.version) {
    throw new Error(`Installed package ${packageName} does not declare a version.`);
  }

  return manifest.version;
}

async function runConsumer({
  name,
  manifest,
  expectedVersion,
  expectedReactVersion,
  typecheckConfigs,
  entryPoint,
  nativeImports,
  expectNoReact = false,
  verifySignalInterop = false,
}) {
  const consumerDirectory = path.join(temporaryDirectory, name);
  await mkdir(consumerDirectory);
  await cp(fixturesDirectory, path.join(consumerDirectory, "fixtures"), { recursive: true });
  await writeFile(path.join(consumerDirectory, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`);

  console.log(`\n[package-contract:${name}] Installing the packed library...`);
  await run("pnpm", ["install", "--ignore-workspace", "--ignore-scripts", "--no-lockfile", "--no-frozen-lockfile"], {
    cwd: consumerDirectory,
  });

  await checkInstalledArtifact(consumerDirectory, expectedVersion);
  if (expectedReactVersion) await checkInstalledArtifact(consumerDirectory, expectedReactVersion, true);
  await checkRuntimeConsumer({
    consumerDirectory,
    entrypoints: nativeImports,
    expectNoReact,
    verifySignalInterop,
  });
  await checkConsumerTypes({
    consumerDirectory,
    consumerName: name,
    configs: typecheckConfigs,
  });
  await checkBrowserConsumer({
    consumerDirectory,
    consumerName: name,
    appName: name,
    entryPoint,
  });
}

try {
  const graphManifest = JSON.parse(await readFile(path.join(packageRoot, "package.json"), "utf8"));
  const expectedVersion = graphManifest.version;
  const reactManifest = JSON.parse(await readFile(path.join(reactPackageRoot, "package.json"), "utf8"));
  await mkdir(path.dirname(tarballPath), { recursive: true });
  await mkdir(path.dirname(reactTarballPath), { recursive: true });
  if (suppliedCoreTarball) {
    // React declarations compile against the workspace core build; consumers use the supplied exact tarball.
    await run("pnpm", ["run", "build"], { cwd: packageRoot });
  } else {
    await buildAndPackArtifact({ packageRoot, staleBuildSentinelPath, tarballPath });
  }
  await buildAndPackArtifact({
    packageRoot: reactPackageRoot,
    staleBuildSentinelPath: reactStaleBuildSentinelPath,
    tarballPath: reactTarballPath,
    react: true,
  });
  await checkTarballTypes({ packageRoot, tarballPath, reactTarballPath });

  const workspaceManifest = JSON.parse(await readFile(path.join(workspaceRoot, "package.json"), "utf8"));
  if (!workspaceManifest.packageManager) {
    throw new Error("The workspace manifest must declare packageManager for generated consumers.");
  }

  const [
    playwrightVersion,
    esbuildVersion,
    typescriptVersion,
    nodeTypesVersion,
    signalsVersion,
    reactVersion,
    reactDomVersion,
    reactTypesVersion,
    reactDomTypesVersion,
  ] = await Promise.all(
    [
      "@playwright/test",
      "esbuild",
      "typescript",
      "@types/node",
      "@preact/signals-core",
      "react",
      "react-dom",
      "@types/react",
      "@types/react-dom",
    ].map(getInstalledVersion)
  );
  const commonManifest = {
    private: true,
    type: "module",
    packageManager: workspaceManifest.packageManager,
    dependencies: {
      "@gravity-ui/graph": `file:${tarballPath}`,
      "@preact/signals-core": signalsVersion,
    },
    devDependencies: {
      "@playwright/test": playwrightVersion,
      "@types/node": nodeTypesVersion,
      esbuild: esbuildVersion,
      typescript: typescriptVersion,
    },
  };

  await runConsumer({
    name: "vanilla",
    expectedVersion,
    manifest: {
      ...commonManifest,
      name: "gravity-graph-installed-vanilla-consumer",
    },
    typecheckConfigs: [
      "fixtures/apps/vanilla/tsconfig.json",
      "fixtures/types/playwright-bundler/tsconfig.json",
      "fixtures/types/node-cjs-playwright/tsconfig.json",
    ],
    entryPoint: "fixtures/apps/vanilla/app.ts",
    nativeImports: ["root", "playwright"],
    expectNoReact: true,
    verifySignalInterop: true,
  });

  await runConsumer({
    name: "react",
    expectedVersion,
    expectedReactVersion: reactManifest.version,
    manifest: {
      ...commonManifest,
      name: "gravity-graph-installed-react-consumer",
      dependencies: {
        ...commonManifest.dependencies,
        "@gravity-ui/graph-react": `file:${reactTarballPath}`,
        react: reactVersion,
        "react-dom": reactDomVersion,
      },
      devDependencies: {
        ...commonManifest.devDependencies,
        "@types/react": reactTypesVersion,
        "@types/react-dom": reactDomTypesVersion,
      },
    },
    typecheckConfigs: ["fixtures/apps/react/tsconfig.json", "fixtures/types/node-esm/tsconfig.json"],
    entryPoint: "fixtures/apps/react/app.tsx",
    nativeImports: ["root", "react", "playwright"],
  });

  console.log("\n[package-contract] Packed package contract passed.");
} catch (error) {
  await preserveBrowserArtifacts({ consumerNames, packageRoot: workspaceRoot, temporaryDirectory });
  throw error;
} finally {
  await rm(staleBuildSentinelPath, { force: true });
  await rm(reactStaleBuildSentinelPath, { force: true });

  if (process.env.KEEP_PACKAGE_CONTRACT_TMP === "1") {
    console.log(`\n[package-contract] Preserved temporary projects at ${temporaryDirectory}`);
  } else {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}
