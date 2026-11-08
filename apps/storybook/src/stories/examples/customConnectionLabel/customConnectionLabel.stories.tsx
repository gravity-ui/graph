import React, { useEffect, useState } from "react";

import { BlockConnection, Graph, TBlock, TConnection, TConnectionProps, getFontSize } from "@gravity-ui/graph";
import { GraphCanvas, useGraph } from "@gravity-ui/graph-react";
import { Flex, Switch, ThemeProvider } from "@gravity-ui/uikit";
import type { Meta, StoryFn } from "@storybook/react-webpack5";

import { generatePrettyBlocks } from "../../configurations/generatePretty";
import { BlockStory } from "../../main/Block";

import "@gravity-ui/uikit/styles/styles.css";

const storyConfig = generatePrettyBlocks({ layersCount: 6, connectionsPerLayer: 80 });

storyConfig.connections?.forEach((connection) => {
  connection.label = "Custom Label";
});

export class CustomConnection extends BlockConnection<TConnection> {
  protected override renderLabelText(ctx: CanvasRenderingContext2D) {
    if (!this.isVisible() || !this.state.label || !this.labelGeometry) {
      return;
    }

    const [labelInnerTopPadding, , , labelInnerLeftPadding] = this.context.constants.connection.LABEL.INNER_PADDINGS;
    const fontSize = Math.max(14, getFontSize(9, this.context.camera.getCameraScale()));
    const font = `${fontSize}px sans-serif`;
    const { x: rectX, y: rectY, width: rectWidth, height: rectHeight } = this.labelGeometry;

    if (this.context.colors.connectionLabel?.background) {
      ctx.fillStyle = this.context.colors.connectionLabel.background;
    }

    if (this.state.hovered && this.context.colors.connectionLabel?.hoverBackground) {
      ctx.fillStyle = this.context.colors.connectionLabel.hoverBackground;
    }

    if (this.state.selected && this.context.colors.connectionLabel?.selectedBackground) {
      ctx.fillStyle = this.context.colors.connectionLabel.selectedBackground;
    }

    ctx.fillRect(rectX, rectY, rectWidth, rectHeight);

    ctx.strokeStyle = "red";

    // draw a border around the rectangle
    ctx.strokeRect(rectX, rectY, rectWidth, rectHeight);

    if (this.context.colors.connectionLabel?.text) {
      ctx.fillStyle = this.context.colors.connectionLabel.text;
    }

    if (this.state.hovered && this.context.colors.connectionLabel?.hoverText) {
      ctx.fillStyle = this.context.colors.connectionLabel.hoverText;
    }

    if (this.state.selected && this.context.colors.connectionLabel?.selectedText) {
      ctx.fillStyle = this.context.colors.connectionLabel.selectedText;
    }

    ctx.textBaseline = "top";
    ctx.font = font;
    ctx.textAlign = "left";
    ctx.fillText(this.state.label, rectX + labelInnerLeftPadding, rectY + labelInnerTopPadding);
  }
}

export class CustomConnectionOnSelected extends CustomConnection {
  protected override updateLabelGeometry(props: TConnectionProps): void {
    super.updateLabelGeometry(props);
    if (!this.state.selected) this.labelGeometry = undefined;
  }
}

const GraphApp = () => {
  const [showLabelOnlyOnSelected, setShowLabelOnlyOnSelected] = useState(false);

  const { graph, setEntities, start, zoomTo } = useGraph({
    settings: {
      connection: showLabelOnlyOnSelected ? CustomConnectionOnSelected : CustomConnection,
      showConnectionLabels: true,
    },
  });

  useEffect(() => {
    setEntities(storyConfig);
    start();
    zoomTo("center", { padding: 300 });
  }, [graph]);

  const renderBlock = (graphInstance: Graph, block: TBlock) => {
    return <BlockStory graph={graphInstance} block={block} />;
  };

  return (
    <ThemeProvider theme="light">
      <Flex direction="column" style={{ height: "100vh" }} gap={4}>
        <Switch checked={showLabelOnlyOnSelected} onChange={() => setShowLabelOnlyOnSelected(!showLabelOnlyOnSelected)}>
          Show label only on selected connections
        </Switch>
        <div style={{ flex: 1, position: "relative" }}>
          <GraphCanvas graph={graph} className="graph-canvas" renderBlock={renderBlock} />
        </div>
      </Flex>
    </ThemeProvider>
  );
};

const meta: Meta = {
  title: "Examples/CustomConnectionLabel",
  component: GraphApp,
  parameters: {
    layout: "fullscreen",
  },
};

export default meta;

export const Default: StoryFn = () => <GraphApp />;
