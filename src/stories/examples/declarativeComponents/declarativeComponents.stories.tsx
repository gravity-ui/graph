import React, { useEffect, useState } from "react";

import { Button, Flex, Switch, Text, ThemeProvider } from "@gravity-ui/uikit";
import type { Meta, StoryObj } from "@storybook/react";

import { TBlock } from "../../../components/canvas/blocks/Block";
import { Graph } from "../../../index";
import { DevToolsLayer } from "../../../plugins/devtools/DevToolsLayer";
import { GraphCanvas, GraphLayer, GraphPortal, useGraph } from "../../../react-components";
import { generatePrettyBlocks } from "../../configurations/generatePretty";
import { BlockStory } from "../../main/Block";

import "@gravity-ui/uikit/styles/styles.css";

// Helper component to render blocks
const RenderBlock = ({ graph, block }: { graph: Graph; block: TBlock }) => {
  return <BlockStory graph={graph} block={block} />;
};

// GraphLayer Story Component
interface GraphLayerStoryProps {
  showRuler: boolean;
  showCrosshair: boolean;
  rulerSize: number;
  rulerBackgroundColor: string;
  crosshairColor: string;
  interactive: boolean;
}

const GraphLayerStoryComponent = (args: GraphLayerStoryProps) => {
  const { graph, setEntities, start, zoomTo } = useGraph({});
  const [layerVisible, setLayerVisible] = useState(true);

  useEffect(() => {
    if (graph) {
      const data = generatePrettyBlocks({ layersCount: 5, connectionsPerLayer: 10, dashedLine: false });
      setEntities(data);
      start();
      zoomTo("center", { padding: 300 });
    }
  }, [graph, setEntities, start, zoomTo]);

  const renderBlockCallback = React.useCallback(
    (g: Graph, block: TBlock) => <RenderBlock graph={g} block={block} />,
    []
  );

  return (
    <ThemeProvider theme="light">
      <Flex direction="column" style={{ height: "100vh" }}>
        {args.interactive && (
          <Flex direction="column" gap={2} style={{ padding: 16, background: "#f0f0f0" }}>
            <Text variant="header-2">GraphLayer Demonstration</Text>
            <Switch
              checked={layerVisible}
              onChange={(e) => setLayerVisible(e.target.checked)}
              content="Show DevTools layer"
            />
          </Flex>
        )}

        <div style={{ flex: 1, position: "relative" }}>
          <GraphCanvas graph={graph} renderBlock={renderBlockCallback}>
            {/* Declarative usage of DevTools layer */}
            {layerVisible && (
              <GraphLayer
                layer={DevToolsLayer}
                showRuler={args.showRuler}
                showCrosshair={args.showCrosshair}
                rulerSize={args.rulerSize}
                rulerBackgroundColor={args.rulerBackgroundColor}
                crosshairColor={args.crosshairColor}
              />
            )}
          </GraphCanvas>
        </div>
      </Flex>
    </ThemeProvider>
  );
};

// GraphPortal Story Component
interface GraphPortalStoryProps {
  zIndex: number;
  transformByCameraPosition: boolean;
  backgroundColor: string;
  showRenderProp: boolean;
  interactive: boolean;
}

