import React, { useEffect, useState } from "react";

import {
  Anchor,
  CanvasBlock,
  ECanDrag,
  GraphComponent,
  SceneComponent,
  defineTag,
  hoveredTag,
  pointerTargetAfter,
} from "@gravity-ui/graph";
import type {
  ChildDescriptor,
  Graph,
  GraphClickEvent,
  TAnchor,
  TAnchorClass,
  TBlock,
  TBlockComponentState,
  TConnection,
  TGraphComponentProps,
  TSceneLevel,
  TScenePrimitive,
  TStyleParts,
} from "@gravity-ui/graph";
import { MiniMapLayer } from "@gravity-ui/graph-minimap";
import { GraphBlock, GraphCanvas, useGraph, useGraphEvent, useLayer, useSignal } from "@gravity-ui/graph-react";
import { Button, Flex, Text, ThemeProvider } from "@gravity-ui/uikit";
import type { Meta, StoryFn } from "@storybook/react-webpack5";

import "@gravity-ui/graph-minimap/styles.css";
import "@gravity-ui/uikit/styles/styles.css";

const runningTag = defineTag("running");

function toggleRunning(graph: Graph, id: string): void {
  const { tags } = graph.scene;
  if (tags.peekOf("block", id).has(runningTag)) tags.delete(runningTag, { block: [id] });
  else tags.add(runningTag, { block: [id] });
}

/**
 * The run button's rectangle, block-local: a square `BUTTON_SIZE` wide, `BUTTON_INSET` in from the block's top right.
 * The scene look (`RunButton.schematic`) and the HTML button read the same numbers, so a click on either hits the same
 * area.
 */
const BUTTON_SIZE = 32;
const BUTTON_INSET = 8;

/** The 1px border of GraphBlock's wrapper (`.graph-block-wrapper`): the HTML's offsets start inside it. */
const WRAPPER_BORDER = 1;

type TRunButtonProps = TGraphComponentProps & { blockId: string; width: number };

/** A run button at the block's top right: a rounded square and a dot, on the schematic and detailed levels. */
class RunButton extends SceneComponent<TRunButtonProps> {
  public static override entityType = "runButton";

  public declare readonly __styleParts?: TStyleParts<"button" | "glyph">;

  public override readonly cursor = "pointer";

  public override getEntityId(): string {
    return this.props.blockId;
  }

  protected override willMount(): void {
    super.willMount();
    // The button is tagged only while hit directly; its block stays tagged over the child.
    this.listenEvents(["pointerenter", "pointerleave"], (event) => {
      this.setHoveredTag(pointerTargetAfter(event) === this);
    });
    this.on("click", (event) => {
      // The button's click is its own: it does not select the block.
      event.stopPropagation();
      toggleRunning(this.context.graph, this.props.blockId);
    });
  }

  /** Too small to click on the minimalistic level: no look, so not hit there either. */
  protected override minimalistic(): readonly TScenePrimitive[] {
    return [];
  }

  /** The detailed level takes this list too (no `detailed` method). */
  protected override schematic(): readonly TScenePrimitive[] {
    const x = this.props.width - BUTTON_INSET - BUTTON_SIZE;
    const half = BUTTON_SIZE / 2;
    return [
      {
        kind: "rect",
        part: "button",
        x,
        y: BUTTON_INSET,
        width: BUTTON_SIZE,
        height: BUTTON_SIZE,
        radius: 6,
        fill: "#e8f0fe",
      },
      { kind: "circle", part: "glyph", cx: x + half, cy: BUTTON_INSET + half, r: 6, fill: "#1a73e8" },
    ];
  }
}

/** OUT anchors are squares: another shape is another anchor class. */
class SquareAnchor extends Anchor {
  public static override SIZE = 14;

  public static override LOOK_EXTENT = 10;

  protected override schematic(): readonly TScenePrimitive[] {
    return [
      { kind: "rect", part: "anchor", x: -7, y: -7, width: 14, height: 14 },
      { kind: "rect", part: "border", x: -7, y: -7, width: 14, height: 14, border: { width: 4 } },
    ];
  }
}

