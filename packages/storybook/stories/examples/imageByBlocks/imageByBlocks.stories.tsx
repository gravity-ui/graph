/* eslint-disable no-console */
import React, { useCallback, useEffect, useRef, useState } from "react";

import { ThemeProvider } from "@gravity-ui/uikit";
import type { Meta, StoryFn } from "@storybook/react";

import { CanvasBlock, Graph, TBlock, TGraphConfig } from "@gravity-ui/graph";
import { storiesSettings } from "../../../stories/configurations/definitions";
import { GraphComponentStory } from "../../main/GraphEditor";

import image from "./image.png";

import "@gravity-ui/uikit/styles/styles.css";

type TBlockMeta = {
  color: string;
};

class SpecificBlockView extends CanvasBlock<TBlock<TBlockMeta>> {
  public override renderSchematicView() {
    this.context.ctx.fillStyle = this.state.meta.color;
    this.context.ctx.fillRect(this.state.x, this.state.y, this.state.width, this.state.height);
  }
}

const SpecificBlockIs = "some-specific-view";

async function generateByImage() {
  return new Promise<TGraphConfig>((resolve) => {
    const config: TGraphConfig<TBlock<TBlockMeta>> = {
      configurationName: "power of 2",
      blocks: [],
      connections: [],
      rect: {
        x: -500,
        y: -2000,
        width: 2000,
        height: 2000,
      },
      cameraScale: 0.05,
      settings: {
        ...storiesSettings,
        showConnectionLabels: true,
        useBezierConnections: true,
        blockComponents: {
          [SpecificBlockIs]: SpecificBlockView,
        },
      },
    };
    const canvas = document.createElement("canvas");

    const pic = new Image();
    pic.src = image;
    pic.onload = function () {
      canvas.width = pic.width;
      canvas.height = pic.height;
      const ctx = canvas.getContext("2d");

      ctx.drawImage(pic, 0, 0);

      for (let x = 0; x < pic.width; x += 5) {
        for (let y = 0; y < pic.height; y += 5) {
          const colorData = ctx.getImageData(x, y, 1, 1).data;

          if (!colorData[0] && !colorData[1] && !colorData[2]) continue;

          config.blocks.push({
            id: `block_${x}-${y}`,
            is: SpecificBlockIs,
            x: x * 10,
            y: y * 10,
            width: 50,
            height: 50,
            selected: false,
            name: `block_${x}-${y}`,
            anchors: [],
            meta: {
              color: `rgba(${colorData[0]}, ${colorData[1]}, ${colorData[2]})`,
            },
          });
        }
      }
      console.log("Blocks count: ", config.blocks.length);
      resolve(config);
    };
  });
}

const GraphApp = () => {
  const graphRef = useRef<Graph | undefined>(undefined);

  const [config, setConfig] = useState<TGraphConfig | undefined>();

  const renderBlockFn = useCallback(() => {
    return null;
  }, []);

  useEffect(() => {
    generateByImage().then((newConfig) => setConfig(newConfig));
  }, []);

  if (!config) return null;

  return (
    <ThemeProvider theme={"light"}>
      <GraphComponentStory graphRef={graphRef} config={config} renderBlock={renderBlockFn} />
    </ThemeProvider>
  );
};

const meta: Meta = {
  title: "Examples/ImageByBlocks",
  component: GraphApp,
};

export default meta;

export const Default: StoryFn = () => <GraphApp />;