const GraphPortalStoryComponent = (args: GraphPortalStoryProps) => {
  const { graph, setEntities, start, zoomTo } = useGraph({});
  const [counter, setCounter] = useState(0);
  const [portalVisible, setPortalVisible] = useState(true);

  useEffect(() => {
    if (graph) {
      const data = generatePrettyBlocks({ layersCount: 3, connectionsPerLayer: 5, dashedLine: false });
      setEntities(data);
      start();
      zoomTo("center", { padding: 300 });
    }
  }, [graph, setEntities, start, zoomTo]);

  const renderBlockCallback = React.useCallback(
    (g: Graph, block: TBlock) => <RenderBlock graph={g} block={block} />,
    []
  );

  return (
    <ThemeProvider theme="light">
      <Flex direction="column" style={{ height: "100vh" }}>
        {args.interactive && (
          <Flex direction="column" gap={2} style={{ padding: 16, background: "#f0f0f0" }}>
            <Text variant="header-2">GraphPortal Demonstration</Text>
            <Flex alignItems="center" gap={4}>
              <Switch
                checked={portalVisible}
                onChange={(e) => setPortalVisible(e.target.checked)}
                content="Show portal"
              />
              <Text>Counter: {counter}</Text>
            </Flex>
          </Flex>
        )}

        <div style={{ flex: 1, position: "relative" }}>
          <GraphCanvas graph={graph} renderBlock={renderBlockCallback}>
            {/* Simple GraphPortal usage */}
            {portalVisible && (
              <GraphPortal zIndex={args.zIndex} transformByCameraPosition={args.transformByCameraPosition}>
                <div
                  style={{
                    position: "absolute",
                    top: 20,
                    right: 20,
                    background: args.backgroundColor,
                    padding: "16px",
                    borderRadius: "8px",
                    boxShadow: "0 2px 8px rgba(0, 0, 0, 0.15)",
                  }}
                >
                  <Text variant="subheader-1" style={{ marginBottom: 8 }}>
                    Custom UI
                  </Text>
                  <Flex direction="column" gap={2}>
                    <Button onClick={() => setCounter(counter + 1)} view="action" size="m">
                      Increment: {counter}
                    </Button>
                    <Button onClick={() => graph?.zoomTo("center", { padding: 100 })} view="normal" size="m">
                      Center Graph
                    </Button>
                  </Flex>
                </div>
              </GraphPortal>
            )}

            {/* Render prop example */}
            {args.showRenderProp && portalVisible && (
              <GraphPortal zIndex={args.zIndex + 10}>
                {(layer) => (
                  <div
                    style={{
                      position: "absolute",
                      top: 10,
                      left: 10,
                      background: "rgba(0, 0, 255, 0.1)",
                      padding: "8px",
                      borderRadius: "4px",
                      color: "blue",
                      fontSize: "12px",
                      cursor: "pointer",
                    }}
                    onClick={() => (layer.isHidden() ? layer.show() : layer.hide())}
                  >
                    Render Prop: Click to hide/show
                  </div>
                )}
              </GraphPortal>
            )}
          </GraphCanvas>
        </div>
      </Flex>
    </ThemeProvider>
  );
};

// Storybook Meta Configuration
const meta: Meta = {
  title: "Examples/Declarative Components",
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "## Declarative components for working with layers\n\n" +
          "The library provides two powerful components that offer declarative alternatives for working with custom layers:\n\n" +
          "### 🎯 GraphLayer\n\n" +
          "**Declarative alternative for working with existing Layer classes**\n\n" +
          "Provides an alternative declarative way to work with layers alongside the existing imperative approach:\n\n" +
          "```tsx\n" +
          "// Imperative approach - using useLayer hook\n" +
          "const devTools = useLayer(graph, DevToolsLayer, { \n" +
          "  showRuler: true,\n" +
          "  rulerSize: 20 \n" +
          "});\n\n" +
          "// Declarative approach - using GraphLayer component\n" +
          "<GraphLayer \n" +
          "  graph={graph} \n" +
          "  layer={DevToolsLayer}\n" +
          "  showRuler={true}\n" +
          "  rulerSize={20}\n" +
          "/>\n" +
          "```\n\n" +
          "Choose the approach that best fits your component architecture and preferences.\n\n" +
          "### 🎯 GraphPortal\n\n" +
          "**Creating HTML layers without writing Layer classes**\n\n" +
          "Allows creating HTML layers using the render prop pattern:\n\n" +
          "```tsx\n" +
          "// Simple usage\n" +
          "<GraphPortal graph={graph} zIndex={200}>\n" +
          "  <div>Your custom UI</div>\n" +
          "</GraphPortal>\n\n" +
          "// Render prop for layer method access\n" +
          "<GraphPortal graph={graph}>\n" +
          "  {(layer) => (\n" +
          "    <button onClick={() => layer.hide()}>\n" +
          "      Hide layer\n" +
          "    </button>\n" +
          "  )}\n" +
          "</GraphPortal>\n" +
          "```",
      },
    },
  },
};

