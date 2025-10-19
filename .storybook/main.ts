import type { StorybookConfig } from "@storybook/react-webpack5";
import type { Options } from "@swc/core";
import path from "path";

const config: StorybookConfig = {
  stories: ["../packages/stories/src/**/*.mdx", "../packages/stories/src/**/*.stories.@(js|jsx|mjs|ts|tsx)"],

  addons: ["@storybook/addon-styling-webpack", "@storybook/addon-webpack5-compiler-swc", "@storybook/addon-docs"],

  framework: {
    name: "@storybook/react-webpack5",
    options: {},
  },

  webpackFinal: async (config) => {
    // Aliases for dev mode (use source files directly)
    config.resolve = config.resolve || {};
    config.resolve.alias = {
      ...config.resolve.alias,
      "@gravity-ui/graph": path.resolve(__dirname, "../packages/graph/src"),
      "@gravity-ui/graph-react": path.resolve(__dirname, "../packages/react/src"),
    };
    return config;
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
  },
};
export default config;
