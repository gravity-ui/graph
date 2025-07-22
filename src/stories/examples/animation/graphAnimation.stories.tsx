import React, { useCallback, useLayoutEffect, useState } from "react";

import { Meta, StoryFn } from "@storybook/react";

import { TBlock } from "../../../components/canvas/blocks/Block";
import { Graph, GraphState, TGraphConfig } from "../../../graph";
import { GraphCanvas, useGraph, useGraphEvent } from "../../../react-components";
import { useFn } from "../../../react-components/utils/hooks/useFn";
import { GraphAnimation, useGraphAnimation } from "../../../services/animation";
import { TConnection } from "../../../store/connection/ConnectionState";
import { BlockStory } from "../../main/Block";

export default {
  title: "Examples/Graph Animation",
  parameters: {
    docs: {
      description: {
        component: "Демонстрация анимаций блоков и соединений в графе",
      },
    },
  },
} as Meta;

// Create graph configuration with blocks and dashed connections
const createGraphConfig = (): Pick<TGraphConfig, "blocks" | "connections"> => ({
  blocks: [
    {
      id: "block-1",
      is: "Block",
      name: "Анимированный блок",
      x: 100,
      y: 100,
      width: 200,
      height: 120,
      selected: false,
      anchors: [],
    },
    {
      id: "block-2",
      is: "Block",
      name: "Статичный блок",
      x: 500,
      y: 100,
      width: 200,
      height: 120,
      selected: false,
      anchors: [],
    },
    {
      id: "block-3",
      is: "Block",
      name: "Блок снизу",
      x: 300,
      y: 300,
      width: 180,
      height: 100,
      selected: false,
      anchors: [],
    },
  ] as TBlock[],
  connections: [
    {
      id: "conn-1",
      sourceBlockId: "block-1",
      targetBlockId: "block-2",
      dashed: true,
      styles: {
        dashes: [8, 4],
      },
    },
    {
      id: "conn-2",
      sourceBlockId: "block-1",
      targetBlockId: "block-3",
      dashed: true,
      styles: {
        dashes: [12, 6],
      },
    },
    {
      id: "conn-3",
      sourceBlockId: "block-2",
      targetBlockId: "block-3",
      dashed: false, // Solid connection for comparison
    },
  ] as TConnection[],
});

