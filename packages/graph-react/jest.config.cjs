module.exports = {
  testPathIgnorePatterns: ["/node_modules/", "/build/"],
  testEnvironment: "jsdom",
  setupFiles: ["<rootDir>/setupJest.cjs", "jest-canvas-mock"],
  transformIgnorePatterns: [],
  moduleNameMapper: {
    // Unit tests consume only the core public entrypoint; installed artifacts are tested separately.
    "^@gravity-ui/graph$": "<rootDir>/../graph/src/index.ts",
    "\\.(css|less)$": "<rootDir>/__mocks__/styleMock.cjs",
  },
  transform: { "^.+\\.(t|j)sx?$": "@swc/jest" },
};
