import "@gravity-ui/uikit/styles/styles.css";
import type { Meta, StoryFn } from "@storybook/react";
import React, { useCallback, useRef, useState } from "react";
import { GraphComponentStory } from "../../main/GraphEditor";
import { Button, ButtonProps, Flex, ThemeProvider } from "@gravity-ui/uikit";
import { Graph } from "../../../graph";
import { oneBlockConfig } from "../../configurations/oneBlock";
import { TGraphColors } from "graphConfig";

const GraphApp = () => {
  const [colors, setColors] = useState<TGraphColors>();
  const graphRef = useRef<Graph | undefined>(undefined);

  const updateReactComponentsColors = useCallback((colors) => {
    setColors(colors);
  }, []);

  const onRedClick: ButtonProps["onClick"] = useCallback(() => {
    graphRef.current.api.updateGraphColors({ block: { background: "#febcb8" } });

    updateReactComponentsColors({ block: { background: "#febcb8" } });
  }, [updateReactComponentsColors]);

  const onGreenClick: ButtonProps["onClick"] = useCallback(() => {
    graphRef.current.api.updateGraphColors({ block: { background: "#b7e6b0" } });

    updateReactComponentsColors({ block: { background: "#b7e6b0" } });
  }, [updateReactComponentsColors]);

  const onYellowClick: ButtonProps["onClick"] = useCallback(() => {
    graphRef.current.api.updateGraphColors({ block: { background: "#fee0b0" } });

    updateReactComponentsColors({ block: { background: "#fee0b0" } });
  }, [updateReactComponentsColors]);

  return (
    <ThemeProvider theme={"light"}>
      <Flex className="toolbox" direction={"column"} width={320} gap={2} style={{ marginBottom: "10px" }}>
        <Button onClick={onRedClick} view="action">
          Red
        </Button>
        <Button onClick={onYellowClick} view="action">
          Yellow
        </Button>
        <Button onClick={onGreenClick} view="action">
          Green
        </Button>
      </Flex>
      <GraphComponentStory graphRef={graphRef} config={oneBlockConfig} colors={colors} />
    </ThemeProvider>
  );
};

const meta: Meta = {
  title: "Api/updateGraphColors",
  component: GraphApp,
};

export default meta;

export const Default: StoryFn = () => <GraphApp />;
