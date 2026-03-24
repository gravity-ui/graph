import React, { useEffect, useLayoutEffect, useMemo, useState } from "react";

import { Flex, Text, ThemeProvider } from "@gravity-ui/uikit";
import type { Meta, StoryObj } from "@storybook/react-webpack5";

import { TBlock } from "../../../components/canvas/blocks/Block";
import { Graph, GraphState } from "../../../graph";
import type { TMouseWheelBehavior } from "../../../graphConfig";
import { EWheelDeviceKind, defaultResolveWheelDevice } from "../../../graphConfig";
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

const DEVICE_LABEL: Record<EWheelDeviceKind, string> = {
  [EWheelDeviceKind.Mouse]: "Mouse wheel",
  [EWheelDeviceKind.Trackpad]: "Trackpad",
};

type MouseWheelBehaviorStoryProps = {
  /** Camera constant: vertical wheel when input is classified as mouse wheel. */
  mouseWheelBehavior: TMouseWheelBehavior;
};

function GraphWithMouseWheelBehaviorScroll({ mouseWheelBehavior }: MouseWheelBehaviorStoryProps) {
  const [resolvedWheelDevice, setResolvedWheelDevice] = useState<EWheelDeviceKind | null>(null);

  const graphParams = useMemo<HookGraphParams>(
    () => ({
      viewConfiguration: {
        constants: {
          camera: {
            MOUSE_WHEEL_BEHAVIOR: mouseWheelBehavior,
          },
        },
      },
      settings: {
        ...GRAPH_SETTINGS,
        resolveWheelDevice: (event: WheelEvent) => {
          const kind = defaultResolveWheelDevice(event);
          setResolvedWheelDevice(kind);
          return kind;
        },
      },
    }),
    [mouseWheelBehavior, setResolvedWheelDevice]
  );

  const { graph, setEntities, start } = useGraph(graphParams);

  useEffect(() => {
    setResolvedWheelDevice(null);
  }, [mouseWheelBehavior]);

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
            <strong>MOUSE_WHEEL_BEHAVIOR</strong> (constants): <strong>{mouseWheelBehavior}</strong> — change via
            Storybook Controls
          </Text>
          <Text variant={"body-2"} color={"secondary"}>
            <strong>Resolved wheel device</strong> (from <code>resolveWheelDevice</code> / heuristics):{" "}
            {resolvedWheelDevice === null ? (
              "scroll over the canvas with a mouse or trackpad"
            ) : (
              <strong>{DEVICE_LABEL[resolvedWheelDevice]}</strong>
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
        "Camera constant MOUSE_WHEEL_BEHAVIOR: how vertical wheel behaves when input is classified as mouse wheel (not trackpad).",
    },
  },
  args: {
    mouseWheelBehavior: "scroll",
  },
};

export default meta;

type Story = StoryObj<typeof GraphWithMouseWheelBehaviorScroll>;

export const Default: Story = {};