/** The default block's look, a run button child that toggles the `running` tag, and square OUT anchors. */
class StageBlock extends CanvasBlock {
  protected override getAnchorClass(anchor: TAnchor): TAnchorClass {
    return anchor.type === "OUT" ? SquareAnchor : Anchor;
  }

  protected override stateChanged(next: TBlockComponentState): void {
    if (this.state.width !== next.width) this.shouldUpdateChildren = true;
    super.stateChanged(next);
  }

  /** The run button first, so the anchors draw over it. */
  protected override updateChildren(): ChildDescriptor[] {
    return [
      RunButton.create({ blockId: String(this.props.id), width: this.state.width }, { key: "run" }),
      ...super.updateChildren(),
    ];
  }
}

/** The hit component at any level, including a child that handles its own click. */
function describeTarget(target: GraphClickEvent["target"]): string {
  if (target instanceof RunButton) return `the run button of ${target.getEntityId()}`;
  if (target instanceof StageBlock) return `block ${target.getEntityId()}`;
  if (target instanceof Anchor) return `anchor ${target.getEntityId()}`;
  return target instanceof GraphComponent ? "another component" : "background";
}

const blocks: TBlock[] = Array.from({ length: 6 }, (_, i) => ({
  id: `s${i + 1}`,
  is: "Stage",
  name: `Stage ${i + 1}`,
  x: (i % 3) * 320,
  y: Math.floor(i / 3) * 220,
  width: 220,
  height: 120,
  anchors: [
    { id: `s${i + 1}_in`, blockId: `s${i + 1}`, type: "IN" },
    { id: `s${i + 1}_out`, blockId: `s${i + 1}`, type: "OUT" },
  ],
}));

const connections: TConnection[] = [
  { id: "c1", sourceBlockId: "s1", sourceAnchorId: "s1_out", targetBlockId: "s2", targetAnchorId: "s2_in" },
  { id: "c2", sourceBlockId: "s2", sourceAnchorId: "s2_out", targetBlockId: "s3", targetAnchorId: "s3_in" },
  { id: "c3", sourceBlockId: "s4", sourceAnchorId: "s4_out", targetBlockId: "s5", targetAnchorId: "s5_in" },
];

const LEVEL_SCALES: readonly { level: TSceneLevel; scale: number }[] = [
  { level: "minimalistic", scale: 0.18 },
  { level: "schematic", scale: 0.5 },
  { level: "detailed", scale: 1 },
];

/**
 * The HTML view takes the block only once its data is "ready": until then the scene keeps drawing it. Its run button
 * handles both pointer and keyboard activation with the same action as the scene button. Its
 * border reads the block's computed `border` colour, which `GraphBlock` passes as `--graph-block-border-color`
 * (`useEntityStyle`): the `running` rule turns it green here as on the canvas.
 */
function StageHtml({ graph, block }: { graph: Graph; block: TBlock }): React.JSX.Element {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setReady(true), 400);
    return () => window.clearTimeout(timer);
  }, []);
  return (
    <GraphBlock graph={graph} block={block} autoHideCanvas={false} canvasVisible={!ready}>
      <div
        style={{
          padding: 12,
          position: "relative",
          height: "100%",
          boxSizing: "border-box",
          // An inset shadow, not a border, so the button's offsets below stay exact.
          boxShadow: "inset 0 0 0 3px var(--graph-block-border-color)",
        }}
      >
        {ready ? `${block.name} (HTML)` : "Loading…"}
        <button
          type="button"
          aria-label={`Toggle ${block.name}`}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => toggleRunning(graph, String(block.id))}
          style={{
            position: "absolute",
            // Offsets start inside the wrapper's border: this rectangle is the scene button's, block-local.
            top: BUTTON_INSET - WRAPPER_BORDER,
            right: BUTTON_INSET - WRAPPER_BORDER,
            width: BUTTON_SIZE,
            height: BUTTON_SIZE,
            borderRadius: 6,
            background: "#e8f0fe",
            cursor: "pointer",
          }}
        />
      </div>
    </GraphBlock>
  );
}

