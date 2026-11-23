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
import type { Graph, TBlock, TConnectionGeometry, TConnectionGeometryInput, TSceneStyles } from "@gravity-ui/graph";
import { GraphBlock, useGraph } from "@gravity-ui/graph-react";

import { ConnectionPreview } from "./ConnectionScene";
import type { ConnectionArgs } from "./ConnectionScene";
import { createSvgPath, sampleSvgPath } from "./svgPath";

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
  arrowPosition: number;
  arrowLength: number;
  arrowWidth: number;
  showArrows: boolean;
  showLabels: boolean;
  labelPlacement: "route" | "target";
  labelPosition: number;
  secondaryLabelPosition: number;
};

const tracks = [
  { id: "straight", name: "Straight", sourceY: 48, targetY: 48, stroke: "dashed", color: "#2c56a6" },
  { id: "bezier", name: "Bézier", sourceY: 174, targetY: 128, stroke: "flow", color: "#08786c" },
  { id: "multipoint", name: "Multipoint", sourceY: 280, targetY: 330, stroke: "gradient", color: "#6947ae" },
] as const;

const pattern = [14, 9];
const labelHoverColor = "#1767b2";
const labelSelectedColor = "#a74513";
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

type GalleryGeometryOptions = Pick<
  GalleryArgs,
  "arrowPosition" | "arrowLength" | "arrowWidth" | "labelPlacement" | "labelPosition" | "secondaryLabelPosition"
>;

function connectionGeometry(
  input: TConnectionGeometryInput,
  options: GalleryGeometryOptions
): TConnectionGeometry | undefined {
  const geometry = galleryGeometry(input);
  if (!geometry) return undefined;
  const { arrowPosition, arrowLength, arrowWidth, labelPlacement, labelPosition, secondaryLabelPosition } = options;
  const labels =
    labelPlacement === "route"
      ? [
          { id: "stroke", text: input.connection.label ?? "", at: labelPosition / 100 },
          { id: "orders", text: "Orders", at: secondaryLabelPosition / 100 },
        ]
      : undefined;
  if (!geometry.arrow) return { ...geometry, labels };
  const { closed } = geometry.arrow;
  const path = createSvgPath(geometry.segments);
  const length = path.getTotalLength();
  if (length === 0) return { ...geometry, labels };
  const { point: tip, dx, dy } = sampleSvgPath(path, (length * arrowPosition) / 100, length);
  const base = { x: tip.x - dx, y: tip.y - dy };
  const [head, left, right] = getTriangleArrowPoints(base, tip, arrowLength, arrowWidth);
  return {
    ...geometry,
    labels,
    arrow: {
      closed,
      position: arrowPosition === 100 ? "end" : "inline",
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

export function connectionCode({
  renderer,
  arrowPosition = 100,
  arrowLength,
  arrowWidth,
  showArrows,
  showLabels,
  labelPlacement = "route",
  labelPosition = 65,
  secondaryLabelPosition = 25,
}: GalleryArgs) {
  const labels =
    labelPlacement === "route"
      ? `
      labels: [
        { id: "stroke", text: input.connection.label ?? "", at: ${labelPosition / 100} },
        { id: "orders", text: "Orders", at: ${secondaryLabelPosition / 100} },
      ],`
      : "";
  return `import { BlockConnection, Graph, getTriangleArrowPoints, hoveredTag, selectedTag, straightGeometry } from "@gravity-ui/graph";
import type { TConnectionGeometryFn, TSceneStyles } from "@gravity-ui/graph";

class RouteConnection extends BlockConnection {
  public static override getSceneStyles(): TSceneStyles<typeof this> {
    return [
      { tags: [hoveredTag], notTags: [selectedTag], style: { parts: { label: { color: "${labelHoverColor}" } } } },
      { tags: [selectedTag], style: { parts: { label: { color: "${labelSelectedColor}" } } } },
    ];
  }

  public static override geometry: TConnectionGeometryFn = (input) => {
    const geometry = straightGeometry(input);
    if (!geometry?.arrow) return geometry;
    const [tip, left, right] = getTriangleArrowPoints(
      input.source, input.target, ${arrowLength}, ${arrowWidth}, ${arrowPosition / 100}
    );
    return {
      ...geometry,${labels}
      arrow: {
        closed: false,
        position: "${arrowPosition === 100 ? "end" : "inline"}",
        points: new Float32Array([left.x, left.y, tip.x, tip.y, right.x, right.y]),
      },
    };
  };
}

export function mountGraph(root: HTMLDivElement) {
  const graph = new Graph(
    {
      settings: {
        connection: RouteConnection,
        renderer: "${renderer}",
        showConnectionLabels: ${showLabels},
        showConnectionArrows: ${showArrows},
      },
      blocks: [
        { id: "source", is: "Block", name: "Source", x: 16, y: 24, width: 100, height: 48 },
        { id: "target", is: "Block", name: "Target", x: 540, y: 24, width: 100, height: 48 },
      ],
      connections: [{ id: "route", sourceBlockId: "source", targetBlockId: "target", label: "Read" }],
    },
    root
  );
  graph.start();
  return graph;
}`;
}

export function ConnectionGallery({
  renderer,
  stroke,
  lineWidth,
  arrowPosition = 100,
  arrowLength,
  arrowWidth,
  showArrows,
  showLabels,
  labelPlacement = "route",
  labelPosition = 65,
  secondaryLabelPosition = 25,
  embedded = false,
}: GalleryArgs & { embedded?: boolean }) {
  const geometryOptions = useRef({
    arrowPosition,
    arrowLength,
    arrowWidth,
    labelPlacement,
    labelPosition,
    secondaryLabelPosition,
  });
  const [connection] = useState(
    () =>
      class GalleryConnection extends BlockConnection {
        public static override getSceneStyles(): TSceneStyles<typeof this> {
          return [
            { tags: [hoveredTag], notTags: [selectedTag], style: { parts: { label: { color: labelHoverColor } } } },
            { tags: [selectedTag], style: { parts: { label: { color: labelSelectedColor } } } },
          ];
        }

        public static override geometry = (input: TConnectionGeometryInput) =>
          connectionGeometry(input, geometryOptions.current);
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
    geometryOptions.current = {
      arrowPosition,
      arrowLength,
      arrowWidth,
      labelPlacement,
      labelPosition,
      secondaryLabelPosition,
    };
    for (const { id } of tracks) graph.connections.getConnectionState(id)?.getViewComponent()?.updateGeometry();
  }, [graph, arrowPosition, arrowLength, arrowWidth, labelPlacement, labelPosition, secondaryLabelPosition]);

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
      height={embedded ? 400 : undefined}
      instruction={
        !embedded && (
          <>
            Hover or select a connection to highlight its labels. Drag a block to change its route. Canvas shows the
            base stroke for WebGL effects.{" "}
            <a href="./?path=/docs/scene-guides-connection-labels--docs" target="_top">
              Connection labels guide
            </a>
          </>
        )
      }
    />
  );
}
