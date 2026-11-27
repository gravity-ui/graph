import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState, useSyncExternalStore } from "react";

import { BlockGroups, Group } from "@gravity-ui/graph";
import type { BlockState, Graph, TBlock, TSceneRenderer } from "@gravity-ui/graph";
import { MiniMapLayer } from "@gravity-ui/graph-minimap";
import { GraphCanvas, useGraph, useLayer, useSignal } from "@gravity-ui/graph-react";
import { Flex, Text, ThemeProvider } from "@gravity-ui/uikit";
import { signal } from "@preact/signals-core";
import type { Meta, StoryFn } from "@storybook/react-webpack5";

import { PointerDragPanel } from "./PointerDragPanel";
import { StageCardView } from "./StageCardView";
import { PlainView, viewConfiguration } from "./blockView";
import { glow } from "./effectPaths";
import { EtlSimulation, createEtlAtScale, pipelineRect } from "./etlAtScale";
import { startEtlCameraMotion } from "./etlCameraMotion";
import type { TEtlCameraMotion } from "./etlCameraMotion";
import { createEtlScaleConnection, etlFlowRules } from "./etlConnection";
import {
  STAGE_IS,
  STAGE_STATUSES,
  createStageBlock,
  isStageBlock,
  stageRules,
  stageStatusColors,
  stageStatusEffects,
  stageStatusLabels,
} from "./stageBlock";
import type { TStageStatus } from "./stageBlock";

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
  live: boolean;
  focusOnFailures: boolean;
  view: (typeof ETL_VIEWS)[number];
  cameraMotion: "manual" | TEtlCameraMotion;
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
  live: false,
  focusOnFailures: false,
  view: "fit",
  cameraMotion: "manual",
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

const etlSettings = { yieldBeforeSceneLoad: true };

function SceneLoadingOverlay({ graph }: { graph: Graph }) {
  const subscribe = useCallback((notify: () => void) => graph.on("scene-state-change", notify), [graph]);
  const snapshot = () => graph.scene.state;
  const state = useSyncExternalStore(subscribe, snapshot, snapshot);
  if (state === "ready") return null;
  return (
    <div
      role="status"
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 10,
        display: "grid",
        placeItems: "center",
        background: "var(--g-color-base-float, white)",
        pointerEvents: "none",
      }}
    >
      {state === "switch" ? "Switching renderer…" : "Loading scene…"}
    </div>
  );
}

const EtlAtScaleApp = ({
  blockCount,
  connectionCount,
  renderer,
  html,
  minimap,
  live,
  focusOnFailures,
  view,
  cameraMotion,
  levelTransitions,
  selectionGlow,
  effectMinScale,
  pointerDebug = false,
}: TEtlAtScaleArgs & { pointerDebug?: boolean }): React.JSX.Element => {
  const { graph, setEntities, start, zoomTo } = useGraph({ viewConfiguration, settings: etlSettings });
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
  useLayer(graph, PipelineGroups, { draggable: true, updateBlocksOnDrag: true });
  useLayer(minimap ? graph : null, MiniMapLayer, { location: "bottomRight", width: 280, height: 124 });

  useEffect(() => {
    graph.updateSettings({ renderer });
  }, [graph, renderer]);

  useEffect(() => {
    graph.updateSettings({
      connection: components.connection,
      blockComponents: { [STAGE_IS]: components.stage },
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

  useEffect(() => {
    if (pointerDebug) {
      return graph.hitTest.waitUsableRectUpdate(() => {
        zoomTo(["p01/orders", "p01/ingest"], { padding: 56, transition: 0 });
      });
    }
    if (view === "fit") {
      return graph.hitTest.waitUsableRectUpdate((rect) => {
        zoomTo(rect, { padding: FIT_PADDING });
      });
    }
    if (view === "pipeline") zoomTo(pipelineRect(data, data.pipelines[0]), { padding: 80 });
    else graph.zoom({ scale: Number(view) });
    return undefined;
  }, [data, graph, pointerDebug, view, zoomTo]);

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

  // A new render function re-renders every mounted card.
  const renderStage = useCallback(
    (graphInstance: Graph, block: TBlock): React.JSX.Element =>
      isStageBlock(block) ? (
        <StageCardView graph={graphInstance} block={block} onAction={act} />
      ) : (
        <PlainView graph={graphInstance} block={block} />
      ),
    [act]
  );

  const canvas = (
    <div style={{ flex: 1, minHeight: pointerDebug ? 0 : 400, position: "relative" }}>
      <GraphCanvas graph={graph} className="graph-canvas" renderBlock={html ? renderStage : undefined} />
      <SceneLoadingOverlay graph={graph} />
    </div>
  );

  if (pointerDebug) {
    return (
      <ThemeProvider theme="light">
        <PointerDragPanel graph={graph}>{canvas}</PointerDragPanel>
      </ThemeProvider>
    );
  }

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
        {canvas}
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
  live: { name: "Live", table: { category: "Data" }, control: "boolean" },
  levelTransitions: {
    name: "Level transitions",
    table: { category: "Appearance" },
    description: "Gradually reveal scene labels and throughput as the camera zooms.",
    control: "boolean",
  },
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
  selectionGlow: {
    name: "Selection glow",
    table: { category: "Appearance" },
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
        "Select a stage to highlight it. Hover over a connection to highlight its route. Enable Minimap in Controls to show the graph overview. " +
        "In the overview, throughput particles appear only while WebGL animates them. Below Effect min scale, " +
        "status outlines and running flows become steady. Enable Level transitions to reveal scene labels and throughput as you zoom. " +
        "The stage keeps its status tint through zoom and HTML handoff. " +
        "Hover highlighting still animates one connection at any scale. " +
        "Changing the control reconfigures the scene; zooming across the cutoff keeps the same geometry. " +
        "Enable Live independently to update ten stage statuses and their touching flows every 500 ms. " +
        "Focus on failures dims the other stages. HTML cards replace the scene blocks at the detailed level " +
        "and let you run, pause, or retry a stage.",
    },
  },
};

export const PointerDrag: StoryFn = () => (
  <EtlAtScaleApp {...etlDefaults} blockCount={100} connectionCount={100} pointerDebug />
);
PointerDrag.storyName = "Pointer drag on ETL";
