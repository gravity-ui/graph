import type { Config } from 'jest';

const jestConfig: Config = {
  testEnvironment: "jsdom",
  setupFiles: ["<rootDir>/setupJest.js", "jest-canvas-mock"],
  transformIgnorePatterns: [],
  moduleNameMapper: {
    '^@gravity-ui/graph$': '<rootDir>/packages/graph/src',
    '^@gravity-ui/graph-react$': '<rootDir>/packages/react/src',
    '\\.(css|less)$': '<rootDir>/__mocks__/styleMock.js',
  },
  transform: {
    "^.+\\.(t|j)sx?$": "@swc/jest",
  },
};

export default jestConfig;
