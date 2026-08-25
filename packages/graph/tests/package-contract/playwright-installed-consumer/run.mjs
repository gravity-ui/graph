import assert from "node:assert/strict";
import { access, cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const fixtureDirectory = fileURLToPath(new URL("./fixture", import.meta.url));
const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
const temporaryDirectory = await mkdtemp(path.join(tmpdir(), "gravity-graph-playwright-consumer-"));
const tarballDirectory = path.join(temporaryDirectory, "tarballs");
const tarballName = "gravity-ui-graph.tgz";
const tarballPath = path.join(tarballDirectory, tarballName);
const consumerNames = ["vanilla", "react"];

async function getInstalledVersion(packageName) {
  const manifestPath = path.join(repositoryRoot, "node_modules", ...packageName.split("/"), "package.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

  if (!manifest.version) {
    throw new Error(`Installed package ${packageName} does not declare a version.`);
  }

  return manifest.version;
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      if (options.printStdout !== false) {
        process.stdout.write(chunk);
      }
    });
    child.stderr.on("data", (chunk) => process.stderr.write(chunk));
    child.on("error", reject);
    child.on("close", (code, signal) => {
      if (code === 0) {
        resolve(stdout);
        return;
      }

      reject(
        new Error(
          signal
            ? `${command} ${args.join(" ")} was terminated by ${signal}.`
            : `${command} ${args.join(" ")} exited with code ${code}.`
        )
      );
    });
  });
}

async function getFreePort() {
  const server = createServer();

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Could not reserve a local port for the consumer test."));
        return;
      }

      server.close((error) => {
        if (error) {
          reject(error);
        } else {
          resolve(address.port);
        }
      });
    });
  });
}

async function preserveCIArtifacts() {
  if (!process.env.CI) {
    return;
  }

  for (const consumerName of consumerNames) {
    for (const directory of ["playwright-report", "test-results"]) {
      const source = path.join(temporaryDirectory, consumerName, directory);
      const target = path.join(repositoryRoot, directory, "package-contract", consumerName);

      try {
        await mkdir(path.dirname(target), { recursive: true });
        await cp(source, target, { recursive: true });
      } catch (error) {
        if (error?.code !== "ENOENT") {
          console.error(`[package-contract] Could not preserve ${consumerName}/${directory}:`, error);
        }
      }
    }
  }
}

async function assertInstalledPackageContract(consumerDirectory) {
  const packageRoot = path.join(consumerDirectory, "node_modules", "@gravity-ui", "graph");
  const manifest = JSON.parse(await readFile(path.join(packageRoot, "package.json"), "utf8"));

  assert.equal(manifest.name, "@gravity-ui/graph");
  assert.notEqual(manifest.private, true);
  assert.equal(manifest.main, "build/index.js");
  assert.equal(manifest.module, "build/index.js");
  assert.equal(manifest.types, "build/index.d.ts");
  assert.deepEqual(manifest.typesVersions, {
    "*": {
      react: ["build/react-components/index.d.ts"],
      playwright: ["build/playwright/index.d.ts"],
    },
  });
  assert.deepEqual(manifest.exports, {
    ".": {
      types: "./build/index.d.ts",
      default: "./build/index.js",
    },
    "./react": {
      types: "./build/react-components/index.d.ts",
      default: "./build/react-components/index.js",
    },
    "./playwright": {
      types: "./build/playwright/index.d.ts",
      default: "./build/playwright/index.js",
    },
  });

  await Promise.all(
    [
      "build/index.js",
      "build/index.d.ts",
      "build/react-components/index.js",
      "build/react-components/index.d.ts",
      "build/react-components/graph-canvas.css",
      "build/playwright/index.js",
      "build/playwright/index.d.ts",
      "build/docs/INDEX.md",
      "README.md",
      "LICENSE",
      "tsconfig.json",
    ].map((relativePath) => access(path.join(packageRoot, relativePath)))
  );
}

async function runConsumer({ name, manifest, typecheckConfig, entryPoint, testFile }) {
  const consumerDirectory = path.join(temporaryDirectory, name);
  await mkdir(consumerDirectory);
  await cp(fixtureDirectory, consumerDirectory, { recursive: true });
  await writeFile(path.join(consumerDirectory, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`);

  console.log(`\n[package-contract:${name}] Installing the packed library...`);
  await run("pnpm", ["install", "--ignore-workspace", "--ignore-scripts", "--no-lockfile", "--no-frozen-lockfile"], {
    cwd: consumerDirectory,
  });

  await assertInstalledPackageContract(consumerDirectory);

  console.log(`\n[package-contract:${name}] Type-checking the public consumer API...`);
  await run("pnpm", ["exec", "tsc", "-p", typecheckConfig, "--noEmit"], { cwd: consumerDirectory });

  console.log(`\n[package-contract:${name}] Bundling ${entryPoint}...`);
  await run("pnpm", ["exec", "esbuild", entryPoint, "--bundle", `--outfile=dist/${path.parse(entryPoint).name}.js`], {
    cwd: consumerDirectory,
  });

  console.log(`\n[package-contract:${name}] Running ${testFile} through the installed Playwright entrypoint...`);
  const port = await getFreePort();
  await run("pnpm", ["exec", "playwright", "test", testFile], {
    cwd: consumerDirectory,
    env: {
      ...process.env,
      PACKAGE_CONTRACT_PORT: String(port),
    },
  });
}

try {
  await mkdir(tarballDirectory);

  console.log("\n[package-contract] Building published files...");
  await run("pnpm", ["run", "build:publish"], {
    cwd: repositoryRoot,
  });

  console.log("\n[package-contract] Packing @gravity-ui/graph...");
  await run("pnpm", ["pack", "--out", tarballPath], {
    cwd: repositoryRoot,
    printStdout: false,
  });

  const [
    playwrightVersion,
    esbuildVersion,
    typescriptVersion,
    reactVersion,
    reactDomVersion,
    reactTypesVersion,
    reactDomTypesVersion,
  ] = await Promise.all(
    ["@playwright/test", "esbuild", "typescript", "react", "react-dom", "@types/react", "@types/react-dom"].map(
      getInstalledVersion
    )
  );
  const commonManifest = {
    private: true,
    type: "module",
    packageManager: "pnpm@10.34.5",
    dependencies: {
      "@gravity-ui/graph": `file:../tarballs/${tarballName}`,
      react: reactVersion,
      "react-dom": reactDomVersion,
    },
    devDependencies: {
      "@playwright/test": playwrightVersion,
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
    typecheckConfig: "tsconfig.vanilla.json",
    entryPoint: "app.ts",
    testFile: "graph.pw.ts",
  });

  await runConsumer({
    name: "react",
    manifest: {
      ...commonManifest,
      name: "gravity-graph-installed-react-consumer",
      dependencies: {
        ...commonManifest.dependencies,
      },
      devDependencies: {
        ...commonManifest.devDependencies,
        "@types/react": reactTypesVersion,
        "@types/react-dom": reactDomTypesVersion,
      },
    },
    typecheckConfig: "tsconfig.react.json",
    entryPoint: "react-app.tsx",
    testFile: "react.pw.ts",
  });

  console.log("\n[package-contract] Installed consumer contract passed.");
} catch (error) {
  await preserveCIArtifacts();

  if (process.env.KEEP_PACKAGE_CONTRACT_TMP === "1") {
    console.error(`\n[package-contract] Preserving failed project at ${temporaryDirectory}`);
  }
  throw error;
} finally {
  if (process.env.KEEP_PACKAGE_CONTRACT_TMP !== "1") {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}
