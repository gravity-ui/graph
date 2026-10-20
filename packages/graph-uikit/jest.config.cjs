module.exports = {
  testPathIgnorePatterns: ["/node_modules/", "/build/"],
  testEnvironment: "jsdom",
  setupFiles: ["<rootDir>/setupJest.cjs", "jest-canvas-mock"],
  transformIgnorePatterns: [],
  moduleNameMapper: {
    // Unit tests consume the sibling packages' public entrypoints from source.
    "^@gravity-ui/graph$": "<rootDir>/../graph/src/index.ts",
    "^@gravity-ui/graph-react$": "<rootDir>/../graph-react/src/index.ts",
    "^@gravity-ui/graph-connection-editing$": "<rootDir>/../graph-connection-editing/src/index.ts",
    "\\.(css|less)$": "<rootDir>/__mocks__/styleMock.cjs",
  },
  transform: { "^.+\\.(t|j)sx?$": "@swc/jest" },
};
