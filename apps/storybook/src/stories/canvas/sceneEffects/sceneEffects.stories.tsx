import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";

import { BlockGroups, ECanDrag, Group } from "@gravity-ui/graph";
import type { BlockState, Graph, TBlock, TSceneRenderer } from "@gravity-ui/graph";
import { MiniMapLayer } from "@gravity-ui/graph-minimap";
import { GraphCanvas, useGraph, useLayer, useSignal } from "@gravity-ui/graph-react";
import { Flex, Text, ThemeProvider } from "@gravity-ui/uikit";
import { computed, signal } from "@preact/signals-core";
import type { Meta, StoryFn } from "@storybook/react-webpack5";

import { glow } from "../webglConnections/lines";

import { StageCardView } from "./StageCardView";
import { PlainView, viewConfiguration } from "./blockView";
import { EtlSimulation, createEtlAtScale, pipelineRect } from "./etlAtScale";
import { startEtlCameraMotion } from "./etlCameraMotion";
import type { TEtlCameraMotion } from "./etlCameraMotion";
import { createEtlScaleConnection, etlFlowRules } from "./etlConnection";
import {
  STAGE_IS,
  STAGE_STATUSES,
  createStageBlock,
  isStageBlock,
  stageHighlightRules,
  stageRules,
  stageStatusColors,
  stageStatusEffects,
  stageStatusLabels,
} from "./stageBlock";
import type { TStageHighlight, TStageStatus } from "./stageBlock";

import "@gravity-ui/graph-minimap/styles.css";
import "@gravity-ui/uikit/styles/styles.css";

/** Frames per second of the page, counted with requestAnimationFrame over each second; only this text re-renders. */
const Fps = (): React.JSX.Element => {
  const [fps, setFps] = useState(0);
  useEffect(() => {
    let frames = 0;
    let since = performance.now();
    let request = 0;
    const count = (now: number): void => {
      frames++;
      if (now - since >= 1000) {
        setFps(Math.round((frames * 1000) / (now - since)));
        frames = 0;
        since = now;
      }
      request = requestAnimationFrame(count);
    };
    request = requestAnimationFrame(count);
    return () => cancelAnimationFrame(request);
  }, []);
  return <b>{fps}</b>;
};

const PipelineGroup = Group.define({
  style: {
    background: "rgba(47, 124, 246, 0.04)",
    border: "rgba(47, 124, 246, 0.3)",
    borderWidth: 6,
    selectedBackground: "rgba(47, 124, 246, 0.1)",
    selectedBorder: "rgba(47, 124, 246, 0.9)",
  },
  geometry: { padding: [48, 48, 48, 48] },
});

/** One group per pipeline, from the stages' `group` field. */
const PipelineGroups = BlockGroups.withBlockGrouping({
  groupingFn: (blocks: BlockState[]) => {
    const byPipeline: Record<string, BlockState[]> = {};
    for (const block of blocks) {
      const pipeline = block.$state.value.group;
      if (!pipeline) continue;
      if (!byPipeline[pipeline]) byPipeline[pipeline] = [];
      byPipeline[pipeline].push(block);
    }
    return byPipeline;
  },
  mapToGroups: (id, { rect }) => ({ id, rect, component: PipelineGroup }),
});

const ETL_VIEWS = ["fit", "pipeline", "0.05", "0.15", "0.4", "1"] as const;
const ETL_COUNT_CONTROL = { type: "number", min: 100, max: 10_000, step: 1 } as const;

type TEtlAtScaleArgs = {
  blockCount: number;
  connectionCount: number;
  renderer: TSceneRenderer;
  html: boolean;
  minimap: boolean;
  retargetOrdersFlow: boolean;
  live: boolean;
  focusOnFailures: boolean;
  view: (typeof ETL_VIEWS)[number];
  cameraMotion: "manual" | TEtlCameraMotion;
  blockHighlight: TStageHighlight;
  levelTransitions: boolean;
  selectionGlow: number;
  effectMinScale: number;
};

