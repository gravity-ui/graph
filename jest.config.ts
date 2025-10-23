import type { Config } from "jest";

const jestConfig: Config = {
  projects: ["<rootDir>/packages/graph", "<rootDir>/packages/react"],
  testPathIgnorePatterns: ["/node_modules/", "/build/", "/dist/", "/.rollup.cache/"],
};

export default jestConfig;
