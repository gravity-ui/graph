import "@gravity-ui/uikit/styles/styles.css";
import type { Meta, StoryFn } from "@storybook/react";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { GraphComponentStory } from "../../main/GraphEditor";
import { Flex, RadioButton, RadioButtonOption, RadioButtonProps, ThemeProvider } from "@gravity-ui/uikit";
import { Graph } from "../../../graph";
import { TGraphColors } from "../../../graphConfig";
import { withAnchorsAndConnectionConfig } from "../../configurations/withAnchorAndConnection";
import { computeCssVariable } from "../../../utils/functions";

const graphColors: TGraphColors = {
  anchor: {
    background: "var(--g-color-private-cool-grey-800-solid)",
    selectedBorder: "var(--g-color-private-yellow-550-solid)",
  },
  block: {
    background: "var(--g-color-private-cool-grey-250-solid)",
    text: "var(--g-color-private-blue-1000-solid)",
    border: "var(--g-color-private-cool-grey-1000-solid)",
    selectedBorder: "var(--g-color-private-yellow-550-solid)",
  },
  canvas: {
    belowLayerBackground: "var(--g-color-base-generic)",
    border: "var(--g-color-text-secondary)",
    dots: "var(--g-color-text-hint)",
    layerBackground: "var(--g-color-base-background)",
  },
  connection: {
    background: "var(--g-color-private-cool-grey-1000-solid)",
    selectedBackground: "var(--g-color-private-yellow-550-solid)",
  },
  connectionLabel: {
    background: "var(--g-color-base-generic)",
    hoverBackground: "var(--g-color-base-generic-accent)",
    hoverText: "var(--g-color-private-blue-1000-solid)",
    selectedBackground: "var(--g-color-private-yellow-550-solid)",
    selectedText: "var(--g-color-private-blue-1000-solid)",
    text: "var(--g-color-private-blue-1000-solid)",
  },
  selection: {
    border: "var(--g-color-private-yellow-550-solid)",
    background: "var(--g-color-base-selection-hover)",
  },
};

function parseTheme(colors: TGraphColors): TGraphColors {
  const parsed: TGraphColors = {};

  for (const element in colors) {
    parsed[element] = {};
    Object.keys(colors[element]).forEach((key) => (parsed[element][key] = computeCssVariable(colors[element][key])));
  }

  return parsed;
}
const options: RadioButtonOption[] = [
  { value: "light", content: "Light" },
  { value: "dark", content: "Dark" },
];

const GraphApp = () => {
  const graphRef = useRef<Graph | undefined>(undefined);

  const [theme, setTheme] = useState(options[0].value);

  const onThemeUpdate: RadioButtonProps["onUpdate"] = useCallback((value) => {
    setTheme(value);
  }, []);

  // The values of css variables occur after the theme is changed.
  useEffect(() => {
    graphRef.current.api.updateGraphColors(parseTheme(graphColors));
  }, [theme]);

  return (
    <ThemeProvider theme={theme}>
      <Flex direction={"column"} width={320} gap={2} style={{ marginBottom: "10px" }}>
        <RadioButton name="group2" defaultValue={options[0].value} options={options} onUpdate={onThemeUpdate} />
      </Flex>
      <GraphComponentStory graphRef={graphRef} config={withAnchorsAndConnectionConfig} colors={graphColors} />
    </ThemeProvider>
  );
};

const meta: Meta = {
  title: "Examples/Theme",
  component: GraphApp,
};

export default meta;

export const Default: StoryFn = () => <GraphApp />;
