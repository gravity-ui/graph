import { defineConfig } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const port = Number(process.env.PACKAGE_CONTRACT_PORT ?? "4173");
const baseURL = `http://127.0.0.1:${port}`;
const appName = process.env.PACKAGE_CONTRACT_APP;
const sharedDirectory = path.dirname(fileURLToPath(import.meta.url));
const consumerDirectory = path.resolve(sharedDirectory, "../..");

if (appName !== "vanilla" && appName !== "react") {
  throw new Error('PACKAGE_CONTRACT_APP must be either "vanilla" or "react".');
}

export default defineConfig({
  testDir: path.resolve(sharedDirectory, "../apps", appName),
  testMatch: "*.pw.ts",
  fullyParallel: false,
  workers: 1,
  outputDir: path.join(consumerDirectory, "test-results"),
  reporter: [["line"], ["html", { open: "never", outputFolder: path.join(consumerDirectory, "playwright-report") }]],
  use: {
    baseURL,
    browserName: "chromium",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node server.mjs",
    cwd: sharedDirectory,
    url: baseURL,
    reuseExistingServer: false,
    env: {
      PACKAGE_CONTRACT_APP: appName,
      PACKAGE_CONTRACT_PORT: String(port),
    },
  },
});
