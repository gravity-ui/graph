import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const fixtureDirectory = fileURLToPath(new URL("./fixture", import.meta.url));
const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
const temporaryDirectory = await mkdtemp(path.join(tmpdir(), "gravity-graph-playwright-consumer-"));
const tarballDirectory = path.join(temporaryDirectory, "tarballs");

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

  for (const directory of ["playwright-report", "test-results"]) {
    const source = path.join(temporaryDirectory, directory);
    const target = path.join(repositoryRoot, directory, "package-contract");

    try {
      await mkdir(path.dirname(target), { recursive: true });
      await cp(source, target, { recursive: true });
    } catch (error) {
      if (error?.code !== "ENOENT") {
        console.error(`[package-contract] Could not preserve ${directory}:`, error);
      }
    }
  }
}

try {
  await mkdir(tarballDirectory);

  console.log("\n[package-contract] Building published files...");
  await run("npm", ["run", "build:publish"], {
    cwd: repositoryRoot,
  });

  console.log("\n[package-contract] Packing @gravity-ui/graph...");
  const packOutput = await run("npm", ["pack", "--json", "--pack-destination", tarballDirectory], {
    cwd: repositoryRoot,
    printStdout: false,
  });
  const packResult = JSON.parse(packOutput);
  const tarballName = packResult[0]?.filename;
  if (!tarballName) {
    throw new Error("npm pack did not report the generated tarball name.");
  }

  const [playwrightVersion, esbuildVersion, typescriptVersion] = await Promise.all(
    ["@playwright/test", "esbuild", "typescript"].map(getInstalledVersion)
  );
  const consumerPackage = {
    name: "gravity-graph-playwright-installed-consumer",
    private: true,
    type: "module",
    scripts: {
      build: "esbuild app.ts --bundle --outfile=dist/app.js",
      typecheck: "tsc -p tsconfig.json --noEmit",
      test: "playwright test",
    },
    dependencies: {
      "@gravity-ui/graph": `file:./tarballs/${tarballName}`,
    },
    devDependencies: {
      "@playwright/test": playwrightVersion,
      esbuild: esbuildVersion,
      typescript: typescriptVersion,
    },
  };

  await cp(fixtureDirectory, temporaryDirectory, { recursive: true });
  await writeFile(path.join(temporaryDirectory, "package.json"), `${JSON.stringify(consumerPackage, null, 2)}\n`);

  console.log(`\n[package-contract] Installing tarball in ${temporaryDirectory}...`);
  await run("npm", ["install", "--ignore-scripts", "--no-package-lock"], {
    cwd: temporaryDirectory,
  });

  console.log("\n[package-contract] Type-checking the public consumer API...");
  await run("npm", ["run", "typecheck"], { cwd: temporaryDirectory });

  console.log("\n[package-contract] Bundling the vanilla Graph page...");
  await run("npm", ["run", "build"], { cwd: temporaryDirectory });

  console.log("\n[package-contract] Running Playwright through @gravity-ui/graph/playwright...");
  const port = await getFreePort();
  await run("npm", ["test"], {
    cwd: temporaryDirectory,
    env: {
      ...process.env,
      PACKAGE_CONTRACT_PORT: String(port),
    },
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
