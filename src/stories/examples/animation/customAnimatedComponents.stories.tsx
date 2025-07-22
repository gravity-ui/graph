import React, { useCallback, useLayoutEffect } from "react";

import { Button, Flex, Text, ThemeProvider } from "@gravity-ui/uikit";
import type { Meta, StoryFn } from "@storybook/react";

import { Block, TBlock, TBlockProps } from "../../../components/canvas/blocks/Block";
import { TBaseConnectionState } from "../../../components/canvas/connections";
import { BlockConnection } from "../../../components/canvas/connections/BlockConnection";
import { Graph, GraphState, TGraphConfig } from "../../../graph";
import { GraphCanvas, useGraph, useGraphEvent } from "../../../react-components";
import { useFn } from "../../../react-components/utils/hooks/useFn";
import { EndContext, GraphAnimation, GraphAnimationAdvanced } from "../../../services/animation";
import { TConnection } from "../../../store/connection/ConnectionState";
import { ECanChangeBlockGeometry } from "../../../store/settings";
import { BlockStory } from "../../main/Block";

import "@gravity-ui/uikit/styles/styles.css";

import { TRect } from "../../../utils/types/shapes";

const meta: Meta = {
  title: "Examples/Animation/Custom Animated Components",
  parameters: {
    layout: "fullscreen",
  },
};

export default meta;

// Кастомный анимированный Canvas-блок
class AnimatedCanvasBlock extends Block {
  protected viewRect: TRect = {
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  };

  protected prevRect: TRect = {
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  };

  private sizeAnimation = new GraphAnimationAdvanced<TRect, TRect>(
    (params, progress) => {
      const diffX = (params.x - this.prevRect.x) * progress;
      const diffY = (params.y - this.prevRect.y) * progress;
      const diffWidth = (params.width - this.prevRect.width) * progress;
      const diffHeight = (params.height - this.prevRect.height) * progress;

      this.viewRect = {
        x: this.prevRect.x + diffX,
        y: this.prevRect.y + diffY,
        width: this.prevRect.width + diffWidth,
        height: this.prevRect.height + diffHeight,
      };
      this.connectedState.updateGeometry(this.viewRect);
      this.performRender();
    },
    {
      timing: "ease-out",
      duration: 800,
    }
  );

  protected stateChanged(_nextState): void {
    if (_nextState.width !== this.state.width || _nextState.height !== this.state.height) {
      this.prevRect = {
        x: this.state.x,
        y: this.state.y,
        width: this.state.width,
        height: this.state.height,
      };
      this.sizeAnimation.start({
        x: _nextState.x,
        y: _nextState.y,
        width: _nextState.width,
        height: _nextState.height,
      });
    }
    super.stateChanged(_nextState);
  }

  protected getGeometry(): TRect {
    if (this.sizeAnimation.animationState === "running") {
      return this.viewRect;
    }
    return super.getGeometry();
  }

  public unmount() {
    if (this.sizeAnimation) {
      this.sizeAnimation.stop();
    }
    super.unmount();
  }
}

// Кастомная анимированная связь
class AnimatedDashedConnection extends BlockConnection<TConnection> {
  private dashOffset = 0;
  private dashAnimation: GraphAnimationAdvanced;

  constructor(props: any, parent: any) {
    super(props, parent);
    this.startDashAnimation();
  }

  private startDashAnimation = () => {
    // Используем GraphAnimationAdvanced для удобной анимации с автоперезапуском
    this.dashAnimation = new GraphAnimationAdvanced(
      (params) => {
        this.dashOffset = params.offset;
        this.applyShape();
      },
      {
        timing: "linear",
        duration: 500, // 1.5 секунды на полный цикл - быстрее и заметнее
        infinite: true,

        init: () => {
          return {
            offset: 0,
          };
        },

        progress: ({ progress, params }) => {
          return {
            offset: params.offset - 1 * (progress * 16),
          };
        },

        // Хук end - автоматически перезапускаем анимацию
        end: () => {
          // Сразу же запускаем новый цикл без задержки
          // Это создает непрерывное движение dash в одном направлении
          //   this.startDashCycle();
        },
      }
    );

    // Запускаем первый цикл
    this.dashAnimation.start({ offset: 0 });
  };

  public getClassName(state?: TBaseConnectionState): string {
    return `${super.getClassName(state)}/animated`;
  }

  protected setRenderStyles(ctx: CanvasRenderingContext2D, state = this.state, withDashed = true) {
    ctx.lineWidth = state.selected ? 6 : 4;
    ctx.strokeStyle = state.selected ? "#ff6b6b" : "#4ecdc4";

    if (withDashed && state.dashed) {
      ctx.setLineDash([8, 8]);
      ctx.lineDashOffset = this.dashOffset;
    }
  }

  public unmount() {
    // Очищаем анимацию
    if (this.dashAnimation) {
      this.dashAnimation.stop();
    }
    super.unmount();
  }
}

