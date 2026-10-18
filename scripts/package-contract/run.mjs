// Usage: node scripts/package-contract/run.mjs [package-directory...]
// Without arguments every packages/*/contract is checked. PACKAGE_CONTRACT_TARBALL_PATH is the output
// path for the requested package (core when none is given); PACKAGE_CONTRACT_WORKSPACE_TARBALLS maps
// dependency package names to prebuilt tarballs that consumers install instead of freshly packed ones.
import { access, cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  buildAndPackArtifact,
  buildPackage,
  checkInstalledArtifact,
  staleBuildSentinelName,
} from "./checks/artifact.mjs";
import { checkBrowserConsumer, preserveBrowserArtifacts } from "./checks/browser.mjs";
import { checkRuntimeConsumer } from "./checks/runtime.mjs";
import { checkConsumerTypes, checkTarballTypes } from "./checks/types.mjs";
import { run } from "./utils.mjs";

const workspaceRoot = fileURLToPath(new URL("../../", import.meta.url));
const sharedDirectory = fileURLToPath(new URL("./shared", import.meta.url));
const packagesDirectory = path.join(workspaceRoot, "packages");
const coreDirectory = "graph";

async function exists(targetPath) {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function loadContracts() {
  const contracts = new Map();

  for (const entry of await readdir(packagesDirectory, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const packageRoot = path.join(packagesDirectory, entry.name);
    const contractDirectory = path.join(packageRoot, "contract");
    const configPath = path.join(contractDirectory, "contract.config.mjs");
    if (!(await exists(configPath))) continue;

    const manifest = JSON.parse(await readFile(path.join(packageRoot, "package.json"), "utf8"));
    const { default: config } = await import(pathToFileURL(configPath).href);
    contracts.set(entry.name, {
      ...config,
      directory: entry.name,
      packageName: manifest.name,
      version: manifest.version,
      packageRoot,
      contractDirectory,
    });
  }

  if (!contracts.has(coreDirectory)) {
    throw new Error(`packages/${coreDirectory}/contract/contract.config.mjs is required.`);
  }

  return contracts;
}

async function resolveInstalledVersion(packageName, searchRoots) {
  for (const root of searchRoots) {
    const manifestPath = path.join(root, "node_modules", ...packageName.split("/"), "package.json");
    if (!(await exists(manifestPath))) continue;
    const { version } = JSON.parse(await readFile(manifestPath, "utf8"));
    if (version) return version;
  }

  throw new Error(`Cannot resolve the workspace version of ${packageName}.`);
}

async function resolveVersions(names, searchRoots) {
  const entries = await Promise.all(
    names.map(async (name) => [name, await resolveInstalledVersion(name, searchRoots)])
  );

  return Object.fromEntries(entries);
}

const contracts = await loadContracts();
const requested = [...new Set(process.argv.slice(2))];
for (const name of requested) {
  if (!contracts.has(name)) throw new Error(`Unknown package or missing contract: ${name}`);
}
if (process.env.PACKAGE_CONTRACT_TARBALL_PATH && requested.length > 1) {
  throw new Error("PACKAGE_CONTRACT_TARBALL_PATH needs at most one requested package.");
}
// Core first: other packages compile against its build.
const tested = (requested.length > 0 ? requested : [...contracts.keys()]).sort((a, b) =>
  a === coreDirectory ? -1 : b === coreDirectory ? 1 : a.localeCompare(b)
);
const primary = requested[0] ?? coreDirectory;
const core = contracts.get(coreDirectory);

const temporaryDirectory = await mkdtemp(path.join(tmpdir(), "gravity-graph-package-contract-"));
const tarballDirectory = path.join(temporaryDirectory, "tarballs");
const requestedTarballPath = process.env.PACKAGE_CONTRACT_TARBALL_PATH;
const suppliedTarballs = JSON.parse(process.env.PACKAGE_CONTRACT_WORKSPACE_TARBALLS || "{}");
const tarballs = new Map();
const builtContracts = [];

async function prepareTarball(contract) {
  if (tarballs.has(contract.directory)) return tarballs.get(contract.directory);

  builtContracts.push(contract);
  // Packages under test are always packed and checked; supplied tarballs only replace their dependencies.
  const supplied = tested.includes(contract.directory) ? undefined : suppliedTarballs[contract.packageName];
  let tarballPath;
  if (supplied) {
    // Dependent declarations compile against the workspace build; consumers install the supplied exact tarball.
    await buildPackage(contract);
    tarballPath = path.resolve(supplied);
  } else {
    tarballPath =
      contract.directory === primary && requestedTarballPath
        ? path.resolve(requestedTarballPath)
        : path.join(tarballDirectory, `${contract.packageName.replace(/^@/, "").replace("/", "-")}.tgz`);
    await mkdir(path.dirname(tarballPath), { recursive: true });
    await buildAndPackArtifact(contract, tarballPath);
    await checkTarballTypes({ contract, tarballPath });
  }

  tarballs.set(contract.directory, tarballPath);
  return tarballPath;
}

async function runConsumer(contract, commonManifest, toolVersions) {
  const consumerDirectory = path.join(temporaryDirectory, contract.directory);
  const workspaceDependencies = [coreDirectory, ...(contract.workspaceDependencies ?? []), contract.directory].filter(
    (name, index, list) => list.indexOf(name) === index
  );
  const installed = workspaceDependencies.map((name) => contracts.get(name));
  const searchRoots = [contract.packageRoot, core.packageRoot, workspaceRoot];

  const manifest = {
    ...commonManifest,
    name: `gravity-graph-installed-${contract.directory}-consumer`,
    dependencies: {
      ...commonManifest.dependencies,
      ...Object.fromEntries(installed.map((item) => [item.packageName, `file:${tarballs.get(item.directory)}`])),
      ...(await resolveVersions(contract.dependencies ?? [], searchRoots)),
    },
    devDependencies: {
      ...toolVersions,
      ...(await resolveVersions(contract.devDependencies ?? [], searchRoots)),
    },
  };

  // The consumer mirrors the repository layout, so fixture-relative paths work in both places.
  const contractPath = (relativePath) => path.posix.join("packages", contract.directory, "contract", relativePath);
  await mkdir(consumerDirectory);
  await cp(sharedDirectory, path.join(consumerDirectory, path.relative(workspaceRoot, sharedDirectory)), {
    recursive: true,
  });
  await cp(contract.contractDirectory, path.join(consumerDirectory, contractPath("")), {
    recursive: true,
    filter: (source) => path.basename(source) !== "contract.config.mjs",
  });
  await writeFile(path.join(consumerDirectory, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`);

  console.log(`\n[package-contract:${contract.directory}] Installing the packed packages...`);
  await run("pnpm", ["install", "--ignore-workspace", "--ignore-scripts", "--no-lockfile", "--no-frozen-lockfile"], {
    cwd: consumerDirectory,
  });

  const workspace = [...contracts.values()].map((item) => item.packageName);
  for (const item of installed) {
    await checkInstalledArtifact({
      consumerDirectory,
      contract: item,
      expectedVersion: item.version,
      coreContract: core,
      workspace,
    });
  }
  await checkRuntimeConsumer({
    consumerDirectory,
    mustNotResolve: contract.mustNotResolve,
    probes: contract.probes,
  });
  await checkConsumerTypes({
    consumerDirectory,
    consumerName: contract.directory,
    configs: contract.typecheckConfigs.map(contractPath),
  });
  await checkBrowserConsumer({
    consumerDirectory,
    consumerName: contract.directory,
    entryPoint: contractPath(contract.entryPoint),
    appDirectory: contractPath("app"),
  });
}

try {
  const workspaceManifest = JSON.parse(await readFile(path.join(workspaceRoot, "package.json"), "utf8"));
  if (!workspaceManifest.packageManager) {
    throw new Error("The workspace manifest must declare packageManager for generated consumers.");
  }

  const needed = new Set([coreDirectory]);
  for (const name of tested) {
    for (const dependency of contracts.get(name).workspaceDependencies ?? []) needed.add(dependency);
    needed.add(name);
  }
  for (const name of [...needed].sort((a, b) => (a === coreDirectory ? -1 : b === coreDirectory ? 1 : 0))) {
    await prepareTarball(contracts.get(name));
  }

  const toolVersions = await resolveVersions(
    ["@playwright/test", "@types/node", "esbuild", "typescript"],
    [workspaceRoot]
  );
  const commonManifest = {
    private: true,
    type: "module",
    packageManager: workspaceManifest.packageManager,
    dependencies: await resolveVersions(["@preact/signals-core"], [core.packageRoot, workspaceRoot]),
  };

  for (const name of tested) {
    await runConsumer(contracts.get(name), commonManifest, toolVersions);
  }

  console.log("\n[package-contract] Packed package contract passed.");
} catch (error) {
  await preserveBrowserArtifacts({ consumerNames: tested, workspaceRoot, temporaryDirectory });
  throw error;
} finally {
  await Promise.all(
    builtContracts.map((contract) =>
      rm(path.join(contract.packageRoot, "build", staleBuildSentinelName), { force: true })
    )
  );

  if (process.env.KEEP_PACKAGE_CONTRACT_TMP === "1") {
    console.log(`\n[package-contract] Preserved temporary projects at ${temporaryDirectory}`);
  } else {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}
