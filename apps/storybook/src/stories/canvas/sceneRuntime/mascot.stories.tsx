import React, { useEffect, useState } from "react";

import { GraphCanvas, useGraph, useSignal } from "@gravity-ui/graph-react";
import { signal } from "@preact/signals-core";
import type { Meta, StoryFn } from "@storybook/react-webpack5";

import { OrbitLayer, animateOrbit, orbitBounds } from "./orbitMascot";
import { TexturedOrbitLayer, syncOrbitPlayback } from "./texturedOrbit";
import type { SpriteParams } from "./texturedOrbit";

import atlasUrl from "./orbit-sprites.png";

type OrbitArgs = { present: boolean; animate: boolean; shimmer?: boolean };

function OrbitScene({ present, animate, shimmer = true, textured = false }: OrbitArgs & { textured?: boolean }) {
  const { graph, start, zoomTo } = useGraph({ settings: { renderer: "webgl" } });
  const renderer = useSignal(graph.scene.$renderer);
  const [elapsed] = useState(() => signal(0));
  const [playback] = useState(() => signal<SpriteParams>([0, 0, 0, 0]));
  const [atlas, setAtlas] = useState<HTMLImageElement | "failed" | null>(null);

  useEffect(() => {
    start();
    zoomTo(orbitBounds, { padding: 24 });
  }, [start, zoomTo]);

  useEffect(() => {
    if (!textured) return undefined;
    let mounted = true;
    const image = new Image();
    image.src = atlasUrl;
    image.decode().then(
      () => {
        if (mounted) setAtlas(image);
      },
      () => {
        if (mounted) setAtlas("failed");
      }
    );
    return () => {
      mounted = false;
    };
  }, [textured]);

  const visible = present && renderer === "webgl";
  const image = atlas && atlas !== "failed" ? atlas : null;

  useEffect(() => {
    if (!visible) return undefined;
    if (textured && !image) return undefined;
    const layer =
      textured && image
        ? graph.addLayer(TexturedOrbitLayer, { image, playback })
        : graph.addLayer(OrbitLayer, { elapsed });
    return () => graph.removeLayer(layer);
  }, [graph, elapsed, image, playback, textured, visible]);

  useEffect(() => {
    if (textured) return syncOrbitPlayback(graph, playback, Boolean(visible && image && animate), shimmer);
    if (visible && animate) return animateOrbit(graph, elapsed);
    return undefined;
  }, [graph, elapsed, image, playback, textured, visible, animate, shimmer]);

  let status: string | undefined;
  if (present) {
    if (renderer === "webgl-fallback") status = "Orbit requires WebGL 2, which is unavailable.";
    else if (renderer === "lost" || renderer === "restoring") status = "Waiting for WebGL to be restored…";
    else if (renderer !== "webgl") status = "Starting WebGL…";
    else if (textured && atlas === "failed") status = "The Orbit sprite sheet could not be loaded.";
    else if (textured && !image) status = "Loading the Orbit sprite sheet…";
  }

  return (
    <div style={{ height: "100vh", position: "relative" }}>
      <div
        style={{ height: "100%" }}
        role="img"
        aria-label={visible && (!textured || image) ? "Orbit, a turquoise robot with an amber antenna" : "Empty scene"}
      >
        <GraphCanvas graph={graph} className="graph-canvas" />
      </div>
      {status && (
        <div
          role="status"
          style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", pointerEvents: "none" }}
        >
          {status}
        </div>
      )}
    </div>
  );
}

const meta: Meta<OrbitArgs> = {
  id: "canvas-scene-elements",
  title: "Scene/Examples/Custom elements",
  args: { present: true, animate: true },
  argTypes: {
    present: { name: "Show mascot", control: "boolean" },
    animate: { name: "Animate", control: "boolean" },
  },
  parameters: { layout: "fullscreen" },
};

export default meta;

export const OrbitMascot: StoryFn<OrbitArgs> = (args) => <OrbitScene {...args} />;
OrbitMascot.parameters = {
  docs: {
    description: {
      story:
        "Orbit walks back and forth and stops at each end to wave. The body and limbs are separate WebGL scene elements.",
    },
  },
};

export const TexturedOrbit: StoryFn<OrbitArgs> = (args) => <OrbitScene {...args} textured />;
TexturedOrbit.args = { shimmer: true };
TexturedOrbit.argTypes = { shimmer: { name: "Shimmer", control: "boolean" } };
TexturedOrbit.parameters = {
  docs: {
    description: {
      story:
        "One WebGL sprite loads a transparent PNG atlas. The fragment effect selects the pose, moves it and sweeps a highlight across its painted pixels.",
    },
  },
};
