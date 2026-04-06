import type { Config } from "jest";

const jestConfig: Config = {
  // Ignore compiled `build/` output: tests must live under `src/` to avoid duplicates and stale suites.
  testPathIgnorePatterns: ["/node_modules/", "/e2e/", "<rootDir>/build/"],
  testEnvironment: "jsdom",
  setupFiles: ["<rootDir>/setupJest.js", "jest-canvas-mock"],
  transformIgnorePatterns: [],
  moduleNameMapper: {
    "\\.(css|less)$": "<rootDir>/__mocks__/styleMock.js",
  },
  transform: {
    "^.+\\.(t|j)sx?$": "@swc/jest",
  },
};

export default jestConfig;