const renderBlock = <T extends TBlock>(graph: Graph, block: T): React.JSX.Element => (
  <StageHtml graph={graph} block={block} />
);

type SceneInteractionArgs = { renderer: "canvas" | "webgl"; html: boolean; minimap: boolean };

const SceneInteractionApp = ({ renderer, html, minimap }: SceneInteractionArgs): React.JSX.Element => {
  const { graph, start, setEntities, zoomTo } = useGraph({});
  const level = useSignal(graph.scene.$level);
  const rendererState = useSignal(graph.scene.$renderer);
  const [lastClick, setLastClick] = useState("none yet");
  // Capture observes the scene button before it stops propagation.
  useGraphEvent(graph, "click", ({ target }) => setLastClick(describeTarget(target)), { capture: true });
  useLayer(minimap ? graph : null, MiniMapLayer, { location: "bottomRight", width: 200, height: 160 });

  useEffect(() => {
    graph.updateSettings({ blockComponents: { Stage: StageBlock }, canDrag: ECanDrag.ALL });
    setEntities({ blocks, connections });
    const remove = graph.scene.styles.add([
      { target: StageBlock, tags: [runningTag], style: { parts: { border: { color: "#2e7d32" } } } },
      { target: RunButton, tags: [hoveredTag], style: { parts: { button: { color: "#c6dafc" } } } },
    ]);
    start();
    zoomTo("center", { padding: 40 });
    return remove;
  }, [graph, setEntities, start, zoomTo]);

  useEffect(() => {
    graph.updateSettings({ renderer });
  }, [graph, renderer]);

  const zoomToScale = (scale: number): void => {
    const { width, height } = graph.cameraService.getCameraState();
    graph.cameraService.zoom(width / 2, height / 2, scale);
  };

  return (
    <ThemeProvider theme="light">
      <Flex direction="column" style={{ height: "100vh" }}>
        <Flex direction="column" gap={2} style={{ padding: 16 }}>
          <Text variant="header-1">HTML handover and picking</Text>
          <Text variant="body-1">
            Click a blue button to toggle its block’s running state. At detailed zoom the HTML card takes over after 400
            ms. The button should keep the same click target through the handover. The last click appears below.
          </Text>
          <Flex alignItems="center" gap={3} wrap>
            {LEVEL_SCALES.map(({ level: target, scale }) => (
              <Button key={target} view={level === target ? "action" : "normal"} onClick={() => zoomToScale(scale)}>
                Zoom to {target} ({scale})
              </Button>
            ))}
          </Flex>
          <Text variant="body-1" color="secondary">
            graph.scene.$renderer: <b>{rendererState}</b> · graph.scene.$level: <b>{level}</b> · last scene click:{" "}
            <b>{lastClick}</b>
          </Text>
        </Flex>
        <div style={{ flex: 1, position: "relative", minHeight: 400 }}>
          <GraphCanvas graph={graph} className="graph-canvas" renderBlock={html ? renderBlock : undefined} />
        </div>
      </Flex>
    </ThemeProvider>
  );
};

const meta: Meta<SceneInteractionArgs> = {
  id: "canvas-sceneinteraction",
  title: "Scene/Diagnostics/Interaction",
  component: SceneInteractionApp,
  args: { renderer: "canvas", html: true, minimap: false },
  argTypes: {
    renderer: { name: "Renderer", control: "inline-radio", options: ["canvas", "webgl"] },
    html: { name: "HTML at detailed zoom", control: "boolean" },
    minimap: { name: "Minimap", control: "boolean" },
  },
  parameters: { layout: "fullscreen" },
};

export default meta;

export const SceneInteraction: StoryFn<SceneInteractionArgs> = (args) => <SceneInteractionApp {...args} />;
SceneInteraction.storyName = "HTML handover and picking";
