import React, { useEffect, useState } from "react";

import { Button, Flex, Switch, Text } from "@gravity-ui/uikit";
import type { Meta, StoryObj } from "@storybook/react";

import { TBlock } from "../../../components/canvas/blocks/Block";
import { Graph } from "../../../index";
import { DevToolsLayer } from "../../../plugins/devtools/DevToolsLayer";
import { GraphCanvas, GraphLayer, GraphPortal, useGraph } from "../../../react-components";
import { generatePrettyBlocks } from "../../configurations/generatePretty";
import { BlockStory } from "../../main/Block";

import "@gravity-ui/uikit/styles/styles.css";

// Helper component to render blocks
const RenderBlock = (graph: Graph, block: TBlock) => <BlockStory graph={graph} block={block} />;

// Main story component
const DeclarativeComponentsStory = () => {
  const { graph, setEntities, start } = useGraph({});
  const [showDevTools, setShowDevTools] = useState(true);
  const [showControls, setShowControls] = useState(true);
  const [showInfo, setShowInfo] = useState(true);

  useEffect(() => {
    if (graph) {
      const { blocks, connections } = generatePrettyBlocks({ layersCount: 5, connectionsPerLayer: 10 });
      setEntities({ blocks, connections });
      start();
    }
  }, [graph, setEntities, start]);

  if (!graph) return <div>Loading...</div>;

  return (
    <div style={{ width: "100vw", height: "100vh", position: "relative" }}>
      <GraphCanvas graph={graph} renderBlock={RenderBlock}>
        {/* Declarative Layer Component */}
        {showDevTools && <GraphLayer layer={DevToolsLayer} />}

        {/* Declarative Portal Component - Basic Usage */}
        {showControls && (
          <GraphPortal>
            <div
              style={{
                position: "absolute",
                top: "20px",
                right: "20px",
                background: "rgba(255, 255, 255, 0.9)",
                padding: "16px",
                borderRadius: "8px",
                boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
                zIndex: 1000,
              }}
            >
              <Text variant="header-2" style={{ marginBottom: "12px" }}>
                Graph Controls
              </Text>
              <Flex direction="column" gap="8">
                <Switch checked={showDevTools} onUpdate={setShowDevTools}>
                  Show DevTools
                </Switch>
                <Switch checked={showInfo} onUpdate={setShowInfo}>
                  Show Info Panel
                </Switch>
                <Button size="s" onClick={() => graph.zoomTo("center", { padding: 200 })}>
                  Center View
                </Button>
                <Button size="s" onClick={() => graph.zoomTo("center", { padding: 50 })}>
                  Fit to View
                </Button>
              </Flex>
            </div>
          </GraphPortal>
        )}

        {/* Declarative Portal Component - Function Usage */}
        {showInfo && (
          <GraphPortal>
            {(layer, graph) => (
              <div
                style={{
                  position: "absolute",
                  bottom: "20px",
                  left: "20px",
                  background: "rgba(255, 255, 255, 0.9)",
                  padding: "16px",
                  borderRadius: "8px",
                  boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
                  zIndex: 1000,
                  maxWidth: "300px",
                }}
              >
                <Text variant="header-2" style={{ marginBottom: "12px" }}>
                  Graph Info
                </Text>
                <Flex direction="column" gap="8">
                  <Text variant="body-2">
                    <strong>Blocks:</strong> {graph.rootStore.blocksList.$blocks.value.length}
                  </Text>
                  <Text variant="body-2">
                    <strong>Connections:</strong> {graph.rootStore.connectionsList.$connections.value.length}
                  </Text>
                  <Text variant="body-2">
                    <strong>Camera Scale:</strong> {graph.cameraService.getCameraScale().toFixed(2)}x
                  </Text>
                  <Text variant="body-2">
                    <strong>Portal Layer:</strong> Active
                  </Text>
                  <Button size="s" onClick={() => layer?.hide()} disabled={!layer}>
                    Hide This Panel
                  </Button>
                </Flex>
              </div>
            )}
          </GraphPortal>
        )}
      </GraphCanvas>
    </div>
  );
};

// Story metadata
const meta: Meta<typeof DeclarativeComponentsStory> = {
  title: "React/Layers",
  component: DeclarativeComponentsStory,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component: `
## Declarative Layers

This story demonstrates the new declarative React components that simplify working with graph layers and HTML overlays.

### GraphLayer Component

The \`GraphLayer\` component provides a declarative way to add existing Layer classes to the graph:

\`\`\`tsx
<GraphLayer
  layer={DevToolsLayer}
  showRuler={true}
  rulerSize={20}
  showGrid={true}
/>
\`\`\`

**Features:**
- Automatically manages layer lifecycle
- Passes props to layer constructor
- Provides layer instance through ref if needed
- Handles cleanup when component unmounts

### GraphPortal Component

The \`GraphPortal\` component allows you to render HTML content as an overlay on top of the graph:

**Basic Usage:**
\`\`\`tsx
<GraphPortal>
  <div className="controls">Graph Controls</div>
</GraphPortal>
\`\`\`

**Function Usage (with layer access):**
\`\`\`tsx
<GraphPortal>
  {(layer, graph) => (
    <div className="info">
      <p>Blocks: {graph.blocks.length}</p>
      <button onClick={() => layer.setVisible(false)}>
        Hide Panel
      </button>
    </div>
  )}
</GraphPortal>
\`\`\`

**Features:**
- Renders HTML content in a portal
- Automatically positions content relative to graph
- Can access layer instance and graph for advanced interactions
- Handles graph state changes automatically
- Supports both children and render functions

### Benefits Over Imperative Approach

- **Simpler API**: No need to manually manage layer lifecycle
- **React-like**: Familiar declarative pattern
- **Automatic cleanup**: Components handle cleanup automatically
- **Better TypeScript**: Full type safety for layer props
- **Easier testing**: Components can be tested like regular React components

### When to Use

- **GraphLayer**: When you need to add existing layer classes (DevTools, Minimap, etc.)
- **GraphPortal**: When you need HTML overlays (controls, info panels, tooltips)
- **Imperative hooks**: When you need fine-grained control over layer behavior
        
        `,
      },
      source: {
        language: "tsx",
        code: ``,
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

// Main story
export const Default: Story = {};
