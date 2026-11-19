import React, { StrictMode } from "react";

import { ThemeProvider } from "@gravity-ui/uikit";
import type { Preview } from "@storybook/react-webpack5";

import "./styles/global.css";
import "@gravity-ui/graph/styles.css";
import "@gravity-ui/graph-react/styles.css";
import "@gravity-ui/uikit/styles/styles.css";

const preview: Preview = {
  parameters: {
    options: { storySort: { order: ["Playground", "Scene", ["Examples", "Diagnostics"], "*"] } },
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
