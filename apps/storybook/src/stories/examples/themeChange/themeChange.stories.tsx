import React, { useCallback, useEffect, useRef, useState } from "react";

import { Graph, TGraphColorsPatch } from "@gravity-ui/graph";
import {
  Flex,
  SegmentedRadioGroup,
  SegmentedRadioGroupOptionProps,
  SegmentedRadioGroupProps,
  ThemeProvider,
} from "@gravity-ui/uikit";
import type { Meta, StoryFn } from "@storybook/react-webpack5";

import { computeCssVariable } from "../../../storyUtils";
import { withAnchorsAndConnectionConfig } from "../../configurations/withAnchorAndConnection";
import { GraphComponentStory } from "../../main/GraphEditor";

import "@gravity-ui/uikit/styles/styles.css";

const graphColors: TGraphColorsPatch = {
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

type TColorGroups = Record<string, Record<string, string | undefined> | undefined>;

function parseTheme(colors: TGraphColorsPatch): TGraphColorsPatch {
  const groups: TColorGroups = colors;
  const parsed: Record<string, Record<string, string>> = {};

  for (const element in groups) {
    const group = groups[element];
    if (!group) continue;
    const parsedGroup: Record<string, string> = {};
    parsed[element] = parsedGroup;
    Object.keys(group).forEach((key) => {
      const value = group[key];
      if (value !== undefined) {
        parsedGroup[key] = computeCssVariable(value);
      }
    });
  }

  return parsed;
}
const options: SegmentedRadioGroupOptionProps[] = [
  { value: "light", content: "Light" },
  { value: "dark", content: "Dark" },
];

const GraphApp = () => {
  const graphRef = useRef<Graph | undefined>(undefined);

  const [theme, setTheme] = useState(options[0].value);

  const onThemeUpdate: SegmentedRadioGroupProps["onUpdate"] = useCallback((value) => {
    setTheme(value);
  }, []);

  // The values of css variables occur after the theme is changed.
  useEffect(() => {
    const graph = graphRef.current;
    if (!graph) {
      return;
    }
    graph.api.updateGraphColors(parseTheme(graphColors));
  }, [theme]);

  return (
    <ThemeProvider theme={theme}>
      <Flex direction={"column"} width={320} gap={2} style={{ marginBottom: "10px" }}>
        <SegmentedRadioGroup name="group2" defaultValue={options[0].value} options={options} onUpdate={onThemeUpdate} />
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
