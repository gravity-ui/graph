import type { Preview } from "@storybook/react-webpack5";
import React, { StrictMode } from "react";
import {
  ThemeProvider,
} from "@gravity-ui/uikit";

import './styles/global.css';
import "@gravity-ui/uikit/styles/styles.css";

const preview: Preview = {
  parameters: {
    options: {
      storySort: {
        order: [
          "Introduction",
          "Getting Started",
          "Documentation",
          "Playground",
          "Examples",
          "API",
          "Plugins",
          "Canvas",
        ],
      },
    },
  },
  decorators: [
      (Story) => (
        <StrictMode>
          {/* To load styles from @gravity-ui/uikit */}
          <ThemeProvider></ThemeProvider>
          <Story />
        </StrictMode>
      ),
    ],
};

export default preview;
