import React, { useEffect, useState } from "react";

import {
  Anchor,
  CanvasBlock,
  ECanDrag,
  GraphComponent,
  SceneComponent,
  defineTag,
  getEventTarget,
  hoveredTag,
  pointerTargetAfter,
} from "@gravity-ui/graph";
import type {
  ChildDescriptor,
  Graph,
  TAnchor,
  TAnchorClass,
  TBlock,
  TBlockView,
  TConnection,
  TGraphComponentProps,
  TSceneLevel,
  TScenePrimitive,
  TStyleParts,
} from "@gravity-ui/graph";
import { MiniMapLayer } from "@gravity-ui/graph-minimap";
import { GraphBlock, GraphCanvas, useGraph, useGraphEvent, useLayer, useSignal } from "@gravity-ui/graph-react";
import { Button, Flex, SegmentedRadioGroup, Text, ThemeProvider } from "@gravity-ui/uikit";
import type { Meta, StoryFn } from "@storybook/react-webpack5";

import "@gravity-ui/graph-minimap/styles.css";
import "@gravity-ui/uikit/styles/styles.css";

const runningTag = defineTag("running");

/**
 * The run button's rectangle, block-local: a square `BUTTON_SIZE` wide, `BUTTON_INSET` in from the block's top right.
 * The scene look (`RunButton.schematic`) and the HTML button read the same numbers, so a click on either hits the same
 * area (D4).
 */
const BUTTON_SIZE = 32;
const BUTTON_INSET = 8;

/** The 1px border of GraphBlock's wrapper (`.graph-block-wrapper`): the HTML's offsets start inside it. */
const WRAPPER_BORDER = 1;

type TRunButtonView = { width: number };

/** A run button at the block's top right: a rounded square and a dot, on the schematic and detailed levels. */
class RunButton extends SceneComponent<TRunButtonView, TGraphComponentProps & { blockId: string }> {
  public static override entityType = "runButton";

  public declare readonly __styleParts?: TStyleParts<"button" | "glyph">;

  public override readonly cursor = "pointer";

  public override getEntityId(): string {
    return this.props.blockId;
  }

  protected override willMount(): void {
    super.willMount();
    // The button tags itself while it is the pointer's target (D5: a custom child decides; no default does it). Its
    // block, a library Block, stays tagged over it.
    const followHover = (event: Event): void => this.setHoveredTag(pointerTargetAfter(event) === this);
    // Component listeners live as long as the component: they are removed on unmount (`EventedComponent.unmount`).
    this.addEventListener("mouseenter", followHover);
    this.addEventListener("mouseleave", followHover);
    this.addEventListener("click", (event: Event) => {
      // The button's click is its own: it does not select the block.
      event.stopPropagation();
      const { tags } = this.context.graph.scene;
      const id = this.props.blockId;
      if (tags.peekOf("block", id).has(runningTag)) tags.delete(runningTag, { block: [id] });
      else tags.add(runningTag, { block: [id] });
    });
  }

  /** The button follows the block's width (its view data). */
  protected override getViewData(): TRunButtonView {
    const block = this.getParent();
    const view = block instanceof SceneComponent ? (block.readSceneView() as TBlockView | undefined) : undefined;
    return { width: view?.width ?? 200 };
  }

  /** Too small to click on the minimalistic level: no look, so not hit there either. */
  protected override minimalistic(): readonly TScenePrimitive[] {
    return [];
  }

  /** The detailed level takes this list too (no `detailed` method). */
  protected override schematic(view: TRunButtonView): readonly TScenePrimitive[] {
    const x = view.width - BUTTON_INSET - BUTTON_SIZE;
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

  /** The run button first, so the anchors draw over it. */
  protected override updateChildren(): ChildDescriptor[] {
    return [RunButton.create({ blockId: String(this.props.id) }, { key: "run" }), ...super.updateChildren()];
  }
}

/** What the last click on the graph hit, read from the graph bus with `getEventTarget` (D4, D5). */
function describeTarget(target: GraphComponent | undefined): string {
  if (target instanceof RunButton) return `the run button of ${target.getEntityId()}`;
  if (target instanceof StageBlock) return `block ${target.getEntityId()}`;
  if (target instanceof Anchor) return `anchor ${target.getEntityId()}`;
  return target ? "another component" : "no component (the camera)";
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
 * has no handler: a click on it bubbles to the graph root, where GraphLayer targets the block's RunButton (D4). Its
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
        <div
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

const SceneInteractionApp = (): React.JSX.Element => {
  const { graph, start, setEntities, zoomTo } = useGraph({});
  const [renderer, setRenderer] = useState<"canvas" | "webgl">("canvas");
  const [html, setHtml] = useState<"on" | "off">("on");
  const level = useSignal(graph.scene.$level);
  const rendererState = useSignal(graph.scene.$renderer);
  const [lastClick, setLastClick] = useState("none yet");
  // The bus's click carries the native event; `getEventTarget` names the graph component it hit, also when that
  // component stopped the click (the run button does) and when the click came from the HTML button.
  useGraphEvent(graph, "click", (detail) => setLastClick(describeTarget(getEventTarget(detail.sourceEvent))));
  useLayer(graph, MiniMapLayer, { location: "bottomRight", width: 200, height: 160 });

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
          <Text variant="header-1">Child components, anchor classes, the HTML handover and the minimap</Text>
          <Text variant="body-1">
            The blue button is a child scene component of each block: click it to toggle the block&apos;s running tag,
            hover it to see its hover rule. OUT anchors are a square anchor class. With HTML on, the detailed level
            shows HTML blocks after a short &quot;loading&quot;; the scene draws each block until its view is ready,
            zooming out draws the blocks again in the same frame, and the HTML button reaches the same component.
          </Text>
          <Flex alignItems="center" gap={3} wrap>
            <SegmentedRadioGroup
              options={[
                { value: "canvas", content: "Canvas" },
                { value: "webgl", content: "WebGL" },
              ]}
              value={renderer}
              onUpdate={setRenderer}
            />
            <SegmentedRadioGroup
              options={[
                { value: "on", content: "HTML on" },
                { value: "off", content: "HTML off" },
              ]}
              value={html}
              onUpdate={setHtml}
            />
            {LEVEL_SCALES.map(({ level: target, scale }) => (
              <Button key={target} view={level === target ? "action" : "normal"} onClick={() => zoomToScale(scale)}>
                Zoom to {target} ({scale})
              </Button>
            ))}
          </Flex>
          <Text variant="body-1" color="secondary">
            graph.scene.$renderer: <b>{rendererState}</b> · graph.scene.$level: <b>{level}</b> · last click:{" "}
            <b>{lastClick}</b>
          </Text>
        </Flex>
        <div style={{ flex: 1, position: "relative", minHeight: 400 }}>
          <GraphCanvas graph={graph} className="graph-canvas" renderBlock={html === "on" ? renderBlock : undefined} />
        </div>
      </Flex>
    </ThemeProvider>
  );
};

const meta: Meta = {
  title: "Canvas/SceneInteraction",
  component: SceneInteractionApp,
  parameters: { layout: "fullscreen" },
};

export default meta;

export const SceneInteraction: StoryFn = () => <SceneInteractionApp />;
