import React, { useCallback, useEffect, useMemo, useState } from "react";

import { BlockGroups, ECanDrag, Group } from "@gravity-ui/graph";
import type { BlockState, Graph, TBlock, TGraphColorsPatch } from "@gravity-ui/graph";
import { MiniMapLayer } from "@gravity-ui/graph-minimap";
import { GraphBlock, GraphCanvas, useGraph, useLayer, useSignal } from "@gravity-ui/graph-react";
import { Button, Flex, SegmentedRadioGroup, Slider, Text, ThemeProvider } from "@gravity-ui/uikit";
import type { Meta, StoryFn } from "@storybook/react-webpack5";

import { glow } from "../webglConnections/lines";

import { EffectCardView } from "./EffectCardView";
import { StageCardView } from "./StageCardView";
import {
  EFFECT_CARD_IS,
  EffectCard,
  effectCardId,
  effectCardRules,
  effectCards,
  effectTags,
  effectTitles,
  getCardEncodes,
  isEffectCard,
  resetCardEncodes,
} from "./effectCard";
import type { TEffectCard } from "./effectCard";
import { EFFECT_PARTS } from "./effectPaths";
import type { TEffectPart } from "./effectPaths";
import { EtlSimulation, createEtlAtScale, pipelineRect } from "./etlAtScale";
import { EtlScaleConnection, etlFlowRules } from "./etlConnection";
import {
  STAGE_IS,
  STAGE_STATUSES,
  StageBlock,
  isStageBlock,
  stageRules,
  stageStatusColors,
  stageStatusEffects,
  stageStatusLabels,
} from "./stageBlock";
import type { TStageStatus } from "./stageBlock";

import "@gravity-ui/graph-minimap/styles.css";
import "@gravity-ui/uikit/styles/styles.css";

type TRenderer = "canvas" | "webgl";

const renderers: { value: TRenderer; content: string }[] = [
  { value: "canvas", content: "Canvas" },
  { value: "webgl", content: "WebGL" },
];

type THtmlMode = "on" | "off";

const htmlModes: { value: THtmlMode; content: string }[] = [
  { value: "on", content: "HTML on" },
  { value: "off", content: "HTML off" },
];

/** A block of another class: its name in a plain view (both stories render their own class only). */
const PlainView = ({ graph, block }: { graph: Graph; block: TBlock }): React.JSX.Element => (
  <GraphBlock graph={graph} block={block}>
    {block.name}
  </GraphBlock>
);

/** White cards on the light canvas; the selection keeps the theme colour. */
const viewConfiguration: { colors: TGraphColorsPatch } = {
  colors: { block: { background: "#ffffff", border: "#d9dce1", text: "#1f2329" } },
};

/** A slider writing an effect's float uniform (a signal shared by every path that uses the effect). */
const UniformSlider = ({
  label,
  uniform,
  min,
  max,
  step,
}: {
  label: string;
  uniform: { value: number };
  min: number;
  max: number;
  step: number;
}): React.JSX.Element => {
  const [value, setValue] = useState(uniform.value);
  return (
    <Flex alignItems="center" gap={2}>
      <Text variant="body-1">{label}</Text>
      <div style={{ width: 180 }}>
        <Slider
          value={value}
          min={min}
          max={max}
          step={step}
          onUpdate={(next) => {
            uniform.value = next;
            setValue(next);
          }}
        />
      </div>
    </Flex>
  );
};

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

/* ------------------------------------------------------------------------------------------------------------------ */
/* Block effects                                                                                                       */
/* ------------------------------------------------------------------------------------------------------------------ */

const glowUniform = glow.uniforms.intensity;

/** The gallery's HTML view: a React card that replaces the scene card at the detailed level. */
const renderEffectCard = (graph: Graph, block: TBlock): React.JSX.Element =>
  isEffectCard(block) ? <EffectCardView graph={graph} block={block} /> : <PlainView graph={graph} block={block} />;