export default meta;

// GraphLayer Story
export const GraphLayerExample: StoryObj<GraphLayerStoryProps> = {
  render: (args) => <GraphLayerStoryComponent {...args} />,
  name: "GraphLayer - Declarative layers",
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        story:
          "**GraphLayer** provides a declarative alternative for adding existing Layer classes to the graph.\n\n" +
          "The component automatically manages the layer lifecycle and passes all props, offering a different approach alongside the imperative `useLayer` hook.",
      },
      source: {
        language: "tsx",
        code: `
 import { GraphLayer, GraphCanvas, useGraph } from '@gravity-ui/graph';
 import { DevToolsLayer } from '@gravity-ui/graph/plugins';
 
 function MyGraph() {
   const { graph, setEntities, start } = useGraph({});

   React.useEffect(() => {
     if (graph) {
       setEntities({ blocks: [...], connections: [...] });
       start();
     }
   }, [graph]);

   return (
     <GraphCanvas graph={graph} renderBlock={renderBlock}>
       {/* Declarative DevTools layer addition */}
       <GraphLayer 
         layer={DevToolsLayer}
         showRuler={true}
         showCrosshair={true}
         rulerSize={20}
         rulerBackgroundColor="rgba(0, 0, 0, 0.8)"
         crosshairColor="rgba(255, 0, 0, 0.8)"
       />
     </GraphCanvas>
   );
 }
        `,
      },
    },
  },
  argTypes: {
    showRuler: {
      control: "boolean",
      description: "Show/hide rulers in DevTools layer",
    },
    showCrosshair: {
      control: "boolean",
      description: "Show/hide crosshair in DevTools layer",
    },
    rulerSize: {
      control: { type: "range", min: 10, max: 50, step: 5 },
      description: "Size of rulers in pixels",
    },
    rulerBackgroundColor: {
      control: "color",
      description: "Background color of rulers (CSS color)",
    },
    crosshairColor: {
      control: "color",
      description: "Color of crosshair (CSS color)",
    },
    interactive: {
      control: "boolean",
      description: "Show interactive controls",
    },
  },
  args: {
    showRuler: true,
    showCrosshair: true,
    rulerSize: 20,
    rulerBackgroundColor: "rgba(0, 0, 0, 0.8)",
    crosshairColor: "rgba(255, 0, 0, 0.8)",
    interactive: true,
  },
};

// GraphPortal Story
export const GraphPortalExample: StoryObj<GraphPortalStoryProps> = {
  render: (args) => <GraphPortalStoryComponent {...args} />,
  name: "GraphPortal - HTML portals",
  parameters: {
    docs: {
      description: {
        story:
          "**GraphPortal** allows creating HTML layers without writing separate Layer classes.\n\n" +
          "Supports both simple children and render prop for accessing layer methods.",
      },
      source: {
        language: "tsx",
        code: `
 import { GraphPortal, GraphCanvas, useGraph } from '@gravity-ui/graph';
 
 function MyGraph() {
   const { graph, setEntities, start } = useGraph({});
   const [counter, setCounter] = useState(0);
 
   React.useEffect(() => {
     if (graph) {
       setEntities({ blocks: [...], connections: [...] });
       start();
     }
   }, [graph]);
 
   return (
     <GraphCanvas graph={graph} renderBlock={renderBlock}>
       {/* Simple usage */}
       <GraphPortal zIndex={200}>
         <div style={{ 
           position: 'absolute', 
           top: 20, 
           right: 20,
           background: 'white',
           padding: 16,
           borderRadius: 8 
         }}>
           <button onClick={() => setCounter(c => c + 1)}>
             Counter: {counter}
           </button>
         </div>
       </GraphPortal>
 
       {/* Render prop for layer access */}
       <GraphPortal>
         {(layer) => (
           <button 
             onClick={() => layer.isHidden() ? layer.show() : layer.hide()}
           >
             Toggle layer visibility
           </button>
         )}
       </GraphPortal>
     </GraphCanvas>
   );
 }
        `,
      },
    },
  },
  argTypes: {
    zIndex: {
      control: { type: "range", min: 1, max: 1000, step: 10 },
      description: "Z-index for HTML layer element",
    },
    transformByCameraPosition: {
      control: "boolean",
      description: "Whether HTML element should follow camera position",
    },
    backgroundColor: {
      control: "color",
      description: "Background color of custom UI",
    },
    showRenderProp: {
      control: "boolean",
      description: "Show render prop example",
    },
    interactive: {
      control: "boolean",
      description: "Show interactive controls",
    },
  },
  args: {
    zIndex: 200,
    transformByCameraPosition: false,
    backgroundColor: "rgba(255, 255, 255, 0.95)",
    showRenderProp: true,
    interactive: true,
  },
};

