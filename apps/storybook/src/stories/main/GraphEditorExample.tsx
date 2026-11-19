import React, { useEffect, useRef } from "react";

import { ECanDrag, Graph, TGraphConfig, TGraphSettingsConfig, TStyleRule } from "@gravity-ui/graph";
import { ThemeProvider } from "@gravity-ui/uikit";
import type { Meta } from "@storybook/react-webpack5";

import { GraphComponentStory, TGraphComponentProps } from "./GraphEditor";

export const GraphApp = ({
  config,
  constants,
  rules,
  ...settings
}: {
  config: TGraphConfig;
  constants?: TGraphComponentProps["constants"];
  /** Style rules of the story's custom blocks, registered on the graph's scene while the story is mounted. */
  rules?: readonly TStyleRule[];
} & Partial<TGraphSettingsConfig>) => {
  const graphRef = useRef<Graph | undefined>(undefined);

  useEffect(() => graphRef.current?.scene.styles.add(rules ?? []), [rules]);

  useEffect(() => {
    if (graphRef.current) {
      graphRef.current.updateSettings(settings);
    }
  }, [settings, graphRef]);

  return (
    <ThemeProvider theme={"light"}>
      <GraphComponentStory graphRef={graphRef} config={config} constants={constants} />
    </ThemeProvider>
  );
};

export const graphEditorMeta: Meta<typeof GraphApp> = {
  component: GraphApp,
  parameters: {
    layout: "fullscreen",
  },
  argTypes: {
    canDragCamera: {
      control: "boolean",
      description: "Allow drag camera's viewport",
    },
    canZoomCamera: {
      control: "boolean",
      description: "Allow zoom camera",
    },
    canDrag: {
      control: "select",
      options: [ECanDrag.ALL, ECanDrag.ONLY_SELECTED, ECanDrag.NONE],
      description: "allow drag blocks",
    },
    showConnectionArrows: {
      control: "boolean",
      description: "Show connection arrow",
    },
    useBezierConnections: {
      control: "boolean",
      description: "use bezier connections. May be slow for giant graphs",
    },
    showConnectionLabels: {
      control: "boolean",
      description: "Render connection's label",
    },
    viewportCulling: {
      control: "boolean",
      description: "Cull canvas components by the viewport; off walks every component without viewport culling",
    },
  },
  args: {
    useBezierConnections: true,
    showConnectionLabels: false,
    canDragCamera: true,
    canZoomCamera: true,
    canDrag: ECanDrag.ALL,
    scaleFontSize: 1,
    showConnectionArrows: true,
    viewportCulling: true,
  },
};
