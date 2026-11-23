import React, { useEffect, useRef, useState } from "react";

import {
  BlockConnection,
  ECanDrag,
  bezierGeometry,
  dashFlow,
  defineTag,
  getTriangleArrowPoints,
  hoveredTag,
  multipointGeometry,
  pathGradient,
  selectedTag,
  straightGeometry,
} from "@gravity-ui/graph";
import type { Graph, TBlock, TConnectionGeometryInput } from "@gravity-ui/graph";
import { GraphBlock, useGraph } from "@gravity-ui/graph-react";

import { ConnectionPreview } from "./ConnectionScene";
import type { ConnectionArgs } from "./ConnectionScene";

const strokeNames = {
  solid: "Solid",
  dashed: "Static dash",
  flow: "Dash flow",
  gradient: "Path gradient",
} as const;
type Stroke = keyof typeof strokeNames;

export type GalleryArgs = ConnectionArgs & {
  stroke: "mixed" | Stroke;
  lineWidth: number;
  arrowLength: number;
  arrowWidth: number;
  showArrows: boolean;
  showLabels: boolean;
};

const tracks = [
  { id: "straight", name: "Straight", sourceY: 48, targetY: 48, stroke: "dashed", color: "#2c56a6" },
  { id: "bezier", name: "Bézier", sourceY: 174, targetY: 128, stroke: "flow", color: "#08786c" },
  { id: "multipoint", name: "Multipoint", sourceY: 280, targetY: 330, stroke: "gradient", color: "#6947ae" },
] as const;

const pattern = [14, 9];
const effects = {
  flow: dashFlow.use({ pattern, speed: 45 }),
  gradient: pathGradient.use({ from: "#6947ae", to: "#bf5414", speed: 0.45 }),
};
const taggedTracks = tracks.map((track) => ({ ...track, tag: defineTag(`gallery-${track.id}`) }));
const entities = {
  blocks: tracks.flatMap(({ id, name, sourceY, targetY }) => [
    { id: `${id}-source`, is: "Block", name, x: 0, y: sourceY, width: 132, height: 46 },
    { id: `${id}-target`, is: "Block", name: "Target", x: 572, y: targetY, width: 132, height: 46 },
  ]),
  connections: tracks.map(({ id }) => ({ id, sourceBlockId: `${id}-source`, targetBlockId: `${id}-target` })),
};

function galleryGeometry(input: TConnectionGeometryInput) {
  const { connection, source, target } = input;
  if (connection.id === "straight") return straightGeometry(input);
  if (connection.id === "bezier") return bezierGeometry(input);
  const startX = source.x + (target.x - source.x) * 0.24;
  const endX = source.x + (target.x - source.x) * 0.73;
  const bendY = Math.min(source.y, target.y) - 38;
  return multipointGeometry({
    ...input,
    points: [
      source,
      { x: startX, y: source.y },
      { x: startX, y: bendY },
      { x: endX, y: bendY },
      { x: endX, y: target.y },
      target,
    ],
  });
}

function sizedGeometry(
  input: TConnectionGeometryInput,
  { arrowLength, arrowWidth }: Pick<GalleryArgs, "arrowLength" | "arrowWidth">
) {
  const geometry = galleryGeometry(input);
  const arrow = geometry?.arrow;
  if (!arrow) return geometry;
  const { points, closed } = arrow;
  const tipIndex = closed ? 0 : 2;
  const leftIndex = closed ? 2 : 0;
  const tip = { x: points[tipIndex], y: points[tipIndex + 1] };
  const base = { x: (points[leftIndex] + points[4]) / 2, y: (points[leftIndex + 1] + points[5]) / 2 };
  const [head, left, right] = getTriangleArrowPoints(base, tip, arrowLength, arrowWidth);
  return {
    ...geometry,
    arrow: {
      ...arrow,
      points: new Float32Array(
        closed ? [head.x, head.y, left.x, left.y, right.x, right.y] : [left.x, left.y, head.x, head.y, right.x, right.y]
      ),
    },
  };
}

function renderEndpoint(graph: Graph, block: TBlock) {
  return (
    <GraphBlock graph={graph} block={block}>
      <div style={{ display: "grid", placeItems: "center", height: "100%" }}>{block.name}</div>
    </GraphBlock>
  );
}

function arrowCode(length: number, width: number) {
  return `import { BlockConnection, getTriangleArrowPoints, straightGeometry } from "@gravity-ui/graph";
import type { TConnectionGeometryFn } from "@gravity-ui/graph";

class TriangleConnection extends BlockConnection {
  public static override geometry: TConnectionGeometryFn = (input) => {
    const geometry = straightGeometry(input);
    if (!geometry?.arrow) return geometry;
    const [tip, left, right] = getTriangleArrowPoints(input.source, input.target, ${length}, ${width}, 0.5);
    return {
      ...geometry,
      arrow: { closed: true, points: new Float32Array([tip.x, tip.y, left.x, left.y, right.x, right.y]) },
    };
  };
}

// Use settings: { connection: TriangleConnection } when creating the graph.`;
}

export function ConnectionGallery({
  renderer,
  stroke,
  lineWidth,
  arrowLength,
  arrowWidth,
  showArrows,
  showLabels,
}: GalleryArgs) {
  const dimensions = useRef({ arrowLength, arrowWidth });
  const [connection] = useState(
    () =>
      class GalleryConnection extends BlockConnection {
        public static override geometry = (input: TConnectionGeometryInput) => sizedGeometry(input, dimensions.current);
      }
  );
  const { graph, setEntities, start, zoomTo } = useGraph({
    settings: {
      renderer,
      connection,
      canDrag: ECanDrag.ALL,
      showConnectionArrows: showArrows,
      showConnectionLabels: showLabels,
    },
  });

  useEffect(() => {
    setEntities(entities);
    for (const { id, tag } of taggedTracks) graph.scene.tags.add(tag, { connection: [id] });
    start();
    zoomTo("center", { padding: 88 });
    return () => {
      for (const { id, tag } of taggedTracks) graph.scene.tags.delete(tag, { connection: [id] });
    };
  }, [graph, setEntities, start, zoomTo]);

  useEffect(() => {
    dimensions.current = { arrowLength, arrowWidth };
    for (const { id } of tracks) graph.connections.getConnectionState(id)?.getViewComponent()?.updateGeometry();
  }, [graph, arrowLength, arrowWidth]);

  useEffect(() => {
    return graph.scene.styles.add(
      taggedTracks.map(({ tag, stroke: restingStroke }) => {
        const preset = stroke === "mixed" ? restingStroke : stroke;
        const effect = preset === "flow" || preset === "gradient" ? effects[preset] : undefined;
        return {
          target: connection,
          tags: [tag],
          style: (values) => ({
            parts: { line: { width: lineWidth + (values.get(hoveredTag) || values.get(selectedTag) ? 2 : 0), effect } },
          }),
        };
      })
    );
  }, [graph, connection, stroke, lineWidth]);

  useEffect(() => {
    for (const { id, color, stroke: restingStroke } of tracks) {
      const preset = stroke === "mixed" ? restingStroke : stroke;
      graph.api.updateConnection(id, {
        label: strokeNames[preset],
        dashed: preset === "dashed",
        styles: { background: color, selectedBackground: "#3d2d75", dashes: pattern },
      });
    }
  }, [graph, stroke]);

  return (
    <ConnectionPreview
      graph={graph}
      renderBlock={renderEndpoint}
      code={arrowCode(arrowLength, arrowWidth)}
      instruction="Hover or select a connection. Drag a block to see the route follow it. Canvas shows the base stroke for WebGL effects."
    />
  );
}