export const GraphBlockAnimation: StoryFn = () => {
  const { graph, setEntities, start } = useGraph({
    settings: {
      useBezierConnections: true,
      showConnectionArrows: true,
      canZoomCamera: true,
      canDragCamera: true,
    },
  });

  // Animation for block size changes
  const blockAnimation = new GraphAnimation(
    (params) => {
      // Update block geometry through graph API
      graph.api.updateBlock({
        id: "block-1",
        width: params.width,
        height: params.height,
        x: params.x,
        y: params.y,
      });
    },
    {
      timing: "ease-in-out",
      duration: 1500,
    }
  );

  // Animation for dash offset (continuous loop)
  const dashAnimation = new GraphAnimation(
    (params) => {
      // TODO: Implement dash offset animation
      console.log("Dash offset:", params.offset);
    },
    {
      timing: "linear",
      duration: 2000,
    }
  );

  useLayoutEffect(() => {
    const config = createGraphConfig();
    setEntities(config);
  }, [setEntities]);

  useGraphEvent(graph, "state-change", ({ state }) => {
    if (state === GraphState.ATTACHED) {
      start();
      graph.zoomTo("center", { padding: 100 });

      // Start continuous dash animation
      startDashAnimation();
    }
  });

  const startDashAnimation = useCallback(() => {
    const loop = () => {
      dashAnimation.setCurrentParams({ offset: 0 });
      dashAnimation.start({ offset: 20 });

      // Restart when completed
      setTimeout(() => {
        if (dashAnimation.animationState === "completed") {
          loop();
        }
      }, 2100);
    };
    loop();
  }, [dashAnimation]);

  const animateBlock = useCallback(() => {
    const currentBlockState = graph.rootStore.blocksList.getBlockState("block-1");
    if (!currentBlockState) return;

    const current = currentBlockState.$state.value;
    blockAnimation.setCurrentParams({
      width: current.width,
      height: current.height,
      x: current.x,
      y: current.y,
    });

    // Animate to larger size and move
    blockAnimation.start({
      width: current.width * 1.5,
      height: current.height * 1.5,
      x: current.x - 25,
      y: current.y - 25,
    });
  }, [blockAnimation]);

  const resetBlock = useCallback(() => {
    const currentBlockState = graph.rootStore.blocksList.getBlockState("block-1");
    if (!currentBlockState) return;

    const current = currentBlockState.$state.value;
    blockAnimation.setCurrentParams({
      width: current.width,
      height: current.height,
      x: current.x,
      y: current.y,
    });

    // Reset to original size
    blockAnimation.start({
      width: 200,
      height: 120,
      x: 100,
      y: 100,
    });
  }, [blockAnimation]);

  const pulsateBlock = useCallback(() => {
    let growing = true;
    const pulse = () => {
      const currentBlockState = graph.rootStore.blocksList.getBlockState("block-1");
      if (!currentBlockState) return;

      const current = currentBlockState.$state.value;
      blockAnimation.setCurrentParams({
        width: current.width,
        height: current.height,
        x: current.x,
        y: current.y,
      });

      if (growing) {
        blockAnimation.start({
          width: 250,
          height: 150,
          x: 75,
          y: 85,
        });
        growing = false;
      } else {
        blockAnimation.start({
          width: 200,
          height: 120,
          x: 100,
          y: 100,
        });
        growing = true;
      }

      // Continue pulsating
      setTimeout(pulse, 1600);
    };
    pulse();
  }, [blockAnimation]);

  // Custom render function that applies dash offset
  const renderBlock = useFn((graphInstance: Graph, block: TBlock) => {
    return <BlockStory graph={graphInstance} block={block} />;
  });

  return (
    <div style={{ width: "100%", height: "600px", position: "relative" }}>
      <GraphCanvas graph={graph} renderBlock={renderBlock} />

      <div
        style={{
          position: "absolute",
          top: 20,
          left: 20,
          background: "rgba(0, 0, 0, 0.8)",
          color: "white",
          padding: "15px",
          borderRadius: "8px",
          display: "flex",
          flexDirection: "column",
          gap: "10px",
        }}
      >
        <h3 style={{ margin: 0, fontSize: "16px" }}>Анимации графа</h3>
        <button onClick={animateBlock}>Увеличить блок</button>
        <button onClick={resetBlock}>Сбросить размер</button>
        <button onClick={pulsateBlock}>Пульсация (зацикленная)</button>
        <div style={{ fontSize: "12px", opacity: 0.8 }}>
          • Зеленый блок анимируется
          <br />
          • Пунктирные линии движутся
          <br />• Используйте мышь для панорамирования
        </div>
      </div>
    </div>
  );
};

export const GraphHookAnimation: StoryFn = () => {
  const { graph, setEntities, start } = useGraph({
    settings: {
      useBezierConnections: true,
      showConnectionArrows: true,
      canZoomCamera: true,
      canDragCamera: true,
    },
  });

  const [blockStyle, setBlockStyle] = useState({
    scale: 1,
    rotation: 0,
    opacity: 1,
  });

  const {
    start: startAnimation,
    stop,
    isRunning,
  } = useGraphAnimation({
    onUpdate: (params) => {
      setBlockStyle({
        scale: params.scale,
        rotation: params.rotation,
        opacity: params.opacity,
      });
    },
    defaultConfig: {
      timing: "ease-in-out",
      duration: 2000,
    },
  });

  useLayoutEffect(() => {
    const config = createGraphConfig();
    setEntities(config);
  }, [setEntities]);

  useGraphEvent(graph, "state-change", ({ state }) => {
    if (state === GraphState.ATTACHED) {
      start();
      graph.zoomTo("center", { padding: 100 });
    }
  });

  const morphBlock = useCallback(() => {
    startAnimation({
      scale: 0.5 + Math.random() * 1.5,
      rotation: Math.random() * 360,
      opacity: 0.3 + Math.random() * 0.7,
    });
  }, [startAnimation]);

  const resetBlock = useCallback(() => {
    startAnimation({
      scale: 1,
      rotation: 0,
      opacity: 1,
    });
  }, [startAnimation]);

  // Custom block component with style transformations
  const AnimatedBlock = useCallback(
    (graphInstance: Graph, block: TBlock) => {
      const isAnimatedBlock = block.id === "block-1";

      if (!isAnimatedBlock) {
        return <BlockStory graph={graphInstance} block={block} />;
      }

      return (
        <div
          style={{
            transform: `scale(${blockStyle.scale}) rotate(${blockStyle.rotation}deg)`,
            opacity: blockStyle.opacity,
            transition: "none",
            transformOrigin: "center",
          }}
        >
          <BlockStory graph={graphInstance} block={block} />
        </div>
      );
    },
    [blockStyle]
  );

  return (
    <div style={{ width: "100%", height: "600px", position: "relative" }}>
      <GraphCanvas graph={graph} renderBlock={AnimatedBlock} />

      <div
        style={{
          position: "absolute",
          top: 20,
          left: 20,
          background: "rgba(0, 0, 0, 0.8)",
          color: "white",
          padding: "15px",
          borderRadius: "8px",
          display: "flex",
          flexDirection: "column",
          gap: "10px",
        }}
      >
        <h3 style={{ margin: 0, fontSize: "16px" }}>Hook анимации</h3>
        <button onClick={morphBlock} disabled={isRunning}>
          {isRunning ? "Анимируется..." : "Морфинг блока"}
        </button>
        <button onClick={resetBlock}>Сбросить</button>
        <button onClick={stop}>Остановить</button>
        <div style={{ fontSize: "12px", opacity: 0.8 }}>
          Использует useGraphAnimation hook
          <br />
          для CSS transform анимации
        </div>
      </div>
    </div>
  );
};

