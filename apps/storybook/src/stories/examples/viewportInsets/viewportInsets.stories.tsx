import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { Graph, GraphState, TBlock } from "@gravity-ui/graph";
import { GraphCanvas, useGraph, useGraphEvent, useSceneChange } from "@gravity-ui/graph-react";
import { Button, Flex, Switch } from "@gravity-ui/uikit";
import type { Meta, StoryObj } from "@storybook/react-webpack5";

import { generatePrettyBlocks } from "../../configurations/generatePretty";
import { BlockStory } from "../../main/Block";

type TRect = { x: number; y: number; width: number; height: number };

function computeOverlayRect(graph: Graph): TRect {
  const state = graph.$camera.value;
  const insets = graph.cameraService.getViewportInsets();

  return {
    x: insets.left,
    y: insets.top,
    width: Math.max(0, state.width - insets.left - insets.right),
    height: Math.max(0, state.height - insets.top - insets.bottom),
  };
}

const storyConfig = generatePrettyBlocks({ layersCount: 6, connectionsPerLayer: 80 });

const Toolbar = ({
  graph,
  maintain,
  onChangeMaintain,
}: {
  graph: Graph;
  maintain: "center" | "none";
  onChangeMaintain: (m: "center" | "none") => void;
}) => {
  const zoomToViewport = useCallback(() => {
    graph.zoomTo("center", { transition: 250, padding: 0 });
  }, [graph]);

  const zoomToSelection = useCallback(() => {
    const selected = graph.rootStore.blocksList.$selectedBlocks.value.map((b) => b.id);
    if (selected.length > 0) {
      graph.api.zoomToBlocks(selected as string[], { transition: 250, padding: 40 });
    }
  }, [graph]);

  return (
    <Flex
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        display: "flex",
        gap: 8,
        zIndex: 10,
        background: "var(--g-color-base-background)",
        padding: 8,
      }}
      alignItems="center"
    >
      <Button onClick={zoomToViewport}>zoomToViewport</Button>
      <Button onClick={zoomToSelection}>zoomToSelection</Button>
      <Switch checked={maintain === "center"} onChange={(e) => onChangeMaintain(e.target.checked ? "center" : "none")}>
        Maintain center
      </Switch>
    </Flex>
  );
};

type DragState = {
  type: "move" | "resize";
  startX: number;
  startY: number;
  startRect: TRect;
  edge?: "n" | "s" | "w" | "e" | "nw" | "ne" | "sw" | "se";
};

const Handle = ({
  cursor,
  onPointerDown,
  style,
}: {
  cursor: string;
  onPointerDown: (e: React.PointerEvent) => void;
  style: React.CSSProperties;
}) => {
  return (
    <div
      onPointerDown={onPointerDown}
      style={{
        position: "absolute",
        width: 10,
        height: 10,
        background: "rgba(255,255,255,0.9)",
        border: "1px solid #333",
        borderRadius: 2,
        cursor,
        ...style,
      }}
    />
  );
};