// Combined example
export const CombinedExample: StoryObj = {
  render: () => {
    const { graph, setEntities, start, zoomTo } = useGraph({});

    React.useEffect(() => {
      if (graph) {
        const data = generatePrettyBlocks({ layersCount: 4, connectionsPerLayer: 8, dashedLine: false });
        setEntities(data);
        start();
        zoomTo("center", { padding: 300 });
      }
    }, [graph, setEntities, start, zoomTo]);

    const renderBlockCallback = React.useCallback(
      (g: Graph, block: TBlock) => <RenderBlock graph={g} block={block} />,
      []
    );

    return (
      <ThemeProvider theme="light">
        <div style={{ height: "100vh", position: "relative" }}>
          <GraphCanvas graph={graph} renderBlock={renderBlockCallback}>
            {/* DevTools layer via GraphLayer */}
            <GraphLayer layer={DevToolsLayer} showRuler={true} showCrosshair={false} rulerSize={15} />

            {/* Info panel via GraphPortal */}
            <GraphPortal zIndex={300}>
              <div
                style={{
                  position: "absolute",
                  bottom: 20,
                  left: 20,
                  background: "rgba(34, 139, 34, 0.9)",
                  color: "white",
                  padding: "12px",
                  borderRadius: "6px",
                  fontSize: "14px",
                }}
              >
                ✅ GraphLayer: DevTools active
                <br />✅ GraphPortal: Info panel
              </div>
            </GraphPortal>

            {/* Action menu with render prop */}
            <GraphPortal zIndex={250}>
              {(layer) => (
                <div
                  style={{
                    position: "absolute",
                    top: 20,
                    left: 20,
                    background: "white",
                    boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
                    borderRadius: "8px",
                    padding: "16px",
                  }}
                >
                  <Text variant="subheader-2" style={{ marginBottom: 12 }}>
                    Actions
                  </Text>
                  <Flex direction="column" gap={2}>
                    <Button onClick={() => graph?.zoomTo("center", { padding: 200 })} view="normal" size="s">
                      Center
                    </Button>
                    <Button onClick={() => layer.hide()} view="flat" size="s">
                      Hide panel
                    </Button>
                  </Flex>
                </div>
              )}
            </GraphPortal>
          </GraphCanvas>
        </div>
      </ThemeProvider>
    );
  },
  name: "Combined usage",
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        story:
          "Example of combined usage of **GraphLayer** and **GraphPortal** in one graph.\n\n" +
          "Demonstrates how components complement each other to create rich user interfaces.",
      },
      source: {
        language: "tsx",
        code: `
 function CombinedExample() {
   const { graph, setEntities, start } = useGraph({});
 
   React.useEffect(() => {
     // Data initialization
   }, [graph]);
 
   return (
     <GraphCanvas graph={graph} renderBlock={renderBlock}>
       {/* DevTools via GraphLayer */}
       <GraphLayer 
         layer={DevToolsLayer} 
         showRuler={true} 
       />
 
       {/* Info panel via GraphPortal */}
       <GraphPortal zIndex={300}>
         <div className="info-panel">
           ✅ GraphLayer + GraphPortal
         </div>
       </GraphPortal>
 
       {/* Menu with render prop */}
       <GraphPortal>
         {(layer) => (
           <button onClick={() => layer.hide()}>
             Hide menu
           </button>
         )}
       </GraphPortal>
     </GraphCanvas>
   );
 }
        `,
      },
    },
  },
};
