import type { Config } from "jest";

const baseConfig: Config = {
  testEnvironment: "jsdom",
  setupFiles: ["<rootDir>/../../setupJest.js", "jest-canvas-mock"],
  transformIgnorePatterns: ["/node_modules/(?!@preact/signals-core)"],
  testPathIgnorePatterns: ["/node_modules/", "/build/", "/dist/", "/.rollup.cache/"],
  moduleNameMapper: {
    "^@preact/signals-core$":
      "<rootDir>/../../node_modules/@preact/signals-core/dist/signals-core.mjs",
    "\\.(css|less)$": "<rootDir>/../../__mocks__/styleMock.js",
  },
  transform: {
    "^.+\\.(t|j)sx?$": "@swc/jest",
  },
  extensionsToTreatAsEsm: [".ts", ".tsx"],
};

export default baseConfig;

