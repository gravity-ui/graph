import React, { useState } from "react";

import type { Meta, StoryObj } from "@storybook/react-webpack5";

import type { TGroup, TGroupGeometry } from "../../../components/canvas/groups";
import { BlockGroups, Group } from "../../../components/canvas/groups";
import { Graph, GraphState } from "../../../graph";
import type { TBlock } from "../../../index";
import type { CSSVariableChange } from "../../../plugins/cssVariables";
import { CSSVariablesLayer } from "../../../plugins/cssVariables";
import { GraphCanvas, useGraphEvent } from "../../../react-components";
import { useGraph, useLayer } from "../../../react-components/hooks";
import type { LayerPublicProps } from "../../../services/Layer";
import { generatePrettyBlocks } from "../../../stories/configurations/generatePretty";
import { getBlocksRect } from "../../../utils/functions";
import { BlockStory } from "../../main/Block";

import "./cssVariables.stories.css";

const meta: Meta = {
  title: "Plugins/CSS Variables",
  component: GraphCanvas,
  parameters: {
    layout: "fullscreen",
  },
};

export default meta;

type Story = StoryObj<typeof meta>;

const SAMPLE_BLOCKS = generatePrettyBlocks({ layersCount: 3, connectionsPerLayer: 2, dashedLine: false });

function CSSVariablesExample() {
  const [theme, setTheme] = useState<"light" | "dark" | "custom">("light");

  const { graph, setEntities, start } = useGraph({
    settings: {
      canDragCamera: true,
      canZoomCamera: true,
    },
  });

  // Add CSS Variables Layer
  useLayer(graph, CSSVariablesLayer, {
    containerClass: `graph-theme`,
    debug: true,
    onChange: (changes) => {
      console.log("CSS Variables changed:", changes);
    },
  });

  React.useEffect(() => {
    if (!graph) return;

    setEntities({
      blocks: SAMPLE_BLOCKS.blocks,
      connections: SAMPLE_BLOCKS.connections,
    });
  }, [graph, setEntities]);

  useGraphEvent(graph, "state-change", ({ state }) => {
    if (state === GraphState.ATTACHED) {
      start();
      graph.zoomTo("center", { padding: 300 });
    }
  });

  const renderBlockFn = React.useCallback((graphObject: Graph, block: TBlock) => {
    return <BlockStory graph={graphObject} block={block} />;
  }, []);

  return (
    <div className="css-variables-story">
      <div className="controls">
        <div className="control-group">
          <label>Theme:</label>
          <select value={theme} onChange={(e) => setTheme(e.target.value as typeof theme)}>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
            <option value="custom">Custom</option>
          </select>
        </div>

        <div className="info">
          <p>Open DevTools and try changing CSS variables like:</p>
          <ul>
            <li>
              <code>--graph-block-background</code>
            </li>
            <li>
              <code>--graph-connection-background</code>
            </li>
            <li>
              <code>--graph-canvas-background</code>
            </li>
          </ul>
        </div>
      </div>

      <GraphCanvas
        className={`graph-container graph-theme graph-theme-${theme}`}
        graph={graph}
        renderBlock={renderBlockFn}
      />
    </div>
  );
}

export const BasicExample: Story = {
  render: () => <CSSVariablesExample />,
  parameters: {
    docs: {
      description: {
        story: `
This example demonstrates the CSS Variables Layer plugin which allows styling the graph using CSS variables instead of the JavaScript API.

Key features:
- Real-time CSS variable monitoring
- Automatic mapping to graph colors and constants
- Live debugging in DevTools
- Theme switching support
- Performance optimized with empty container div

Try changing themes or open DevTools to modify CSS variables directly!
        `,
      },
    },
  },
};

function AdvancedExample() {
  const { graph, setEntities, start } = useGraph({
    settings: {
      canDragCamera: true,
      canZoomCamera: true,
    },
  });

  useLayer(graph, CSSVariablesLayer, {
    containerClass: "graph-container",
    debug: true,
    onChange: (changes) => {
      console.log("Colors changed:", changes);
    },
  });

  React.useEffect(() => {
    if (!graph) return;

    setEntities({
      blocks: SAMPLE_BLOCKS.blocks,
      connections: SAMPLE_BLOCKS.connections,
    });
  }, [graph, setEntities]);

  useGraphEvent(graph, "state-change", ({ state }) => {
    if (state === GraphState.ATTACHED) {
      start();
      graph.zoomTo("center", { padding: 300 });
    }
  });

  const renderBlockFn = React.useCallback((graphObject: Graph, block: TBlock) => {
    return <BlockStory graph={graphObject} block={block} />;
  }, []);

  const updateStyle = (name: string, value: string) => {
    const element = document.querySelector(".graph-container") as HTMLDivElement;
    if (element) {
      element.style.setProperty(name, value);
    }
  };

  return (
    <div className="css-variables-story">
      <div className="controls">
        <div className="info">
          <h3>Advanced CSS Variables Example</h3>
          <p>This example shows:</p>
          <ul>
            <li>Custom change handlers</li>
            <li>Dynamic CSS variable manipulation</li>
            <li>Integration with connections</li>
            <li>Debug mode enabled</li>
          </ul>

          <div className="css-controls">
            <button
              onClick={() => {
                updateStyle("--graph-block-background", "#ff6b6b");
              }}
            >
              Set Red Blocks
            </button>

            <button
              onClick={() => {
                updateStyle("--graph-connection-background", "#4ecdc4");
              }}
            >
              Set Teal Connections
            </button>

            <button
              onClick={() => {
                updateStyle("--graph-canvas-background", "#ffe66d");
              }}
            >
              Set Yellow Canvas
            </button>

            <button
              onClick={() => {
                updateStyle("--graph-block-background", "");
                updateStyle("--graph-connection-background", "");
                updateStyle("--graph-canvas-background", "");
              }}
            >
              Reset Colors
            </button>
          </div>
        </div>
      </div>

      <GraphCanvas className="graph-container advanced-graph-theme" graph={graph} renderBlock={renderBlockFn} />
    </div>
  );
}

