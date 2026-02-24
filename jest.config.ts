import type { Config } from "jest";

const jestConfig: Config = {
  testPathIgnorePatterns: ["/node_modules/", "/e2e/"],
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
