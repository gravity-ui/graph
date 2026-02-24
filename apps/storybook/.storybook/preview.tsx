import type { Preview } from "@storybook/react-webpack5";
import React, { StrictMode } from "react";
import { ThemeProvider } from "@gravity-ui/uikit";

import "./styles/global.css";
import "@gravity-ui/uikit/styles/styles.css";
import "@gravity-ui/graph/styles";
import "@gravity-ui/graph-react/styles";

const preview: Preview = {
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
