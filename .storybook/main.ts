import type { StorybookConfig } from "@storybook/react-webpack5";
import type { Options } from "@swc/core";
const config: StorybookConfig = {
  stories: ["../stories/**/*.mdx", "../stories/**/*.stories.@(js|jsx|mjs|ts|tsx)"],

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
  },

  webpackFinal: async (config) => {
    if (config.resolve) {
      config.resolve.alias = {
        ...config.resolve.alias,
        "@gravity-ui/graph": require("path").resolve(__dirname, "../packages/graph/src"),
        "@gravity-ui/graph-react": require("path").resolve(__dirname, "../packages/graph-react/src"),
      };
    }
    return config;
  },
};
export default config;
