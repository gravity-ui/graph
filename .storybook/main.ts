import type { StorybookConfig } from "@storybook/react-webpack5";
import type { Options } from "@swc/core";
const config: StorybookConfig = {
  stories: ["../src/**/*.mdx", "../src/**/*.stories.@(js|jsx|mjs|ts|tsx)"],

  addons: ["@storybook/addon-styling-webpack", "@storybook/addon-webpack5-compiler-swc", "@storybook/addon-docs"],

  framework: {
    name: "@storybook/react-webpack5",
    options: {},
  },
  swc: (config: Options): Options => {
    return {
      ...config,
      // Apply your custom SWC configuration
    };
  },

  docs: {},

  core: {
    disableTelemetry: true,
    disableWhatsNewNotifications: true,
  },

  typescript: {
    reactDocgen: "react-docgen-typescript",
    reactDocgenTypescriptOptions: {
      // Stories use a dedicated tsconfig with strict off (see src/stories/tsconfig.json).
      tsconfigPath: "src/stories/tsconfig.json",
    },
  },
};
export default config;
