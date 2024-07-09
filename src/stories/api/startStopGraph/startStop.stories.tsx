import { Button, Flex, ThemeProvider } from "@gravity-ui/uikit";
import "@gravity-ui/uikit/styles/styles.css";
import type { Meta, StoryFn } from "@storybook/react";
import React, { useState } from "react";
import { TBlock } from "../../../components/canvas/blocks/Block";
import { Graph, GraphState } from "../../../graph";
import { GraphCanvas, useGraph } from "../../../react-component";
import { useFn } from "../../../utils/hooks/useFn";
import { generatePrettyBlocks } from "../../configurations/generatePretty";
import { BlockStory } from "../../main/Block";

const config = generatePrettyBlocks(10, 10, true, {}, 0);

const exampleGraph = new Graph({
  configurationName: "start-stop",
  blocks: config.blocks,
  connections: config.connections,
  settings: config.settings,
  layers: config.layers, // layers init only once
});

let initialized = false;
const GraphApp = () => {
  const { graph, start, stop, zoomTo, setEntities } = useGraph({ graph: exampleGraph });
  const [visible, setVisible] = useState(false);
  const [started, setStarted] = useState(false);

  const toggleGraph = () => {
    setVisible(!visible);
  };
  const toggleStarting = () => {
    if (graph.state === GraphState.READY) {
      stop();
    } else {
      start();
      graph.zoomTo("center", { padding: 300 });
    }
  };

  const renderBlockFn = useFn((graphObject: Graph, block: TBlock) => {
    return <BlockStory graph={graphObject} block={block} />;
  });

  const update = () => {
    const config = generatePrettyBlocks(10, 10, true, {}, Math.random() * 1000);
    setEntities({
      blocks: config.blocks,
      connections: config.connections,
    });
  };

  return (
    <ThemeProvider theme={"light"}>
      <Flex className="toolbox" direction={"column"} width={320} gap={2} style={{ marginBottom: "10px" }}>
        <Flex>
          <Button onClick={toggleGraph} view="action">
            {visible ? "unmount graph" : "mount graph"}
          </Button>
          <Button onClick={toggleStarting} view="action" disabled={!visible}>
            {started ? "stop graph" : "start graph"}
          </Button>
        </Flex>
        <Flex>
          <Button onClick={update} view="action">
            Update
          </Button>
        </Flex>
      </Flex>
      {visible && (
        <GraphCanvas
          className="graph"
          graph={graph}
          renderBlock={renderBlockFn}
          onStateChanged={({ state }) => {
            setStarted(state === GraphState.READY);
            if (state === GraphState.READY && !initialized) {
              zoomTo("center", { padding: 200 });
              initialized = true;
            }
          }}
        />
      )}
    </ThemeProvider>
  );
};

const meta: Meta = {
  title: "Api/startStop",
  component: GraphApp,
};

export default meta;

export const Default: StoryFn = () => <GraphApp />;
