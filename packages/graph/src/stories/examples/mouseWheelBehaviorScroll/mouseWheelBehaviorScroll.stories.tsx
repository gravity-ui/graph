import React, { useEffect, useLayoutEffect, useMemo, useState } from "react";

import { Flex, Text, ThemeProvider } from "@gravity-ui/uikit";
import type { Meta, StoryObj } from "@storybook/react-webpack5";

import { TBlock } from "../../../components/canvas/blocks/Block";
import { Graph, GraphState } from "../../../graph";
import type { TMouseWheelBehavior, TWheelInputDevice } from "../../../graphConfig";
import { EWheelIntent, enableWheelIntentDebug } from "../../../graphConfig";
import { GraphBlock, GraphCanvas, HookGraphParams, useGraph, useGraphEvent } from "../../../react-components";
import { useFn } from "../../../react-components/utils/hooks/useFn";
import { ECanDrag } from "../../../store/settings";

import "@gravity-ui/uikit/styles/styles.css";

const GRAPH_SETTINGS: NonNullable<HookGraphParams["settings"]> = {
  canDragCamera: true,
  canZoomCamera: true,
  canDuplicateBlocks: false,
  canDrag: ECanDrag.ALL,
  canCreateNewConnections: true,
  showConnectionArrows: false,
  scaleFontSize: 1,
  useBezierConnections: true,
  useBlocksAnchors: true,
  showConnectionLabels: false,
};

const INTENT_LABEL: Record<EWheelIntent, string> = {
  [EWheelIntent.Pan]: "Pan",
  [EWheelIntent.Zoom]: "Zoom",
};

type MouseWheelBehaviorStoryProps = {
  /** Camera constant: vertical wheel when input is classified as mouse wheel. */
  mouseWheelBehavior: TMouseWheelBehavior;
  /** Camera constant: explicit wheel device when auto heuristics are ambiguous. */
  wheelInputDevice: TWheelInputDevice;
};

function GraphWithMouseWheelBehaviorScroll({ mouseWheelBehavior, wheelInputDevice }: MouseWheelBehaviorStoryProps) {
  const [resolvedWheelIntent, setResolvedWheelIntent] = useState<EWheelIntent | null>(null);

  const graphParams = useMemo<HookGraphParams>(
    () => ({
      viewConfiguration: {
        constants: {
          camera: {
            MOUSE_WHEEL_BEHAVIOR: mouseWheelBehavior,
            WHEEL_INPUT_DEVICE: wheelInputDevice,
          },
        },
      },
      settings: GRAPH_SETTINGS,
    }),
    [mouseWheelBehavior, wheelInputDevice]
  );

  const { graph, setEntities, start } = useGraph(graphParams);

  useEffect(() => {
    enableWheelIntentDebug((entry) => {
      setResolvedWheelIntent(entry.result);
    });
    return () => {
      enableWheelIntentDebug(null);
    };
  }, []);

  useEffect(() => {
    setResolvedWheelIntent(null);
  }, [mouseWheelBehavior, wheelInputDevice]);

  useGraphEvent(graph, "state-change", ({ state }) => {
    if (state === GraphState.ATTACHED) {
      start();
      graph.zoomTo("center", { padding: 300 });
    }
  });

  useLayoutEffect(() => {
    setEntities({
      blocks: [
        {
          x: 265,
          y: 334,
          width: 200,
          height: 160,
          id: "Left",
          is: "Block",
          selected: false,
          name: "Left block",
          anchors: [],
        },
        {
          x: 565,
          y: 234,
          width: 200,
          height: 160,
          id: "Right",
          is: "Block",
          selected: false,
          name: "Right block",
          anchors: [],
        },
      ],
      connections: [
        {
          sourceBlockId: "Left",
          targetBlockId: "Right",
        },
      ],
    });
  }, [setEntities]);

  const renderBlockFn = useFn((g: Graph, block: TBlock) => {
    return (
      <GraphBlock graph={g} block={block}>
        {block.id.toLocaleString()}
      </GraphBlock>
    );
  });

  return (
    <ThemeProvider theme={"light"}>
      <Flex direction={"column"} style={{ height: "100vh" }}>
        <Flex
          direction={"column"}
          gap={2}
          style={{
            flexShrink: 0,
            padding: "12px 16px",
            borderBottom: "1px solid var(--g-color-line-generic)",
            background: "var(--g-color-base-background)",
          }}
        >
          <Text variant={"body-2"}>
            <strong>MOUSE_WHEEL_BEHAVIOR</strong> (constants): <strong>{mouseWheelBehavior}</strong> ·{" "}
            <strong>WHEEL_INPUT_DEVICE</strong> (constants): <strong>{wheelInputDevice}</strong> — change via Storybook
            Controls
          </Text>
          <Text variant={"body-2"} color={"secondary"}>
            <strong>Resolved wheel intent</strong> (from <code>resolveWheelIntent</code> / heuristics):{" "}
            {resolvedWheelIntent === null ? (
              "scroll over the canvas with a mouse or trackpad"
            ) : (
              <strong>{INTENT_LABEL[resolvedWheelIntent]}</strong>
            )}
          </Text>
        </Flex>
        <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
          <GraphCanvas graph={graph} renderBlock={renderBlockFn} />
        </div>
      </Flex>
    </ThemeProvider>
  );
}

const meta: Meta<typeof GraphWithMouseWheelBehaviorScroll> = {
  title: "Examples/MouseWheelBehaviorScroll",
  component: GraphWithMouseWheelBehaviorScroll,
  parameters: {
    layout: "fullscreen",
  },
  argTypes: {
    mouseWheelBehavior: {
      control: "select",
      options: ["scroll", "zoom"],
      description:
        "Camera constant MOUSE_WHEEL_BEHAVIOR: pan vs zoom for ambiguous mouse-wheel gestures (see resolveWheelIntent I4).",
    },
    wheelInputDevice: {
      control: "select",
      options: ["auto", "mouse", "trackpad"],
      description:
        "Camera constant WHEEL_INPUT_DEVICE: force mouse or trackpad classification instead of auto heuristics.",
    },
  },
  args: {
    mouseWheelBehavior: "scroll",
    wheelInputDevice: "auto",
  },
};

export default meta;

type Story = StoryObj<typeof GraphWithMouseWheelBehaviorScroll>;

export const Default: Story = {};
