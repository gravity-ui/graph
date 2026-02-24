import type { StorybookConfig } from "@storybook/react-webpack5";
import type { Options } from "@swc/core";
const config: StorybookConfig = {
  stories: ["../src/**/*.mdx", "../src/**/*.stories.@(js|jsx|mjs|ts|tsx)"],

  addons: [
    "@storybook/addon-styling-webpack",
    "@storybook/addon-webpack5-compiler-swc",
    "@storybook/addon-docs",
    "@github-ui/storybook-addon-performance-panel",
  ],

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
};
export default config;
