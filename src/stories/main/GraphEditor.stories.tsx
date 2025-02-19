import React, { useEffect, useMemo, useRef } from "react";

import { ThemeProvider } from "@gravity-ui/uikit";
import type { Meta, StoryObj } from "@storybook/react";
import merge from "lodash/merge";

import { Graph, TGraphConfig } from "../../graph";
import { TGraphConstants, initGraphConstants } from "../../graphConfig";
import { TGraphSettingsConfig } from "../../store";
import { ECanChangeBlockGeometry } from "../../store/settings";
import { RecursivePartial } from "../../utils/types/helpers";
import { CustomLayerConfig } from "../configurations/CustomLayerConfig";
import { oneBezierConnectionConfig } from "../configurations/bezierConnection";
import { coloredConnections } from "../configurations/coloredConnections";
import { customSchematicViewConfig } from "../configurations/customBlocksView";
import { generatePrettyBlocks } from "../configurations/generatePretty";
import { oneBlockConfig } from "../configurations/oneBlock";
import { oneStraightConfig } from "../configurations/oneConnection";
import { verticalGraphConfig } from "../configurations/verticalGraph";
import { withAnchorsConfig } from "../configurations/withAnchors";

import { GraphComponentStory } from "./GraphEditor";

import "@gravity-ui/uikit/styles/styles.css";

const GraphApp = ({
  config,
  constants,
  ...settings
}: { config: TGraphConfig; constants?: RecursivePartial<TGraphConstants> } & Partial<TGraphSettingsConfig>) => {
  const graphRef = useRef<Graph | undefined>(undefined);

  useEffect(() => {
    if (graphRef.current) {
      graphRef.current.updateSettings(settings);
    }
  }, [settings, graphRef]);

  const graphConstants = useMemo(() => {
    return merge(initGraphConstants, constants) as unknown as TGraphConstants;
  }, [constants]);

  return (
    <ThemeProvider theme={"light"}>
      <GraphComponentStory graphRef={graphRef} config={config} constants={graphConstants} />
    </ThemeProvider>
  );
};

const meta: Meta<typeof GraphApp> = {
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
    canChangeBlockGeometry: {
      control: "select",
      options: [ECanChangeBlockGeometry.ALL, ECanChangeBlockGeometry.ONLY_SELECTED, ECanChangeBlockGeometry.NONE],
      description: "allow drag blocks",
    },
    canCreateNewConnections: {
      control: "boolean",
      description: "Allow create new connection via GraphEditor",
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
  },
  args: {
    useBezierConnections: true,
    showConnectionLabels: false,
    canDragCamera: true,
    canZoomCamera: true,
    canChangeBlockGeometry: ECanChangeBlockGeometry.ALL,
    canCreateNewConnections: true,
    scaleFontSize: 1,
    showConnectionArrows: true,
  },
};

export default meta;
type Story = StoryObj<typeof GraphApp>;

export const OneBlock: Story = {
  render: (args) => <GraphApp config={oneBlockConfig} {...args}></GraphApp>,
};

export const OneStraightConnection: Story = {
  args: {
    useBezierConnections: false,
  },
  render: (args) => <GraphApp config={oneStraightConfig} {...args}></GraphApp>,
};

export const OneBezierConnection: Story = {
  render: (args) => <GraphApp config={oneBezierConnectionConfig} {...args}></GraphApp>,
};

export const ColoredConnections: Story = {
  render: (args) => <GraphApp config={coloredConnections} {...args}></GraphApp>,
};

export const WithAnchors: Story = {
  render: (args) => <GraphApp config={withAnchorsConfig} {...args}></GraphApp>,
};

export const HundredBlocks: Story = {
  render: (args) => (
    <GraphApp
      config={generatePrettyBlocks({ layersCount: 10, connectionsPerLayer: 100, dashedLine: true })}
      {...args}
    ></GraphApp>
  ),
};

export const ThousandBlocks: Story = {
  render: (args) => (
    <GraphApp config={generatePrettyBlocks({ layersCount: 25, connectionsPerLayer: 200 })} {...args}></GraphApp>
  ),
};

export const FiveThousandsBlocks: Story = {
  args: {
    useBezierConnections: false,
  },
  render: (args) => (
    <GraphApp config={generatePrettyBlocks({ layersCount: 30, connectionsPerLayer: 300 })} {...args}></GraphApp>
  ),
};

export const GraphStressTest: Story = {
  args: {
    useBezierConnections: false,
  },
  render: (args) => {
    return (
      <GraphApp
        config={generatePrettyBlocks({
          layersCount: 110,
          connectionsPerLayer: 1000,
          overrideSettings: { useBezierConnections: false },
        })}
        {...args}
      ></GraphApp>
    );
  },
};
export const NirvanaMaxGraphTest: Story = {
  render: (args) => {
    return (
      <GraphApp
        config={generatePrettyBlocks({
          layersCount: 55,
          connectionsPerLayer: 400,
          overrideSettings: { useBezierConnections: true },
        })}
        {...args}
      ></GraphApp>
    );
  },
};

export const CustomSchematicBlock: Story = {
  render: (args) => <GraphApp config={customSchematicViewConfig} {...args}></GraphApp>,
};
export const CustomLayer: Story = {
  render: (args) => <GraphApp config={CustomLayerConfig} {...args}></GraphApp>,
};

export const VerticalGraph: Story = {
  render: (args) => <GraphApp config={verticalGraphConfig} {...args}></GraphApp>,
};

export const SnappingGraph: Story = {
  render: (args) => (
    <GraphApp
      config={generatePrettyBlocks({ layersCount: 4, connectionsPerLayer: 100 })}
      {...args}
      constants={{ block: { SNAPPING_GRID_SIZE: 60 } }}
    ></GraphApp>
  ),
};

//
// export const ThousandBlocksAnd9000Connections: Story = {
//   render: () => <GraphApp config={generatePrettyBlocks(25, 15)}></GraphApp>,
// };
//
// export const FiveThousandBlocksAnd5000Connections: Story = {
//   render: () => <GraphApp config={generatePrettyBlocks(40, 500)}></GraphApp>,
// };
