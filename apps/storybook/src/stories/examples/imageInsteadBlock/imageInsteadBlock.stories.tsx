import React, { useEffect, useRef, useState } from "react";

import { CanvasBlock, Graph, TBlock, TGraphConfig } from "@gravity-ui/graph";
import { ThemeProvider } from "@gravity-ui/uikit";
import type { Meta, StoryFn } from "@storybook/react-webpack5";

import { generatePrettyBlocks } from "../../configurations/generatePretty";
import { GraphComponentStory } from "../../main/GraphEditor";

import imageDone from "./done.png";
import imageFail from "./fail.png";
import imageRunning from "./running.png";
import imageWaiting from "./waiting.png";

import "@gravity-ui/uikit/styles/styles.css";

enum EBlockStatus {
  DONE = "done",
  FAIL = "fail",
  RUNNING = "running",
  WAITING = "waiting",
}

type TBlockMeta = {
  status?: EBlockStatus;
  shouldInitImage: boolean;
  img?: HTMLImageElement;
  imageWidth: number;
  imageHeight: number;
  imageOffsetX: number;
  imageOffsetY: number;
};

class SpecificBlockView extends CanvasBlock<TBlock<TBlockMeta>> {
  public override renderSchematicView() {
    const blockMetaState = this.state.meta;
    if (!blockMetaState) {
      return;
    }
    if (blockMetaState.shouldInitImage) {
      const img = new Image();
      blockMetaState.img = img;

      img.onload = () => {
        const hRatio = this.state.width / img.width;
        const vRatio = this.state.height / img.height;
        const imageRatio = Math.min(hRatio, vRatio);

        blockMetaState.imageWidth = img.width * imageRatio;
        blockMetaState.imageHeight = img.width * imageRatio;

        blockMetaState.imageOffsetX = (this.state.width - blockMetaState.imageWidth) / 2;
        blockMetaState.imageOffsetY = (this.state.height - blockMetaState.imageHeight) / 2;

        this.context.ctx.drawImage(
          img,
          0,
          0,
          img.width,
          img.height,
          this.state.x + blockMetaState.imageOffsetX,
          this.state.y + blockMetaState.imageOffsetY,
          blockMetaState.imageWidth,
          blockMetaState.imageHeight
        );
        blockMetaState.shouldInitImage = false;
      };

      img.src = getImageByStatus(blockMetaState.status);
    } else if (blockMetaState.img) {
      this.context.ctx.drawImage(
        blockMetaState.img,
        0,
        0,
        blockMetaState.img.width,
        blockMetaState.img.height,
        this.state.x + blockMetaState.imageOffsetX,
        this.state.y + blockMetaState.imageOffsetY,
        blockMetaState.imageWidth,
        blockMetaState.imageHeight
      );
    }
  }
}

const SpecificBlockIs = "some-specific-view";

function getImageByStatus(status: EBlockStatus | undefined): string {
  switch (status) {
    case EBlockStatus.DONE: {
      return imageDone;
    }
    case EBlockStatus.FAIL: {
      return imageFail;
    }
    case EBlockStatus.RUNNING: {
      return imageRunning;
    }
    case EBlockStatus.WAITING:
    default: {
      return imageWaiting;
    }
  }
}

const GraphApp = () => {
  const graphRef = useRef<Graph | undefined>(undefined);

  const [config, setConfig] = useState<TGraphConfig | undefined>();

  useEffect(() => {
    const newConfig = generatePrettyBlocks({ layersCount: 10, connectionsPerLayer: 100, dashedLine: true });
    newConfig.settings = {
      ...newConfig.settings,
      blockComponents: { [SpecificBlockIs]: SpecificBlockView },
    };

    newConfig.blocks.forEach((block) => {
      block.is = SpecificBlockIs;
      const randomVal = Math.floor(Math.random() * 4) + 1;
      const meta: TBlockMeta = {
        shouldInitImage: true,
        imageWidth: 1,
        imageHeight: 1,
        imageOffsetX: 1,
        imageOffsetY: 1,
      };
      block.meta = meta;
      switch (randomVal) {
        case 1: {
          meta.status = EBlockStatus.DONE;
          break;
        }
        case 2: {
          meta.status = EBlockStatus.FAIL;
          break;
        }
        case 3: {
          meta.status = EBlockStatus.RUNNING;
          break;
        }
        case 4:
        default: {
          meta.status = EBlockStatus.WAITING;
          break;
        }
      }

      setConfig(newConfig);
    });
  }, []);

  if (!config) return null;

  return (
    <ThemeProvider theme={"light"}>
      <GraphComponentStory graphRef={graphRef} config={config} />
    </ThemeProvider>
  );
};

const meta: Meta = {
  title: "Examples/ImageInsteadBlock",
  component: GraphApp,
};

export default meta;

export const Default: StoryFn = () => <GraphApp />;