const InsetsOverlay = ({ graph, maintain }: { graph: Graph; maintain: "center" | "none" }) => {
  const [rect, setRect] = useState<TRect>(() => {
    const state = graph.cameraService.getCameraState();
    const size = 300;
    const x = Math.max(0, Math.floor((state.width - size) / 2));
    const y = Math.max(0, Math.floor((state.height - size) / 2));
    return { x, y, width: Math.max(0, size), height: Math.max(0, size) };
  });

  const dragRef = useRef<DragState | null>(null);
  const rectRef = useRef<TRect>(rect);

  useEffect(() => {
    rectRef.current = rect;
  }, [rect]);

  const syncRectFromCamera = useCallback(() => {
    const next = computeOverlayRect(graph);
    setRect((prev) =>
      prev.x !== next.x || prev.y !== next.y || prev.width !== next.width || prev.height !== next.height ? next : prev
    );
  }, [graph]);

  useSceneChange(graph, syncRectFromCamera);

  // Initialize centered 300x300 viewport after graph is attached
  useGraphEvent(graph, "state-change", ({ state }) => {
    if (state === GraphState.ATTACHED) {
      const cam = graph.cameraService.getCameraState();
      const sizeW = cam.width / 2;
      const sizeH = cam.height / 2;
      const x = Math.max(0, Math.floor((cam.width - sizeW) / 2));
      const y = Math.max(0, Math.floor((cam.height - sizeW) / 2));
      const centered = { x, y, width: sizeW, height: sizeH };
      setRect(centered);
      const insets = {
        left: centered.x,
        top: centered.y,
        right: cam.width - (centered.x + centered.width),
        bottom: cam.height - (centered.y + centered.height),
      };
      graph.cameraService.setViewportInsets(insets);
    }
  });

  const startMove = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation();
      if (dragRef.current || e.button !== 0) return;
      dragRef.current = {
        type: "move",
        startX: e.clientX,
        startY: e.clientY,
        startRect: rectRef.current,
      };

      const onMove = (event: PointerEvent) => {
        if (e.pointerId !== event.pointerId) return;
        if (!dragRef.current) return;
        event.preventDefault();
        const { type, startX, startY, startRect } = dragRef.current;
        const dx = event.clientX - startX;
        const dy = event.clientY - startY;
        let next: TRect = { ...startRect };
        if (type === "move") {
          next = {
            x: startRect.x + dx,
            y: startRect.y + dy,
            width: startRect.width,
            height: startRect.height,
          };
        }

        const state = graph.cameraService.getCameraState();
        const maxX = Math.max(0, state.width - next.width);
        const maxY = Math.max(0, state.height - next.height);
        next.x = Math.min(Math.max(0, next.x), maxX);
        next.y = Math.min(Math.max(0, next.y), maxY);
        setRect(next);

        const insets = {
          left: next.x,
          top: next.y,
          right: state.width - (next.x + next.width),
          bottom: state.height - (next.y + next.height),
        };
        if (maintain === "center") {
          graph.cameraService.setViewportInsets(insets, { maintain: "center" });
        } else {
          graph.cameraService.setViewportInsets(insets);
        }
      };

      const onUp = (event: PointerEvent) => {
        if (e.pointerId !== event.pointerId) return;
        dragRef.current = null;
        window.removeEventListener("pointercancel", onUp);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    [graph, maintain]
  );

  const beginResize = useCallback(
    (edge: DragState["edge"]) => (e: React.PointerEvent) => {
      e.stopPropagation();
      if (dragRef.current || e.button !== 0) return;
      dragRef.current = {
        type: "resize",
        startX: e.clientX,
        startY: e.clientY,
        startRect: rectRef.current,
        edge,
      };
      const onMove = (event: PointerEvent) => {
        if (e.pointerId !== event.pointerId) return;
        event.preventDefault();
        const current = dragRef.current;
        if (!current) {
          return;
        }
        const { startX, startY, startRect } = current;
        const dx = event.clientX - startX;
        const dy = event.clientY - startY;
        const next: TRect = { ...startRect };
        switch (edge) {
          case "e":
            next.width = Math.max(40, startRect.width + dx);
            break;
          case "s":
            next.height = Math.max(40, startRect.height + dy);
            break;
          case "se":
            next.width = Math.max(40, startRect.width + dx);
            next.height = Math.max(40, startRect.height + dy);
            break;
          case "w":
            next.width = Math.max(40, startRect.width - dx);
            next.x = startRect.x + dx;
            break;
          case "n":
            next.height = Math.max(40, startRect.height - dy);
            next.y = startRect.y + dy;
            break;
          case "nw":
            next.width = Math.max(40, startRect.width - dx);
            next.x = startRect.x + dx;
            next.height = Math.max(40, startRect.height - dy);
            next.y = startRect.y + dy;
            break;
          case "ne":
            next.width = Math.max(40, startRect.width + dx);
            next.height = Math.max(40, startRect.height - dy);
            next.y = startRect.y + dy;
            break;
          case "sw":
            next.width = Math.max(40, startRect.width - dx);
            next.x = startRect.x + dx;
            next.height = Math.max(40, startRect.height + dy);
            break;
        }

        const state = graph.cameraService.getCameraState();
        const maxX = Math.max(0, state.width - next.width);
        const maxY = Math.max(0, state.height - next.height);
        next.x = Math.min(Math.max(0, next.x), maxX);
        next.y = Math.min(Math.max(0, next.y), maxY);
        setRect(next);
        const insets = {
          left: next.x,
          top: next.y,
          right: state.width - (next.x + next.width),
          bottom: state.height - (next.y + next.height),
        };
        if (maintain === "center") {
          graph.cameraService.setViewportInsets(insets, { maintain: "center" });
        } else {
          graph.cameraService.setViewportInsets(insets);
        }
      };
      const onUp = (event: PointerEvent) => {
        if (e.pointerId !== event.pointerId) return;
        dragRef.current = null;
        window.removeEventListener("pointercancel", onUp);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    [graph, rect, maintain]
  );

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 5,
      }}
    >
      <div
        style={{
          position: "absolute",
          left: rect.x,
          top: rect.y,
          width: rect.width,
          height: rect.height,
          border: "2px dashed #1f75fe",
          background: "rgba(31,117,254,0.06)",
          boxSizing: "border-box",
          cursor: "move",
          touchAction: "none",
          pointerEvents: "auto",
          zIndex: 10,
        }}
        onPointerDown={startMove}
      >
        {/* Resize handles */}
        <Handle cursor="nwse-resize" onPointerDown={beginResize("nw")} style={{ left: -5, top: -5 }} />
        <Handle cursor="nesw-resize" onPointerDown={beginResize("ne")} style={{ right: -5, top: -5 }} />
        <Handle cursor="nesw-resize" onPointerDown={beginResize("sw")} style={{ left: -5, bottom: -5 }} />
        <Handle cursor="nwse-resize" onPointerDown={beginResize("se")} style={{ right: -5, bottom: -5 }} />
        <Handle cursor="ew-resize" onPointerDown={beginResize("w")} style={{ left: -5, top: "50%", marginTop: -5 }} />
        <Handle cursor="ew-resize" onPointerDown={beginResize("e")} style={{ right: -5, top: "50%", marginTop: -5 }} />
        <Handle cursor="ns-resize" onPointerDown={beginResize("n")} style={{ top: -5, left: "50%", marginLeft: -5 }} />
        <Handle
          cursor="ns-resize"
          onPointerDown={beginResize("s")}
          style={{ bottom: -5, left: "50%", marginLeft: -5 }}
        />
      </div>
    </div>
  );
};

