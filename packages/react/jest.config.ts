import type { Config } from "jest";

import baseConfig from "../../jest.config.base";

const config: Config = {
  ...baseConfig,
  displayName: "react",
  rootDir: ".",
  testMatch: ["<rootDir>/src/**/*.test.ts", "<rootDir>/src/**/*.test.tsx"],
  moduleNameMapper: {
    ...baseConfig.moduleNameMapper,
    "^@gravity-ui/graph/(.*)$": "<rootDir>/../graph/src/$1",
    "^@gravity-ui/graph$": "<rootDir>/../graph/src",
  },
};

export default config;

