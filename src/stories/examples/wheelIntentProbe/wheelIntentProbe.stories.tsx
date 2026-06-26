import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { Flex, ThemeProvider } from "@gravity-ui/uikit";
import type { Meta, StoryObj } from "@storybook/react-webpack5";

import { TBlock } from "../../../components/canvas/blocks/Block";
import { Graph, GraphState } from "../../../graph";
import type { TMouseWheelBehavior } from "../../../graphConfig";
import { createWheelIntentResolver, enableWheelIntentDebug } from "../../../graphConfig";
import { GraphBlock, GraphCanvas, HookGraphParams, useGraph, useGraphEvent } from "../../../react-components";
import { useFn } from "../../../react-components/utils/hooks/useFn";
import { ECanDrag } from "../../../store/settings";

import { MAX_ENTRIES_CAP, WheelEventLogPanel } from "./WheelEventLogPanel";
import type { TWheelProbeLogEntry } from "./wheelEventCapture";
import { snapshotRawWheelEvent } from "./wheelEventCapture";

import "./WheelEventLogPanel.css";
import "@gravity-ui/uikit/styles/styles.css";

const GRAPH_SETTINGS: NonNullable<HookGraphParams["settings"]> = {
  canDragCamera: true,
  canZoomCamera: true,
  canDuplicateBlocks: false,
  canDrag: ECanDrag.ALL,
  canCreateNewConnections: false,
  showConnectionArrows: false,
  scaleFontSize: 1,
  useBezierConnections: true,
  useBlocksAnchors: true,
  showConnectionLabels: false,
};

type WheelIntentProbeStoryProps = {
  mouseWheelBehavior: TMouseWheelBehavior;
};

function WheelIntentProbeStory({ mouseWheelBehavior }: WheelIntentProbeStoryProps): React.ReactElement {
  const [entries, setEntries] = useState<TWheelProbeLogEntry[]>([]);
  const [paused, setPaused] = useState(false);
  const nextIdRef = useRef(1);
  const pausedRef = useRef(paused);
  const pendingRawRef = useRef<ReturnType<typeof snapshotRawWheelEvent> | null>(null);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  const baseResolveWheelIntent = useMemo(() => createWheelIntentResolver(), []);

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
        resolveWheelIntent: (event: WheelEvent, wb: TMouseWheelBehavior) => {
          pendingRawRef.current = snapshotRawWheelEvent(event);
          return baseResolveWheelIntent(event, wb);
        },
      },
    }),
    [mouseWheelBehavior, baseResolveWheelIntent]
  );

  const { graph, setEntities, start } = useGraph(graphParams);

  useEffect(() => {
    enableWheelIntentDebug((resolverEntry) => {
      if (pausedRef.current) {
        return;
      }

      const raw = pendingRawRef.current;
      pendingRawRef.current = null;
      if (raw === null) {
        return;
      }

      const id = nextIdRef.current;
      nextIdRef.current += 1;

      const probeEntry: TWheelProbeLogEntry = {
        id,
        capturedAt: new Date().toISOString(),
        platform: navigator.platform,
        userAgent: navigator.userAgent,
        raw,
        resolver: resolverEntry,
      };

      setEntries((prev) => [probeEntry, ...prev].slice(0, MAX_ENTRIES_CAP));
    });

    return () => {
      enableWheelIntentDebug(null);
    };
  }, []);

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
          x: 200,
          y: 280,
          width: 220,
          height: 140,
          id: "A",
          is: "Block",
          selected: false,
          name: "Block A",
          anchors: [],
        },
        {
          x: 520,
          y: 280,
          width: 220,
          height: 140,
          id: "B",
          is: "Block",
          selected: false,
          name: "Block B",
          anchors: [],
        },
      ],
      connections: [{ sourceBlockId: "A", targetBlockId: "B" }],
    });
  }, [setEntities]);

  const renderBlockFn = useFn((g: Graph, block: TBlock) => (
    <GraphBlock graph={g} block={block}>
      {block.name}
    </GraphBlock>
  ));

  return (
    <ThemeProvider theme="light">
      <Flex style={{ height: "100vh", width: "100vw" }}>
        <div style={{ flex: "1 1 58%", minWidth: 0, position: "relative" }}>
          <GraphCanvas graph={graph} renderBlock={renderBlockFn} />
        </div>
        <div style={{ flex: "0 0 42%", minWidth: 320, maxWidth: 640 }}>
          <WheelEventLogPanel
            entries={entries}
            mouseWheelBehavior={mouseWheelBehavior}
            paused={paused}
            onPausedChange={setPaused}
            onClear={() => setEntries([])}
          />
        </div>
      </Flex>
    </ThemeProvider>
  );
}

const meta: Meta<typeof WheelIntentProbeStory> = {
  title: "Dev/WheelIntentProbe",
  component: WheelIntentProbeStory,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Live capture of real WheelEvent payloads and resolveWheelIntent output. Use on Windows/macOS with mouse and trackpad, then copy JSON for heuristic tuning.",
      },
    },
  },
  argTypes: {
    mouseWheelBehavior: {
      control: "select",
      options: ["scroll", "zoom"],
      description: "MOUSE_WHEEL_BEHAVIOR constant passed to the resolver.",
    },
  },
  args: {
    mouseWheelBehavior: "zoom",
  },
};

export default meta;

type Story = StoryObj<typeof WheelIntentProbeStory>;

export const Default: Story = {};
