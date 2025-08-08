import type { StorybookConfig } from "@storybook/react-webpack5";
import type { Options } from '@swc/core';
const config: StorybookConfig = {
  stories: ["../src/**/*.mdx", "../src/**/*.stories.@(js|jsx|mjs|ts|tsx)"],

  addons: [
    // "@storybook/addon-links",
    "@storybook/addon-essentials",
    // "@storybook/addon-onboarding",
    // "@storybook/addon-interactions",
    "@storybook/addon-styling-webpack",
    "@storybook/addon-webpack5-compiler-swc",
    // "@chromatic-com/storybook"
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
    reactDocgen: "react-docgen-typescript"
  }
};
export default config;
