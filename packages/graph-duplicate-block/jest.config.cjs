module.exports = {
  testPathIgnorePatterns: ["/node_modules/", "/build/"],
  testEnvironment: "jsdom",
  setupFiles: ["<rootDir>/../graph/setupJest.cjs", "jest-canvas-mock"],
  transformIgnorePatterns: [],
  moduleNameMapper: {
    "^@gravity-ui/graph$": "<rootDir>/../graph/src/index.ts",
    "\\.(css|less)$": "<rootDir>/../graph/__mocks__/styleMock.cjs",
  },
  transform: { "^.+\\.(t|j)sx?$": "@swc/jest" },
};
