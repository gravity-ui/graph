/** @type {import("jest").Config} */
const jestConfig = {
  testPathIgnorePatterns: ["/node_modules/", "/build/", "/scripts/"],
  testEnvironment: "jsdom",
  setupFiles: ["<rootDir>/setupJest.cjs", "jest-canvas-mock"],
  transformIgnorePatterns: [],
  moduleNameMapper: {
    "\\.(css|less)$": "<rootDir>/__mocks__/styleMock.cjs",
  },
  transform: {
    "^.+\\.(t|j)sx?$": "@swc/jest",
  },
};

export default jestConfig;
