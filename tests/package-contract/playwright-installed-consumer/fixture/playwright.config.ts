import { defineConfig } from "@playwright/test";

const port = Number(process.env.PACKAGE_CONTRACT_PORT ?? "4173");
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: ".",
  testMatch: "graph.pw.ts",
  fullyParallel: false,
  workers: 1,
  outputDir: "test-results",
  reporter: [["line"], ["html", { open: "never" }]],
  use: {
    baseURL,
    browserName: "chromium",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node server.mjs",
    url: baseURL,
    reuseExistingServer: false,
    env: {
      PACKAGE_CONTRACT_PORT: String(port),
    },
  },
});