// Конфигурация графа с кастомными компонентами
const createCustomGraphConfig = (): Pick<TGraphConfig, "blocks" | "connections"> => ({
  blocks: [
    {
      id: "animated-block-1",
      is: "AnimatedBlock",
      name: "Кастомный блок 1",
      x: 100,
      y: 100,
      width: 200,
      height: 120,
      selected: false,
      anchors: [],
    },
    {
      id: "animated-block-2",
      is: "AnimatedBlock",
      name: "Кастомный блок 2",
      x: 450,
      y: 100,
      width: 200,
      height: 120,
      selected: false,
      anchors: [],
    },
    {
      id: "animated-block-3",
      is: "AnimatedBlock",
      name: "Кастомный блок 3",
      x: 275,
      y: 300,
      width: 200,
      height: 120,
      selected: false,
      anchors: [],
    },
  ] as TBlock[],
  connections: [
    {
      id: "animated-conn-1",
      sourceBlockId: "animated-block-1",
      targetBlockId: "animated-block-2",
      dashed: true,
    },
    {
      id: "animated-conn-2",
      sourceBlockId: "animated-block-1",
      targetBlockId: "animated-block-3",
      dashed: true,
    },
    {
      id: "animated-conn-3",
      sourceBlockId: "animated-block-2",
      targetBlockId: "animated-block-3",
      dashed: true,
    },
  ] as TConnection[],
});

export const CustomAnimatedComponents: StoryFn = () => {
  const { graph, setEntities, start } = useGraph({
    settings: {
      useBezierConnections: true,
      showConnectionArrows: true,
      canZoomCamera: true,
      canDragCamera: true,
      canChangeBlockGeometry: ECanChangeBlockGeometry.ALL,
      blockComponents: {
        AnimatedBlock: AnimatedCanvasBlock,
      },
      connection: AnimatedDashedConnection,
    },
  });

  useLayoutEffect(() => {
    const config = createCustomGraphConfig();
    setEntities(config);
  }, [setEntities]);

  useGraphEvent(graph, "state-change", ({ state }) => {
    if (state === GraphState.ATTACHED) {
      start();
      graph.zoomTo("center", { padding: 100 });
    }
  });

  const increaseBlockSize = useCallback(
    (blockId: string) => {
      const currentBlock = graph.rootStore.blocksList.getBlock(blockId);
      graph.api.updateBlock({
        id: blockId,
        width: currentBlock.width + 50,
        height: currentBlock.height + 30,
      });
    },
    [graph]
  );

  const resetBlockSize = useCallback(
    (blockId: string) => {
      graph.api.updateBlock({
        id: blockId,
        width: 200,
        height: 120,
      });
    },
    [graph]
  );

  const randomizeSize = useCallback(
    (blockId: string) => {
      graph.api.updateBlock({
        id: blockId,
        width: 150 + Math.random() * 200,
        height: 100 + Math.random() * 150,
      });
    },
    [graph]
  );

  const renderBlock = useFn((graphInstance: Graph, block: TBlock) => {
    return <BlockStory graph={graphInstance} block={block} />;
  });

  return (
    <ThemeProvider theme="light">
      <div style={{ width: "100%", height: "100vh", position: "relative" }}>
        <GraphCanvas graph={graph} renderBlock={renderBlock} />

        {/* Панель управления */}
        <div
          style={{
            position: "absolute",
            zIndex: 1000,
            top: 20,
            left: 20,
            background: "rgba(0, 0, 0, 0.8)",
            color: "white",
            padding: "20px",
            borderRadius: "12px",
            minWidth: "280px",
          }}
        >
          <Text variant="header-2" style={{ color: "white", marginBottom: "16px" }}>
            Кастомные компоненты
          </Text>

          <div style={{ marginBottom: "16px" }}>
            <Text variant="body-1" style={{ color: "rgba(255,255,255,0.8)", marginBottom: "8px" }}>
              Блоки с анимацией при изменении размера:
            </Text>
            <Flex direction="column" gap={2}>
              <Flex gap={2}>
                <Button size="s" view="action" onClick={() => increaseBlockSize("animated-block-1")}>
                  Увеличить блок 1
                </Button>
                <Button size="s" view="outlined" onClick={() => resetBlockSize("animated-block-1")}>
                  Сбросить
                </Button>
              </Flex>
              <Flex gap={2}>
                <Button size="s" view="action" onClick={() => increaseBlockSize("animated-block-2")}>
                  Увеличить блок 2
                </Button>
                <Button size="s" view="outlined" onClick={() => resetBlockSize("animated-block-2")}>
                  Сбросить
                </Button>
              </Flex>
              <Flex gap={2}>
                <Button size="s" view="action" onClick={() => randomizeSize("animated-block-3")}>
                  Случайный размер блока 3
                </Button>
              </Flex>
            </Flex>
          </div>

          <div>
            <Text variant="body-1" style={{ color: "rgba(255,255,255,0.8)", marginBottom: "8px" }}>
              Связи:
            </Text>
            <Text variant="caption-1" style={{ color: "rgba(255,255,255,0.6)" }}>
              • Анимированные пунктирные линии
              <br />
              • Движение dash от source к target (one direction)
              <br />
              • Автоматический перезапуск через end hook
              <br />• Кастомные цвета и толщина
            </Text>
          </div>
        </div>
      </div>
    </ThemeProvider>
  );
};
