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
const packageRoot = fileURLToPath(new URL("../../", import.meta.url));
const workspaceRoot = fileURLToPath(new URL("../../../../", import.meta.url));
const temporaryDirectory = await mkdtemp(path.join(tmpdir(), "gravity-graph-package-contract-"));
const tarballDirectory = path.join(temporaryDirectory, "tarballs");
const tarballName = "gravity-ui-graph.tgz";
const tarballPath = path.join(tarballDirectory, tarballName);
const staleBuildSentinelPath = path.join(packageRoot, "build", "package-contract-stale-sentinel.txt");
const consumerNames = ["vanilla", "react"];

async function getInstalledVersion(packageName) {
  const manifestPath = path.join(packageRoot, "node_modules", ...packageName.split("/"), "package.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

  if (!manifest.version) {
    throw new Error(`Installed package ${packageName} does not declare a version.`);
  }

  return manifest.version;
}

async function runConsumer({
  name,
  manifest,
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

  await checkInstalledArtifact(consumerDirectory);
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
  await mkdir(tarballDirectory);
  await buildAndPackArtifact({ packageRoot, staleBuildSentinelPath, tarballPath });
  await checkTarballTypes({ packageRoot, tarballPath });

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
      "@gravity-ui/graph": `file:../tarballs/${tarballName}`,
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
    manifest: {
      ...commonManifest,
      name: "gravity-graph-installed-react-consumer",
      dependencies: {
        ...commonManifest.dependencies,
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

  console.log("\n[package-contract] Published package contract passed.");
} catch (error) {
  await preserveBrowserArtifacts({ consumerNames, packageRoot, temporaryDirectory });
  throw error;
} finally {
  await rm(staleBuildSentinelPath, { force: true });

  if (process.env.KEEP_PACKAGE_CONTRACT_TMP === "1") {
    console.log(`\n[package-contract] Preserved temporary projects at ${temporaryDirectory}`);
  } else {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}