const etlDefaults: TEtlAtScaleArgs = {
  blockCount: 10_000,
  connectionCount: 10_000,
  renderer: "webgl",
  html: true,
  minimap: false,
  retargetOrdersFlow: false,
  live: false,
  focusOnFailures: false,
  view: "fit",
  cameraMotion: "manual",
  blockHighlight: "outline-and-halo",
  levelTransitions: false,
  selectionGlow: 0.6,
  effectMinScale: 0.1,
};

function boundedCount(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(ETL_COUNT_CONTROL.min, Math.min(ETL_COUNT_CONTROL.max, Math.round(value)));
}

/** World units around the graph when it is fitted: the group frames and the far-zoom rings stay inside. */
const FIT_PADDING = 300;

/** Scale interval over which the HTML-only status chip appears after the detailed level starts. */
const STATUS_CHIP_FADE_RANGE = 0.12;

const EtlAtScaleApp = ({
  blockCount,
  connectionCount,
  renderer,
  html,
  minimap,
  retargetOrdersFlow,
  live,
  focusOnFailures,
  view,
  cameraMotion,
  blockHighlight,
  levelTransitions,
  selectionGlow,
  effectMinScale,
}: TEtlAtScaleArgs): React.JSX.Element => {
  const { graph, setEntities, start, zoomTo } = useGraph({ viewConfiguration });
  const constants = graph.graphConstants;
  const data = useMemo(
    () => createEtlAtScale(blockCount, connectionCount, constants),
    [blockCount, connectionCount, constants]
  );
  const simulation = useMemo(() => new EtlSimulation(graph, data), [graph, data]);
  const [transitions] = useState(() => signal(levelTransitions));
  useLayoutEffect(() => {
    transitions.value = levelTransitions;
  }, [transitions, levelTransitions]);
  const components = useMemo(
    () => ({
      connection: createEtlScaleConnection(effectMinScale),
      stage: createStageBlock(effectMinScale, transitions),
    }),
    [effectMinScale, transitions]
  );
  const [counts, setCounts] = useState(() => simulation.counts());
  const sceneState = useSignal(graph.scene.$renderer);
  const level = useSignal(graph.scene.$level);
  const statusOpacity = useMemo(
    () =>
      computed(() => {
        if (!transitions.value) return 1;
        const scale = graph.scene.$cameraFrame.value?.camera.scale ?? graph.$camera.peek().scale;
        return Math.min(1, Math.max(0, (scale - graph.graphConstants.block.SCALES[2]) / STATUS_CHIP_FADE_RANGE));
      }),
    [graph, transitions]
  );

  useLayer(graph, PipelineGroups, { draggable: true, updateBlocksOnDrag: true });
  useLayer(minimap ? graph : null, MiniMapLayer, { location: "bottomRight", width: 280, height: 124 });

  useEffect(() => {
    graph.updateSettings({ renderer });
  }, [graph, renderer]);

  useEffect(() => {
    graph.updateSettings({
      connection: components.connection,
      blockComponents: { [STAGE_IS]: components.stage },
      canDrag: ECanDrag.ALL,
      showConnectionLabels: false,
      useBezierConnections: true,
      showConnectionArrows: true,
      useBlocksAnchors: true,
    });
    const remove = graph.scene.styles.add([...stageRules, ...etlFlowRules]);
    simulation.writeAll();
    setEntities({ blocks: data.blocks, connections: data.connections });
    start();
    return remove;
  }, [graph, data, simulation, components, setEntities, start]);

  useEffect(() => graph.scene.styles.add(stageHighlightRules(blockHighlight)), [graph, blockHighlight]);

  useEffect(() => {
    // Changing effect classes also reloads the original entities above.
    simulation.retargetOrdersFlow(data.connections[0], retargetOrdersFlow);
  }, [components, data, simulation, retargetOrdersFlow]);

  useEffect(() => {
    if (view === "fit") {
      return graph.hitTest.waitUsableRectUpdate((rect) => {
        zoomTo(rect, { padding: FIT_PADDING });
      });
    }
    if (view === "pipeline") zoomTo(pipelineRect(data, data.pipelines[0]), { padding: 80 });
    else graph.zoom({ scale: Number(view) });
    return undefined;
  }, [data, graph, view, zoomTo]);

  useEffect(() => {
    if (cameraMotion === "manual") return undefined;
    let stop: (() => void) | undefined;
    const cancelReady = graph.hitTest.waitUsableRectUpdate(() => {
      stop = startEtlCameraMotion(graph.cameraService, data, cameraMotion);
    });
    return () => {
      cancelReady();
      stop?.();
    };
  }, [cameraMotion, data, graph, view]);

  useEffect(() => {
    const intensity = glow.uniforms.intensity;
    const previous = intensity.value;
    intensity.value = selectionGlow;
    return () => {
      intensity.value = previous;
    };
  }, [selectionGlow]);

  useEffect(() => {
    if (!live) return undefined;
    const timer = window.setInterval(() => {
      simulation.tick(10);
      setCounts(simulation.counts());
    }, 500);
    return () => window.clearInterval(timer);
  }, [simulation, live]);

  useEffect(() => {
    simulation.setFocus(focusOnFailures);
  }, [simulation, focusOnFailures]);

  // The HTML card's button: the action writes the stage's status tag and its flows, as a live tick does.
  const act = useCallback(
    (id: string): void => {
      simulation.act(id);
      setCounts(simulation.counts());
    },
    [simulation]
  );

  // Stable while the simulation is: a new function would render every mounted card again.
  const renderStage = useCallback(
    (graphInstance: Graph, block: TBlock): React.JSX.Element =>
      isStageBlock(block) ? (
        <StageCardView graph={graphInstance} block={block} onAction={act} statusOpacity={statusOpacity} />
      ) : (
        <PlainView graph={graphInstance} block={block} />
      ),
    [act, statusOpacity]
  );

  return (
    <ThemeProvider theme="light">
      <Flex direction="column" style={{ height: "100vh" }}>
        <Flex alignItems="center" gap={4} wrap style={{ padding: "8px 16px" }}>
          <Text variant="body-1" color="secondary">
            {data.blocks.length.toLocaleString()} blocks · {data.connections.length.toLocaleString()} connections ·{" "}
            {data.pipelines.length} groups · scene renderer: <b>{sceneState}</b> · level: <b>{level}</b> · <Fps /> fps
          </Text>
          {STAGE_STATUSES.map((status: TStageStatus) => (
            <Flex key={status} alignItems="center" gap={1}>
              <span
                style={{
                  display: "inline-block",
                  width: 10,
                  height: 10,
                  borderRadius: 5,
                  background: stageStatusColors[status],
                }}
              />
              <Text variant="body-1" color="secondary">
                {stageStatusLabels[status]} {counts[status]}
                {stageStatusEffects[status].length > 0 ? ` (${stageStatusEffects[status].join(", ")})` : ""}
              </Text>
            </Flex>
          ))}
        </Flex>
        <div data-block-highlight={blockHighlight} style={{ flex: 1, minHeight: 400, position: "relative" }}>
          <GraphCanvas graph={graph} className="graph-canvas" renderBlock={html ? renderStage : undefined} />
        </div>
      </Flex>
    </ThemeProvider>
  );
};

