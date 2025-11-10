import React, { useCallback, useEffect, useRef, useState } from "react";

import { Graph, GraphComponent } from "@gravity-ui/graph";
import { Button, ButtonButtonProps, Flex, Text, TextInput, ThemeProvider } from "@gravity-ui/uikit";
import type { Meta, StoryFn } from "@storybook/react-webpack5";

import { generatePrettyBlocks } from "../../configurations/generatePretty";
import { GraphComponentStory } from "../../main/GraphEditor";

import "@gravity-ui/uikit/styles/styles.css";

const config = generatePrettyBlocks({ layersCount: 10, connectionsPerLayer: 10, dashedLine: true });

const GraphApp = () => {
  const [transition, setTransition] = useState("1000");
  const [padding, setPadding] = useState("50");
  const [selectedComponents, setSelectedComponents] = useState<GraphComponent[]>([]);

  const graphRef = useRef<Graph | undefined>(undefined);

  useEffect(() => {
    if (!graphRef.current) return undefined;

    // Get initial value
    setSelectedComponents(graphRef.current.selectionService.$selectedComponents.value);

    // Subscribe to changes
    const unsubscribe = graphRef.current.selectionService.$selectedComponents.subscribe((components) => {
      setSelectedComponents(components);
    });

    return () => unsubscribe();
  }, []);

  const onClick: ButtonButtonProps["onClick"] = useCallback(() => {
    if (!graphRef.current || selectedComponents.length === 0) return;

    // Zoom to the selected components
    graphRef.current.zoomTo(selectedComponents, {
      transition: Number(transition),
      padding: Number(padding),
    });
  }, [selectedComponents, transition, padding]);

  return (
    <ThemeProvider theme={"light"}>
      <Flex className="toolbox" direction={"column"} width={640} gap={2} style={{ marginBottom: "10px" }}>
        <Text>
          Select elements by clicking on them (use Cmd/Ctrl + Click to select multiple elements), then click the button
          below to zoom to the selected elements.
        </Text>
        <Text color="secondary">Selected elements: {selectedComponents.length}</Text>
        <Flex direction={"row"} gap={1}>
          <TextInput type="number" label="transition (ms)" value={transition} onUpdate={setTransition} />
          <TextInput type="number" label="padding (px)" value={padding} onUpdate={setPadding} />
        </Flex>
        <Button onClick={onClick} view="action" disabled={selectedComponents.length === 0}>
          Zoom to Selected Elements
        </Button>
      </Flex>
      <GraphComponentStory graphRef={graphRef} config={config}></GraphComponentStory>
    </ThemeProvider>
  );
};

const meta: Meta = {
  title: "Api/zoomToElements",
  component: GraphApp,
};

export default meta;

export const Default: StoryFn = () => <GraphApp />;
