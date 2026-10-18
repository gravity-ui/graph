module.exports = {
  testPathIgnorePatterns: ["/node_modules/", "/build/"],
  testEnvironment: "jsdom",
  transformIgnorePatterns: [],
  moduleNameMapper: {
    // Unit tests consume only the core public entrypoint; installed artifacts are tested separately.
    "^@gravity-ui/graph$": "<rootDir>/../graph/src/index.ts",
  },
  transform: { "^.+\\.(t|j)sx?$": "@swc/jest" },
};
