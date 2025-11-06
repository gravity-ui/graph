import React, { useCallback, useEffect, useRef, useState } from "react";

import { Button, ButtonButtonProps, Flex, Text, TextInput, ThemeProvider } from "@gravity-ui/uikit";
import type { Meta, StoryFn } from "@storybook/react-webpack5";

import { GraphComponent } from "../../../components/canvas/GraphComponent";
import { Graph } from "../../../graph";
import { generatePrettyBlocks } from "../../configurations/generatePretty";
import { GraphComponentStory } from "../../main/GraphEditor";

import "@gravity-ui/uikit/styles/styles.css";

const config = generatePrettyBlocks({ layersCount: 10, connectionsPerLayer: 10, dashedLine: true });

const GraphApp = () => {
  const [transition, setTransition] = useState("1000");
  const [padding, setPadding] = useState("50");
  const [selectedCount, setSelectedCount] = useState(0);

  const graphRef = useRef<Graph | undefined>(undefined);

  useEffect(() => {
    if (!graphRef.current) return undefined;
    const selection = graphRef.current.selectionService.$selection.value;
    const count = Array.from(selection.keys()).reduce((acc, key) => {
      return acc + (selection.get(key)?.size ?? 0);
    }, 0);
    setSelectedCount(count);
    const unsubscribe = graphRef.current.selectionService.$selection.subscribe(() => {
      const selection = graphRef.current.selectionService.$selection.value;
      const count = Array.from(selection.keys()).reduce((acc, key) => {
        return acc + (selection.get(key)?.size ?? 0);
      }, 0);
      setSelectedCount(count);
    });
    return () => unsubscribe();
  }, []);

  const onClick: ButtonButtonProps["onClick"] = useCallback(() => {
    if (!graphRef.current) return;

    // Collect all selected components from all buckets
    const allSelectedComponents: GraphComponent[] = [];
    const selection = graphRef.current.selectionService.$selection.value;

    // Iterate through all entity types in selection
    for (const entityType of selection.keys()) {
      const bucket = graphRef.current.selectionService.getBucket(entityType);
      if (bucket) {
        const components = bucket.$selectedComponents.value;
        allSelectedComponents.push(...components);
      }
    }

    if (allSelectedComponents.length === 0) return;

    // Zoom to the calculated rect
    graphRef.current.zoomTo(allSelectedComponents, {
      transition: Number(transition),
      padding: Number(padding),
    });
  }, [transition, padding]);

  return (
    <ThemeProvider theme={"light"}>
      <Flex className="toolbox" direction={"column"} width={640} gap={2} style={{ marginBottom: "10px" }}>
        <Text>
          Select elements by clicking on them (use Cmd/Ctrl + Click to select multiple elements), then click the button
          below to zoom to the selected elements.
        </Text>
        <Text color="secondary">Selected elements: {selectedCount}</Text>
        <Flex direction={"row"} gap={1}>
          <TextInput type="number" label="transition (ms)" value={transition} onUpdate={setTransition} />
          <TextInput type="number" label="padding (px)" value={padding} onUpdate={setPadding} />
        </Flex>
        <Button onClick={onClick} view="action" disabled={selectedCount === 0}>
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