const BlockEffectsApp = (): React.JSX.Element => {
  const { graph, setEntities, start, zoomTo } = useGraph({ viewConfiguration });
  const [renderer, setRenderer] = useState<TRenderer>("webgl");
  // Off by default: the gallery shows the WebGL effects up close, and the HTML would replace them there.
  const [html, setHtml] = useState<THtmlMode>("off");
  const [enabled, setEnabled] = useState<ReadonlySet<TEffectPart>>(() => new Set(EFFECT_PARTS));
  const [rowsPerSecond, setRowsPerSecond] = useState(18400);
  const [encodes, setEncodes] = useState(0);
  const rendererState = useSignal(graph.scene.$renderer);
  const level = useSignal(graph.scene.$level);

  useEffect(() => {
    graph.updateSettings({ renderer });
  }, [graph, renderer]);

  useEffect(() => {
    graph.updateSettings({ blockComponents: { [EFFECT_CARD_IS]: EffectCard }, canDrag: ECanDrag.ALL });
    const remove = graph.scene.styles.add(effectCardRules);
    resetCardEncodes();
    setEntities({ blocks: effectCards });
    start();
    zoomTo("center", { padding: 60 });
    return remove;
  }, [graph, setEntities, start, zoomTo]);

  // Each effect's tag is on its card while the effect is enabled: the rules show the part, nothing is re-encoded.
  useEffect(() => {
    for (const part of EFFECT_PARTS) {
      if (enabled.has(part)) graph.scene.tags.set(effectTags[part], { block: [effectCardId(part)] });
      else graph.scene.tags.clear(effectTags[part]);
    }
  }, [graph, enabled]);

  // The throughput is card data: the card is encoded again with the new text and particle speed.
  useEffect(() => {
    const patch: { id: string } & Partial<TEffectCard> = { id: effectCardId("particles"), rowsPerSecond };
    graph.api.updateBlock(patch);
  }, [graph, rowsPerSecond]);

  useEffect(() => {
    const timer = window.setInterval(() => setEncodes(getCardEncodes()), 300);
    return () => window.clearInterval(timer);
  }, []);

  const toggle = (part: TEffectPart): void => {
    const next = new Set(enabled);
    if (next.has(part)) next.delete(part);
    else next.add(part);
    setEnabled(next);
  };

  return (
    <ThemeProvider theme="light">
      <Flex direction="column" style={{ height: "100vh" }}>
        <Flex direction="column" gap={2} style={{ padding: 16 }}>
          <Text variant="header-1">What can be animated on a block</Text>
          <Text variant="body-1">
            Eight scene blocks, one animated WebGL effect each. An effect is a path primitive with an effect (built-in
            dashFlow and pulse, or a defineConnectionEffect shader from the WebGL connections story), drawn as its own
            part. A base rule hides every effect part; a tag per effect shows its part. The buttons write the tags: the
            effect switches with no geometry change, the encode counter below stays put. The throughput slider changes
            card data instead: that card is encoded again. Canvas 2D does not run effects: it draws each effect path as
            its static stroke (a solid line, no dash). With HTML on, a React card replaces each scene card at the
            detailed level (from scale 0.7) and shows a CSS version of its effect; the effect tags reach it as
            graph-tag-fx-* classes, so the buttons switch it too. Zoom out below 0.7 to see the WebGL effects again.
          </Text>
          <Flex alignItems="center" gap={2} wrap>
            <SegmentedRadioGroup options={renderers} value={renderer} onUpdate={setRenderer} />
            <SegmentedRadioGroup options={htmlModes} value={html} onUpdate={setHtml} />
            <Button onClick={() => graph.zoom({ scale: 1 })}>Detailed (1)</Button>
            <Button onClick={() => graph.zoom({ scale: 0.5 })}>Schematic (0.5)</Button>
            <Button onClick={() => setEnabled(new Set(EFFECT_PARTS))}>All effects on</Button>
            <Button onClick={() => setEnabled(new Set())}>All effects off</Button>
            {EFFECT_PARTS.map((part) => (
              <Button key={part} view={enabled.has(part) ? "action" : "outlined"} onClick={() => toggle(part)}>
                {effectTitles[part]}
              </Button>
            ))}
          </Flex>
          <Flex alignItems="center" gap={4} wrap>
            <UniformSlider label="Glow intensity" uniform={glowUniform} min={0} max={1.5} step={0.05} />
            <Flex alignItems="center" gap={2}>
              <Text variant="body-1">Throughput</Text>
              <div style={{ width: 180 }}>
                <Slider value={rowsPerSecond} min={0} max={60000} step={200} onUpdate={setRowsPerSecond} />
              </div>
            </Flex>
            <Text variant="body-1" color="secondary">
              graph.scene.$renderer: <b>{rendererState}</b> · level: <b>{level}</b> · card encodes: <b>{encodes}</b>
            </Text>
          </Flex>
        </Flex>
        <div style={{ flex: 1, minHeight: 400, position: "relative" }}>
          <GraphCanvas
            graph={graph}
            className="graph-canvas"
            renderBlock={html === "on" ? renderEffectCard : undefined}
          />
        </div>
      </Flex>
    </ThemeProvider>
  );
};

/* ------------------------------------------------------------------------------------------------------------------ */
/* ETL at scale                                                                                                       */
/* ------------------------------------------------------------------------------------------------------------------ */

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
  renderer: TRenderer;
  html: boolean;
  minimap: boolean;
  live: boolean;
  focusOnFailures: boolean;
  view: (typeof ETL_VIEWS)[number];
  selectionGlow: number;
};

const etlDefaults: TEtlAtScaleArgs = {
  blockCount: 1064,
  connectionCount: 1400,
  renderer: "webgl",
  html: true,
  minimap: true,
  live: true,
  focusOnFailures: false,
  view: "fit",
  selectionGlow: 0.6,
};