const meta: Meta = {
  id: "canvas-sceneeffects",
  title: "Scene/Diagnostics/ETL",
  parameters: { layout: "fullscreen" },
};

export default meta;

export const EtlAtScale: StoryFn<TEtlAtScaleArgs> = (args) => {
  const blockCount = boundedCount(args.blockCount, etlDefaults.blockCount);
  const connectionCount = boundedCount(args.connectionCount, etlDefaults.connectionCount);
  const effectMinScale = Number.isFinite(args.effectMinScale)
    ? Math.max(0, Math.min(0.7, args.effectMinScale))
    : etlDefaults.effectMinScale;
  return (
    <EtlAtScaleApp
      key={`${blockCount}/${connectionCount}`}
      {...args}
      blockCount={blockCount}
      connectionCount={connectionCount}
      effectMinScale={effectMinScale}
    />
  );
};
EtlAtScale.storyName = "ETL at scale";
EtlAtScale.args = etlDefaults;
EtlAtScale.argTypes = {
  blockCount: { name: "Blocks", table: { category: "Data" }, control: ETL_COUNT_CONTROL },
  connectionCount: { name: "Connections", table: { category: "Data" }, control: ETL_COUNT_CONTROL },
  renderer: { name: "Renderer", table: { category: "Appearance" }, control: "radio", options: ["webgl", "canvas"] },
  html: { name: "HTML cards", table: { category: "Appearance" }, control: "boolean" },
  minimap: { name: "Minimap", table: { category: "Appearance" }, control: "boolean" },
  retargetOrdersFlow: {
    name: "Retarget Orders DB flow",
    table: { category: "Data" },
    description:
      "Choose View → One pipeline. Switch the Orders DB output from Extract orders (in-0) to Ingest events (in-1). Switch off to restore it.",
    control: "boolean",
  },
  live: { name: "Live", table: { category: "Data" }, control: "boolean" },
  levelTransitions: { name: "Level transitions", table: { category: "Appearance" }, control: "boolean" },
  focusOnFailures: { name: "Focus on failures", table: { category: "Appearance" }, control: "boolean" },
  view: {
    name: "View",
    table: { category: "Camera" },
    options: [...ETL_VIEWS],
    control: { type: "select", labels: { fit: "Fit all", pipeline: "One pipeline" } },
  },
  cameraMotion: {
    name: "Camera motion",
    table: { category: "Camera" },
    options: ["manual", "zoom", "pan"],
    control: { type: "select", labels: { manual: "Manual", zoom: "Zoom cycle", pan: "Circular pan" } },
  },
  blockHighlight: {
    name: "Block highlight",
    table: { category: "Appearance" },
    options: ["off", "base", "outline", "outline-and-halo"],
    control: {
      type: "select",
      labels: {
        off: "Original selection",
        base: "Base selection",
        outline: "Outline",
        "outline-and-halo": "Outline and halo",
      },
    },
  },
  selectionGlow: {
    name: "Original selection glow",
    table: { category: "Appearance" },
    if: { arg: "blockHighlight", eq: "off" },
    control: { type: "range", min: 0, max: 1.5, step: 0.05 },
  },
  effectMinScale: {
    name: "Effect min scale",
    table: { category: "Appearance" },
    description:
      "Below this scale, status outlines and running flows become steady. Overview throughput particles disappear. Set 0 to keep WebGL effects active at every scale.",
    control: { type: "number", min: 0, max: 0.7, step: 0.05 },
  },
};
EtlAtScale.parameters = {
  docs: {
    description: {
      story:
        "The story starts with 10,000 stages and 10,000 connections. Vary either count independently in Controls. " +
        "Camera motion can run a 20-second zoom cycle from 0.05 to 0.9 and back around a central pipeline, " +
        "or pan in a circle at the current scale over 16 seconds. Stages have different numbers of " +
        "input and output anchors, with room for every port in the scene blocks and HTML cards. " +
        "Hover or select a stage to outline its body and ports. Block highlight compares the original selection, " +
        "the base selection without glow, the outline alone, and the outline with a soft halo. Hover over a connection to highlight its route. Enable Minimap in Controls to show the graph overview. " +
        "In the overview, throughput particles appear only while WebGL animates them. Below Effect min scale, " +
        "status outlines and running flows become steady. Enable Level transitions to reveal stage labels, throughput and the HTML status chip gradually as you zoom in. " +
        "The stage keeps its status tint through zoom and HTML handoff. " +
        "Hover highlighting still animates one connection at any scale. " +
        "Changing the control reconfigures the scene; zooming across the cutoff keeps the same geometry. " +
        "Enable Live independently to update ten stage statuses and their touching flows every 500 ms. " +
        "Focus on failures dims the other stages. HTML cards replace the scene blocks at the detailed level " +
        "and let you run, pause, or retry a stage.",
    },
  },
};
