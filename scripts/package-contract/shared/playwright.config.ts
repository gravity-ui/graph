import { defineConfig } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const port = Number(process.env.PACKAGE_CONTRACT_PORT ?? "4173");
const baseURL = `http://127.0.0.1:${port}`;
const sharedDirectory = path.dirname(fileURLToPath(import.meta.url));
const consumerDirectory = path.resolve(sharedDirectory, "../../..");
const appDirectory = path.resolve(consumerDirectory, process.env.PACKAGE_CONTRACT_APP_DIR ?? "");

export default defineConfig({
  testDir: appDirectory,
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
      PACKAGE_CONTRACT_APP_DIR: appDirectory,
      PACKAGE_CONTRACT_PORT: String(port),
    },
  },
});
