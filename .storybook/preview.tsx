import type { Preview } from "@storybook/react-webpack5";
import React, { StrictMode } from "react";

import './styles/global.css';

const preview: Preview = {
    decorators: [
      (Story) => (
        <StrictMode>
          <Story />
        </StrictMode>
      ),
    ],
};

export default preview;
