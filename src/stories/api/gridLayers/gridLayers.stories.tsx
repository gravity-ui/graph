import React, { useCallback, useRef, useState } from "react";

import { Button, Flex, TextInput, ThemeProvider } from "@gravity-ui/uikit";
import type { Meta, StoryFn } from "@storybook/react-webpack5";

import { Graph } from "../../../graph";
import { initGraphColors } from "../../../graphConfig";
import { generatePrettyBlocks } from "../../configurations/generatePretty";
import { GraphComponentStory } from "../../main/GraphEditor";

import "@gravity-ui/uikit/styles/styles.css";

const config = generatePrettyBlocks({ layersCount: 10, connectionsPerLayer: 10, dashedLine: true });

const DARK_CANVAS_COLORS = {
  belowLayerBackground: "#2d2d2d",
  layerBackground: "#3d3d3d",
  dots: "#6d6d6d",
  border: "#2d2d2d",
};

const GraphApp = () => {
  const graphRef = useRef<Graph | undefined>(undefined);
  const [fadeFrom, setFadeFrom] = useState("6");
  const [fadeTo, setFadeTo] = useState("18");
  const [dark, setDark] = useState(false);

  const onApplyFade = useCallback(() => {
    graphRef.current?.setConstants({
      system: { GRID_LAYER_FADE: [Number(fadeFrom), Number(fadeTo)] },
    });
  }, [fadeFrom, fadeTo]);

  const onToggleTheme = useCallback(() => {
    const nextDark = !dark;
    graphRef.current?.setColors({ canvas: nextDark ? DARK_CANVAS_COLORS : initGraphColors.canvas });
    setDark(nextDark);
  }, [dark]);

  return (
    <ThemeProvider theme={dark ? "dark" : "light"}>
      <Flex direction={"row"} gap={4} alignItems={"flex-end"} style={{ marginBottom: "10px" }}>
        <TextInput type="number" label="fade from, px" value={fadeFrom} onUpdate={setFadeFrom} />
        <TextInput type="number" label="fade to, px" value={fadeTo} onUpdate={setFadeTo} />
        <Button onClick={onApplyFade} view="action">
          apply fade
        </Button>
        <Button onClick={onToggleTheme}>{dark ? "light canvas" : "dark canvas"}</Button>
      </Flex>
      <GraphComponentStory graphRef={graphRef} config={config}></GraphComponentStory>
    </ThemeProvider>
  );
};

const meta: Meta = {
  title: "Api/gridLayers",
  component: GraphApp,
};

export default meta;

export const Default: StoryFn = () => <GraphApp />;
