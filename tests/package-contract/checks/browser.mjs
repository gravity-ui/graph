import { cp, mkdir } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";

import { run } from "../utils.mjs";

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

export async function checkBrowserConsumer({ consumerDirectory, consumerName, appName, entryPoint }) {
  console.log(`\n[package-contract:${consumerName}] Bundling ${entryPoint}...`);
  await run("pnpm", ["exec", "esbuild", entryPoint, "--bundle", "--outfile=dist/app.js"], {
    cwd: consumerDirectory,
  });

  console.log(`\n[package-contract:${consumerName}] Running the installed-package browser scenario...`);
  const port = await getFreePort();
  await run("pnpm", ["exec", "playwright", "test", "--config", "fixtures/shared/playwright.config.ts"], {
    cwd: consumerDirectory,
    env: {
      ...process.env,
      PACKAGE_CONTRACT_APP: appName,
      PACKAGE_CONTRACT_PORT: String(port),
    },
  });
}

export async function preserveBrowserArtifacts({ consumerNames, packageRoot, temporaryDirectory }) {
  if (!process.env.CI) {
    return;
  }

  for (const consumerName of consumerNames) {
    for (const directory of ["playwright-report", "test-results"]) {
      const source = path.join(temporaryDirectory, consumerName, directory);
      const target = path.join(packageRoot, directory, "package-contract", consumerName);

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