const InsetsDemo = () => {
  const { graph, setEntities, start } = useGraph({ settings: storyConfig.settings, layers: storyConfig.layers });
  const [maintain, setMaintain] = useState<"center" | "none">("center");

  useLayoutEffect(() => {
    setEntities({ blocks: storyConfig.blocks, connections: storyConfig.connections });
  }, [setEntities]);

  useGraphEvent(graph, "state-change", ({ state }) => {
    if (state === GraphState.ATTACHED) {
      start();
      graph.zoomTo("center", { padding: 200, transition: 250 });
    }
  });

  const renderBlock = useCallback(
    (graphObject: Graph, block: TBlock) => <BlockStory graph={graphObject} block={block} />,
    []
  );

  return (
    <div style={{ position: "fixed", inset: 0 }}>
      <GraphCanvas graph={graph} renderBlock={renderBlock}></GraphCanvas>
      <Toolbar graph={graph} maintain={maintain} onChangeMaintain={setMaintain} />
      <InsetsOverlay graph={graph} maintain={maintain} />
    </div>
  );
};

const meta: Meta<typeof InsetsDemo> = {
  title: "Examples/ViewportInsets",
  component: InsetsDemo,
  parameters: {
    layout: "fullscreen",
  },
};

export default meta;
type Story = StoryObj<typeof InsetsDemo>;

export const ViewportInsetsPlayground: Story = {
  render: () => <InsetsDemo />,
};