export const AdvancedUsage: Story = {
  render: () => <AdvancedExample />,
  parameters: {
    docs: {
      description: {
        story: `
Advanced example showing programmatic CSS variable manipulation and custom change handlers.

This demonstrates how to:
- Handle CSS variable changes with custom logic
- Dynamically set CSS variables via JavaScript
- Monitor specific types of changes
- Reset variables to default values

Check the console to see debug output when variables change!
        `,
      },
    },
  },
};

const CUSTOM_CSS_VARIABLES = ["--custom-highlight"];

type HighlightGroupData = TGroup & { color: string };

class HighlightGroup extends Group<HighlightGroupData> {
  protected geometry: TGroupGeometry = { padding: [60, 60, 60, 60] };

  protected override render() {
    this.style = {
      ...this.style,
      background: this.state.color,
      border: this.state.color,
      selectedBackground: this.state.color,
      selectedBorder: this.state.color,
    };
    super.render();
  }
}

const CUSTOM_GROUPS_LAYER_PROPS: LayerPublicProps<typeof BlockGroups> = {
  draggable: false,
  groupComponent: HighlightGroup,
};

function CustomVariablesExample() {
  const [highlight, setHighlight] = useState("#7c3aed");
  const [lastChange, setLastChange] = useState<CSSVariableChange | null>(null);
  const { graph, setEntities, start } = useGraph({
    layers: [[BlockGroups, CUSTOM_GROUPS_LAYER_PROPS]],
    settings: {
      canDragCamera: true,
      canZoomCamera: true,
    },
  });
  const groupsLayer = React.useMemo(
    () => graph.layers.getLayers().find((layer) => layer instanceof BlockGroups),
    [graph]
  );

  const handleChange = React.useCallback(
    (changes: CSSVariableChange[]) => {
      const change = changes.find(({ name }) => name === "--custom-highlight");
      if (!change) return;

      setLastChange(change);

      groupsLayer?.updateGroups<HighlightGroupData>([
        {
          id: "custom-highlight-group",
          rect: getBlocksRect(SAMPLE_BLOCKS.blocks.slice(1, 3)),
          color: change.value,
        },
      ]);
    },
    [groupsLayer]
  );

  useLayer(graph, CSSVariablesLayer, {
    containerClass: "custom-variables-observer",
    additionalCSSVariables: CUSTOM_CSS_VARIABLES,
    onChange: handleChange,
  });

  useGraphEvent(graph, "state-change", ({ state }) => {
    if (state === GraphState.ATTACHED) {
      setEntities({ blocks: SAMPLE_BLOCKS.blocks, connections: SAMPLE_BLOCKS.connections });
      start();
      graph.zoomTo("center", { padding: 300 });
    }
  });

  const renderBlock = React.useCallback((graphObject: Graph, block: TBlock) => {
    return <BlockStory graph={graphObject} block={block} />;
  }, []);

  return (
    <div className="css-variables-story" style={{ "--custom-highlight": highlight } as React.CSSProperties}>
      <div className="controls">
        <div className="control-group">
          <label htmlFor="custom-highlight">Custom highlight:</label>
          <input
            id="custom-highlight"
            type="color"
            value={highlight}
            onChange={(event) => setHighlight(event.target.value)}
          />
        </div>
        <div className="info">
          <h3>Custom CSS variables</h3>
          <p>
            <code>--custom-highlight</code> is passed through <code>additionalCSSVariables</code>. Change the color to
            trigger <code>onChange</code> and recolor the group around the second column of blocks.
          </p>
          <p>The callback updates the existing group's color and the preview below.</p>
          <output className="custom-variable-preview" aria-live="polite">
            <span className="custom-variable-swatch" style={{ backgroundColor: lastChange?.value }} />
            {lastChange ? `${lastChange.oldValue || "(initial)"} → ${lastChange.value}` : "Waiting for initial value…"}
          </output>
        </div>
      </div>
      <GraphCanvas className="graph-container graph-theme-light" graph={graph} renderBlock={renderBlock} />
    </div>
  );
}

export const CustomVariables: Story = {
  render: () => <CustomVariablesExample />,
  parameters: {
    docs: {
      description: {
        story:
          "Pass custom CSS variable names through additionalCSSVariables to receive their initial values and subsequent changes in onChange. Use the color picker to update --custom-highlight: onChange calls updateGroups to update the color in group state while preserving the group component, without adding graph mappings.",
      },
    },
  },
};
