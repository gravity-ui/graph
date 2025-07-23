import type { Preview } from "@storybook/react-webpack5";
import React, { StrictMode } from "react";
import { ThemeProvider } from "@gravity-ui/uikit";

import './styles/global.css';

const preview: Preview = {
    decorators: [
      (Story) => (
        <StrictMode>
          <ThemeProvider>
            <Story />
          </ThemeProvider>
        </StrictMode>
      ),
    ],
};

export default preview;