export const DashedConnectionDemo: StoryFn = () => {
  const { graph, setEntities, start } = useGraph({
    settings: {
      useBezierConnections: true,
      showConnectionArrows: true,
    },
  });

  useLayoutEffect(() => {
    // Create config with different dash patterns
    const config: Pick<TGraphConfig, "blocks" | "connections"> = {
      blocks: [
        {
          id: "dash-1",
          is: "Block",
          name: "Dash Pattern 1",
          x: 100,
          y: 100,
          width: 150,
          height: 80,
          selected: false,
          anchors: [],
        },
        {
          id: "dash-2",
          is: "Block",
          name: "Dash Pattern 2",
          x: 400,
          y: 100,
          width: 150,
          height: 80,
          selected: false,
          anchors: [],
        },
        {
          id: "dash-3",
          is: "Block",
          name: "Dash Pattern 3",
          x: 700,
          y: 100,
          width: 150,
          height: 80,
          selected: false,
          anchors: [],
        },
        {
          id: "center",
          is: "Block",
          name: "Центральный блок",
          x: 400,
          y: 300,
          width: 200,
          height: 100,
          selected: false,
          anchors: [],
        },
      ] as TBlock[],
      connections: [
        {
          id: "dash-conn-1",
          sourceBlockId: "dash-1",
          targetBlockId: "center",
          dashed: true,
          styles: {
            dashes: [4, 2], // Short dashes
            background: "#ff6b6b",
            selectedBackground: "#ff5252",
          },
        },
        {
          id: "dash-conn-2",
          sourceBlockId: "dash-2",
          targetBlockId: "center",
          dashed: true,
          styles: {
            dashes: [8, 4], // Medium dashes
            background: "#4ecdc4",
            selectedBackground: "#26a69a",
          },
        },
        {
          id: "dash-conn-3",
          sourceBlockId: "dash-3",
          targetBlockId: "center",
          dashed: true,
          styles: {
            dashes: [12, 6], // Long dashes
            background: "#ffe66d",
            selectedBackground: "#ffcc02",
          },
        },
      ] as TConnection[],
    };

    setEntities(config);
  }, [setEntities]);

  useGraphEvent(graph, "state-change", ({ state }) => {
    if (state === GraphState.ATTACHED) {
      start();
      graph.zoomTo("center", { padding: 100 });
    }
  });

  const renderBlock = useFn((graphInstance: Graph, block: TBlock) => {
    return <BlockStory graph={graphInstance} block={block} />;
  });

  return (
    <div style={{ width: "100%", height: "600px", position: "relative" }}>
      <GraphCanvas graph={graph} renderBlock={renderBlock} />

      <div
        style={{
          position: "absolute",
          top: 20,
          left: 20,
          background: "rgba(0, 0, 0, 0.8)",
          color: "white",
          padding: "15px",
          borderRadius: "8px",
        }}
      >
        <h3 style={{ margin: 0, fontSize: "16px", marginBottom: "10px" }}>Пунктирные соединения</h3>
        <div style={{ fontSize: "12px", opacity: 0.8 }}>
          • Красная: короткие штрихи [4, 2]
          <br />
          • Голубая: средние штрихи [8, 4]
          <br />
          • Желтая: длинные штрихи [12, 6]
          <br />• Разные цвета и размеры
        </div>
      </div>
    </div>
  );
};