function boundedCount(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(ETL_COUNT_CONTROL.min, Math.min(ETL_COUNT_CONTROL.max, Math.round(value)));
}

/** World units around the graph when it is fitted: the group frames and the far-zoom rings stay inside. */
const FIT_PADDING = 300;

const EtlAtScaleApp = ({
  blockCount,
  connectionCount,
  renderer,
  html,
  minimap,
  live,
  focusOnFailures,
  view,
  selectionGlow,
}: TEtlAtScaleArgs): React.JSX.Element => {
  const { graph, setEntities, start, zoomTo } = useGraph({ viewConfiguration });
  const constants = graph.graphConstants;
  const data = useMemo(
    () => createEtlAtScale(blockCount, connectionCount, constants),
    [blockCount, connectionCount, constants]
  );
  const simulation = useMemo(() => new EtlSimulation(graph, data), [graph, data]);
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
      connection: EtlScaleConnection,
      blockComponents: { [STAGE_IS]: StageBlock },
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
  }, [graph, data, simulation, setEntities, start]);

  useEffect(() => {
    if (view === "fit") zoomTo("center", { padding: FIT_PADDING });
    else if (view === "pipeline") zoomTo(pipelineRect(data, data.pipelines[0]), { padding: 80 });
    else graph.zoom({ scale: Number(view) });
  }, [data, graph, view, zoomTo]);

  useEffect(() => {
    glowUniform.value = selectionGlow;
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
        <StageCardView graph={graphInstance} block={block} onAction={act} />
      ) : (
        <PlainView graph={graphInstance} block={block} />
      ),
    [act]
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
        <div style={{ flex: 1, minHeight: 400, position: "relative" }}>
          <GraphCanvas graph={graph} className="graph-canvas" renderBlock={html ? renderStage : undefined} />
        </div>
      </Flex>
    </ThemeProvider>
  );
};

const meta: Meta = {
  title: "Canvas/SceneEffects",
  component: BlockEffectsApp,
  parameters: { layout: "fullscreen" },
};

export default meta;

export const BlockEffects: StoryFn = () => <BlockEffectsApp />;
BlockEffects.storyName = "Block effects";
BlockEffects.parameters = {
  docs: {
    description: {
      story:
        "Each card is a `CanvasBlock` subclass whose level methods return a path primitive with an effect " +
        "(`dashFlow`, `pulse`, or the `particles`, `glow` and `gradient` shaders) in its own part. A base rule hides " +
        "the effect parts and one tag per effect shows its part, so `graph.scene.tags` switches an effect without " +
        "running the level methods again. WebGL animates the effects; Canvas 2D draws their static strokes. " +
        '"HTML on" adds a React card (`GraphBlock`) that replaces the scene card at the detailed level and shows a ' +
        "CSS version of its effect, so the WebGL effects show when zoomed out.",
    },
  },
};

export const EtlAtScale: StoryFn<TEtlAtScaleArgs> = (args) => {
  const blockCount = boundedCount(args.blockCount, etlDefaults.blockCount);
  const connectionCount = boundedCount(args.connectionCount, etlDefaults.connectionCount);
  return (
    <EtlAtScaleApp
      key={`${blockCount}/${connectionCount}`}
      {...args}
      blockCount={blockCount}
      connectionCount={connectionCount}
    />
  );
};
EtlAtScale.storyName = "ETL at scale";
EtlAtScale.args = etlDefaults;
EtlAtScale.argTypes = {
  blockCount: { name: "Blocks", control: ETL_COUNT_CONTROL },
  connectionCount: { name: "Connections", control: ETL_COUNT_CONTROL },
  renderer: { name: "Renderer", control: "radio", options: ["webgl", "canvas"] },
  html: { name: "HTML cards", control: "boolean" },
  minimap: { name: "Minimap", control: "boolean" },
  live: { name: "Live", control: "boolean" },
  focusOnFailures: { name: "Focus on failures", control: "boolean" },
  view: {
    name: "View",
    options: [...ETL_VIEWS],
    control: { type: "select", labels: { fit: "Fit all", pipeline: "One pipeline" } },
  },
  selectionGlow: { name: "Selection glow", control: { type: "range", min: 0, max: 1.5, step: 0.05 } },
};
EtlAtScale.parameters = {
  docs: {
    description: {
      story:
        "Vary the number of stages and connections independently in Controls. Stages have different numbers of " +
        "input and output anchors, with room for every port in the scene blocks and HTML cards. " +
        "Hover over a connection to highlight its route. Turn Minimap off to remove its layer and compare performance. " +
        "Live updates ten stage statuses and their touching flows every 500 ms. Focus on failures dims the other " +
        "stages. HTML cards replace the scene blocks at the detailed level and let you run, pause, or retry a stage.",
    },
  },
};
