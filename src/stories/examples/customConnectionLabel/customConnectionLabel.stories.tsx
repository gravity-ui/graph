import React, { useEffect, useState } from "react";

import { Flex, Switch, ThemeProvider } from "@gravity-ui/uikit";
import type { Meta, StoryFn } from "@storybook/react-webpack5";

import { TBlock } from "../../../components/canvas/blocks/Block";
import { getLabelCoords } from "../../../components/canvas/connections/labelHelper";
import { BlockConnection, Graph, TConnection, cachedMeasureText } from "../../../index";
import { GraphCanvas, useGraph } from "../../../react-components";
import { getFontSize } from "../../../utils/functions/text";
import { generatePrettyBlocks } from "../../configurations/generatePretty";
import { BlockStory } from "../../main/Block";

import "@gravity-ui/uikit/styles/styles.css";

const storyConfig = generatePrettyBlocks({ layersCount: 6, connectionsPerLayer: 80 });

storyConfig.connections.forEach((connection) => {
  connection.label = "Custom Label";
});

function getRenderLabelText(showLabelOnlyOnSelected: boolean) {
  return (ctx: CanvasRenderingContext2D) => {
    if (!this.isVisible()) {
      return;
    }

    const [labelInnerTopPadding, labelInnerRightPadding, labelInnerBottomPadding, labelInnerLeftPadding] =
      this.context.constants.connection.LABEL.INNER_PADDINGS;
    const fontSize = Math.max(14, getFontSize(9, this.context.camera.getCameraScale()));
    const font = `${fontSize}px sans-serif`;

    const measure = cachedMeasureText(this.state.label, {
      font,
    });

    const { x, y } = getLabelCoords(
      this.geometry.x1,
      this.geometry.y1,
      this.geometry.x2,
      this.geometry.y2,
      measure.width + labelInnerLeftPadding + labelInnerRightPadding,
      measure.height + labelInnerTopPadding + labelInnerBottomPadding,
      this.context.constants.system.GRID_SIZE
    );

    if (showLabelOnlyOnSelected && !this.state.selected) {
      this.labelGeometry = undefined;
      return;
    }

    ctx.fillStyle = this.context.colors.connectionLabel.background;

    if (this.state.hovered) ctx.fillStyle = this.context.colors.connectionLabel.hoverBackground;
    if (this.state.selected) ctx.fillStyle = this.context.colors.connectionLabel.selectedBackground;

    const rectX = x;
    const rectY = y;
    const rectWidth = measure.width + labelInnerLeftPadding + labelInnerRightPadding;
    const rectHeight = measure.height + labelInnerTopPadding + labelInnerBottomPadding;

    this.labelGeometry = {
      x: rectX,
      y: rectY,
      width: rectWidth,
      height: rectHeight,
    };

    ctx.fillRect(rectX, rectY, rectWidth, rectHeight);

    ctx.strokeStyle = "red";

    // draw a border around the rectangle
    ctx.strokeRect(rectX, rectY, rectWidth, rectHeight);

    ctx.fillStyle = this.context.colors.connectionLabel.text;

    if (this.state.hovered) ctx.fillStyle = this.context.colors.connectionLabel.hoverText;
    if (this.state.selected) ctx.fillStyle = this.context.colors.connectionLabel.selectedText;

    ctx.textBaseline = "top";
    ctx.font = font;
    ctx.textAlign = "left";
    ctx.fillText(this.state.label, rectX + labelInnerLeftPadding, rectY + labelInnerTopPadding);
  };
}

export class CustomConnection extends BlockConnection<TConnection> {
  protected renderLabelText(ctx: CanvasRenderingContext2D) {
    getRenderLabelText.call(this, false)(ctx);
  }
}

export class CustomConnectionOnSelected extends BlockConnection<TConnection> {
  protected renderLabelText(ctx: CanvasRenderingContext2D) {
    getRenderLabelText.call(this, true)(ctx);
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
