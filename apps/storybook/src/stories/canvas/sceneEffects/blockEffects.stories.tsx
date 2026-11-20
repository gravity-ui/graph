import React, { useEffect, useState } from "react";

import { ECanDrag } from "@gravity-ui/graph";
import type { Graph, TBlock, TSceneRenderer } from "@gravity-ui/graph";
import { GraphCanvas, useGraph, useSignal } from "@gravity-ui/graph-react";
import { Button, Flex, Text, ThemeProvider } from "@gravity-ui/uikit";
import type { Meta, StoryFn } from "@storybook/react-webpack5";

import { glow } from "../webglConnections/lines";

import { EffectCardView } from "./EffectCardView";
import { PlainView, viewConfiguration } from "./blockView";
import {
  EFFECT_CARD_IS,
  EffectCard,
  effectCardId,
  effectCardRules,
  effectCards,
  effectTags,
  effectTitles,
  isEffectCard,
  onCardEncode,
} from "./effectCard";
import type { TEffectCard } from "./effectCard";
import { EFFECT_PARTS } from "./effectPaths";
import type { TEffectPart } from "./effectPaths";

type Args = {
  renderer: TSceneRenderer;
  html: boolean;
  effects: TEffectPart[];
  glowIntensity: number;
  rowsPerSecond: number;
  showEncodes: boolean;
};

function CardEncodeCount({ graph }: { graph: Graph }) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    onCardEncode.set(graph, () => setCount((current) => current + 1));
    return () => {
      onCardEncode.delete(graph);
    };
  }, [graph]);
  return (
    <>
      {" "}
      · Card encodes: <b>{count}</b>
    </>
  );
}

/** The gallery's HTML view: a React card that replaces the scene card at the detailed level. */
const renderEffectCard = (graph: Graph, block: TBlock): React.JSX.Element =>
  isEffectCard(block) ? <EffectCardView graph={graph} block={block} /> : <PlainView graph={graph} block={block} />;

const BlockEffectsApp = ({
  renderer,
  html,
  effects,
  glowIntensity,
  rowsPerSecond,
  showEncodes,
}: Args): React.JSX.Element => {
  const { graph, setEntities, start, zoomTo } = useGraph({ viewConfiguration });
  const rendererState = useSignal(graph.scene.$renderer);
  const level = useSignal(graph.scene.$level);

  useEffect(() => {
    graph.updateSettings({ renderer });
  }, [graph, renderer]);

  useEffect(() => {
    graph.updateSettings({ blockComponents: { [EFFECT_CARD_IS]: EffectCard }, canDrag: ECanDrag.ALL });
    const remove = graph.scene.styles.add(effectCardRules);
    setEntities({ blocks: effectCards });
    start();
    zoomTo("center", { padding: 60 });
    return remove;
  }, [graph, setEntities, start, zoomTo]);

  // Each effect's tag is on its card while the effect is enabled: the rules show the part, nothing is re-encoded.
  useEffect(() => {
    for (const part of EFFECT_PARTS) {
      if (effects.includes(part)) graph.scene.tags.set(effectTags[part], { block: [effectCardId(part)] });
      else graph.scene.tags.clear(effectTags[part]);
    }
  }, [graph, effects]);

  // The throughput is card data: the card is encoded again with the new text and particle speed.
  useEffect(() => {
    const patch: { id: string } & Partial<TEffectCard> = { id: effectCardId("particles"), rowsPerSecond };
    graph.api.updateBlock(patch);
  }, [graph, rowsPerSecond]);

  useEffect(() => {
    const intensity = glow.uniforms.intensity;
    const previous = intensity.value;
    intensity.value = glowIntensity;
    return () => {
      intensity.value = previous;
    };
  }, [glowIntensity]);

  return (
    <ThemeProvider theme="light">
      <Flex direction="column" style={{ height: "100vh" }}>
        <Flex direction="column" gap={2} style={{ padding: 16 }}>
          <Text variant="header-1">What can be animated on a block</Text>
          <Text variant="body-1">
            Choose effects in Controls. WebGL animates the paths, and Canvas shows the base strokes. Enable HTML at
            detailed zoom to see the React cards.
          </Text>
          <Flex alignItems="center" gap={2} wrap>
            <Button onClick={() => graph.zoom({ scale: 1 })}>Detailed (1)</Button>
            <Button onClick={() => graph.zoom({ scale: 0.5 })}>Schematic (0.5)</Button>
            <Text variant="body-1" color="secondary">
              Renderer: <b>{rendererState}</b> · Level: <b>{level}</b>
              {showEncodes && <CardEncodeCount graph={graph} />}
            </Text>
          </Flex>
        </Flex>
        <div style={{ flex: 1, minHeight: 400, position: "relative" }}>
          <GraphCanvas graph={graph} className="graph-canvas" renderBlock={html ? renderEffectCard : undefined} />
        </div>
      </Flex>
    </ThemeProvider>
  );
};

const meta: Meta<Args> = {
  id: "canvas-sceneeffects",
  title: "Scene/Examples/Block styles",
  component: BlockEffectsApp,
  args: {
    renderer: "webgl",
    html: false,
    effects: [...EFFECT_PARTS],
    glowIntensity: 0.6,
    rowsPerSecond: 18400,
    showEncodes: false,
  },
  argTypes: {
    renderer: { name: "Renderer", control: "inline-radio", options: ["canvas", "webgl"] },
    html: { name: "HTML at detailed zoom", control: "boolean" },
    effects: { name: "Effects", options: [...EFFECT_PARTS], control: { type: "check", labels: effectTitles } },
    glowIntensity: { name: "Glow intensity", control: { type: "range", min: 0, max: 1.5, step: 0.05 } },
    rowsPerSecond: { name: "Throughput (rows/s)", control: { type: "range", min: 0, max: 60000, step: 200 } },
    showEncodes: {
      name: "Count card encodes",
      description: "Count geometry encodes from the moment this control is enabled.",
      control: "boolean",
    },
  },
  parameters: { layout: "fullscreen" },
};

export default meta;

export const BlockEffects: StoryFn<Args> = (args) => <BlockEffectsApp {...args} />;
BlockEffects.storyName = "Block effects";
BlockEffects.parameters = {
  docs: {
    description: {
      story:
        "Each card is a `CanvasBlock` subclass whose level methods return a path primitive with an effect " +
        "(`dashFlow`, `pulse`, or the `particles`, `glow` and `gradient` shaders) in its own part. A base rule hides " +
        "the effect parts and one tag per effect shows its part, so `graph.scene.tags` switches an effect without " +
        "running the level methods again. WebGL animates the effects; Canvas 2D draws their static strokes. " +
        "Enable HTML at detailed zoom to replace each scene card with a React card (`GraphBlock`) that shows a " +
        "CSS version of its effect, so the WebGL effects show when zoomed out.",
    },
  },
};
