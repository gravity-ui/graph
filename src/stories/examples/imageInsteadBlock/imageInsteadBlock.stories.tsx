import "@gravity-ui/uikit/styles/styles.css";
import type { Meta, StoryFn } from "@storybook/react";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { GraphComponentStory } from "../../main/GraphEditor";
import { ThemeProvider } from "@gravity-ui/uikit";
import imageDone from "./done.png";
import imageFail from "./fail.png";
import imageRunning from "./running.png";
import imageWaiting from "./waiting.png";
import { TRenderBlockFn, CanvasBlock, TBlock, Graph, TGraphConfig } from "../../../index";
import { generatePrettyBlocks } from "../../configurations/generatePretty";

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
    if (blockMetaState.shouldInitImage) {
      blockMetaState.img = new Image();

      blockMetaState.img.onload = () => {
        const hRatio = this.state.width / blockMetaState.img.width;
        const vRatio = this.state.height / blockMetaState.img.height;
        const imageRatio = Math.min(hRatio, vRatio);

        blockMetaState.imageWidth = blockMetaState.img.width * imageRatio;
        blockMetaState.imageHeight = blockMetaState.img.width * imageRatio;

        blockMetaState.imageOffsetX = (this.state.width - blockMetaState.imageWidth) / 2;
        blockMetaState.imageOffsetY = (this.state.height - blockMetaState.imageHeight) / 2;

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
        blockMetaState.shouldInitImage = false;
      };

      blockMetaState.img.src = getImageByStatus(this.state.meta.status);
    } else {
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

function getImageByStatus(status: EBlockStatus) {
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

  const renderBlockFn: TRenderBlockFn = useCallback(
    (graphObject: Graph, block: TBlock<TBlockMeta>) => {
      const colors = graphRef.current.api.getGraphColors();

      return (
        <div
          style={{
            width: block.width,
            height: block.height,
            contain: "layout size",
            boxShadow: block.selected
              ? `inset 0 0 0 4px ${colors.block.selectedBorder},
            inset 0 0 0 3px ${colors.block.selectedBorder}`
              : `inset 0 0 0 1px ${colors.block.border}`,
            borderRadius: "3px",
            transform: `translate3d(${block.x}px, ${block.y}px, ${0})`,
            willChange: "transform, width, height",
            position: "absolute",
            top: 0,
            left: 0,
          }}
        >
          <img
            style={{ objectFit: "contain", width: block.width, height: block.height, pointerEvents: "none" }}
            src={getImageByStatus(block.meta.status)}
          />
        </div>
      );
    },
    [graphRef]
  );

  useEffect(() => {
    const newConfig = generatePrettyBlocks(10, 100, true);
    newConfig.settings.blockComponents = {};
    newConfig.settings.blockComponents[SpecificBlockIs] = SpecificBlockView;

    newConfig.blocks.forEach((block: TBlock<TBlockMeta>) => {
      block.is = SpecificBlockIs;
      const randomVal = Math.floor(Math.random() * 4) + 1;
      block.meta = {
        shouldInitImage: true,
        imageWidth: 1,
        imageHeight: 1,
        imageOffsetX: 1,
        imageOffsetY: 1,
      };
      switch (randomVal) {
        case 1: {
          block.meta.status = EBlockStatus.DONE;
          break;
        }
        case 2: {
          block.meta.status = EBlockStatus.FAIL;
          break;
        }
        case 3: {
          block.meta.status = EBlockStatus.RUNNING;
          break;
        }
        case 4:
        default: {
          block.meta.status = EBlockStatus.WAITING;
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
