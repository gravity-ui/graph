import React, { useCallback, useEffect, useRef, useState } from "react";

import { FloatingArrow, VirtualElement, arrow, autoUpdate, flip, offset, shift, useFloating } from "@floating-ui/react";
import { Flex, Text, ThemeProvider } from "@gravity-ui/uikit";
import type { Meta, StoryObj } from "@storybook/react";

import { Block as CanvasBlock } from "../../../components/canvas/blocks/Block";
import type { TBlock } from "../../../components/canvas/blocks/Block";
import type { Graph } from "../../../graph";
import { GraphBlock, GraphCanvas, GraphPortal, useGraphEvent } from "../../../react-components";
import { useGraph } from "../../../react-components/hooks/useGraph";
import { ECanChangeBlockGeometry } from "../../../store/settings";

const meta: Meta = {
  title: "Examples/Declarative Components/Block Tooltip",
  parameters: {
    layout: "fullscreen",
  },
};

export default meta;

type Story = StoryObj<typeof meta>;

// Расширенный тип блока с дополнительными данными
type ExtendedBlock = TBlock<{
  type: string;
  description: string;
  version: string;
}>;

// Пример блоков для демонстрации
const sampleBlocks: ExtendedBlock[] = [
  {
    is: "Block",
    id: "block-1",
    x: 100,
    y: 100,
    width: 200,
    height: 120,
    name: "API Gateway",
    selected: false,
    anchors: [],
    meta: {
      type: "Service",
      description: "Handles incoming HTTP requests and routes them to appropriate services",
      version: "v2.1.0",
    },
  },
  {
    is: "Block",
    id: "block-2",
    x: 350,
    y: 200,
    width: 180,
    height: 100,
    name: "User Database",
    selected: false,
    anchors: [],
    meta: {
      type: "Database",
      description: "PostgreSQL database storing user profiles and authentication data",
      version: "v1.5.2",
    },
  },
  {
    is: "Block",
    id: "block-3",
    x: 150,
    y: 350,
    width: 220,
    height: 140,
    name: "Message Queue",
    selected: false,
    anchors: [],
    meta: {
      type: "Infrastructure",
      description: "Redis-based message queue for asynchronous task processing",
      version: "v3.0.1",
    },
  },
];

interface BlockTooltipProps {
  graph: Graph;
  renderContent: (block: ExtendedBlock) => React.ReactNode;
}

const BlockTooltipComponent = ({ graph, renderContent }: BlockTooltipProps) => {
  const [hoveredBlock, setHoveredBlock] = useState<ExtendedBlock | null>(null);
  const [blockPosition, setBlockPosition] = useState<{ x: number; y: number; width: number; height: number } | null>(
    null
  );
  const [isTooltipHovered, setIsTooltipHovered] = useState(false);
  const arrowRef = useRef<SVGSVGElement>(null);
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Функция для скрытия тултипа с задержкой
  const hideTooltipWithDelay = useCallback(() => {
    hideTimeoutRef.current = setTimeout(() => {
      if (!isTooltipHovered) {
        setHoveredBlock(null);
        setBlockPosition(null);
      }
    }, 100); // 100ms задержка
  }, [isTooltipHovered]);

  // Функция для отмены скрытия тултипа
  const cancelHideTooltip = useCallback(() => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
  }, []);

  // Создаем виртуальный элемент для позиционирования
  const virtualElement: VirtualElement | null = blockPosition
    ? {
        getBoundingClientRect() {
          return {
            x: blockPosition.x,
            y: blockPosition.y,
            width: blockPosition.width,
            height: blockPosition.height,
            top: blockPosition.y,
            left: blockPosition.x,
            right: blockPosition.x + blockPosition.width,
            bottom: blockPosition.y + blockPosition.height,
          };
        },
      }
    : null;

  const { refs, floatingStyles, context } = useFloating({
    elements: {
      reference: virtualElement as any, // VirtualElement совместим с useFloating
    },
    open: Boolean(hoveredBlock) && Boolean(blockPosition),
    placement: "top",
    middleware: [
      offset(10),
      flip({
        fallbackPlacements: ["bottom", "right", "left"],
      }),
      shift({ padding: 8 }),
      arrow({
        element: arrowRef,
      }),
    ],
    whileElementsMounted: autoUpdate,
  });

  useGraphEvent(graph, "mouseenter", ({ target }) => {
    const component = target as CanvasBlock;
    if (component.isBlock && component.connectedState) {
      const block = component.connectedState.asTBlock() as ExtendedBlock;

      // Отменяем скрытие тултипа если оно было запланировано
      cancelHideTooltip();

      // Получаем позицию блока в экранных координатах
      const camera = graph.cameraService.getCameraState();
      const screenX = block.x * camera.scale + camera.x;
      const screenY = block.y * camera.scale + camera.y;
      const screenWidth = block.width * camera.scale;
      const screenHeight = block.height * camera.scale;

      setHoveredBlock(block);
      setBlockPosition({
        x: screenX,
        y: screenY,
        width: screenWidth,
        height: screenHeight,
      });
    }
  });

  useGraphEvent(graph, "mouseleave", ({ target }) => {
    const component = target as CanvasBlock;
    if (component.isBlock) {
      // Скрываем тултип с задержкой, только если мышь не над тултипом
      hideTooltipWithDelay();
    }
  });

  // Обновляем позицию при изменении камеры
  useGraphEvent(graph, "camera-change", () => {
    if (hoveredBlock) {
      const camera = graph.cameraService.getCameraState();
      const screenX = hoveredBlock.x * camera.scale + camera.x;
      const screenY = hoveredBlock.y * camera.scale + camera.y;
      const screenWidth = hoveredBlock.width * camera.scale;
      const screenHeight = hoveredBlock.height * camera.scale;

      setBlockPosition({
        x: screenX,
        y: screenY,
        width: screenWidth,
        height: screenHeight,
      });
    }
  });

  // Очищаем таймеры при размонтировании
  useEffect(() => {
    return () => {
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }
    };
  }, []);

  // Обработчики для тултипа
  const handleTooltipMouseEnter = useCallback(() => {
    setIsTooltipHovered(true);
    cancelHideTooltip();
  }, [cancelHideTooltip]);

  const handleTooltipMouseLeave = useCallback(() => {
    setIsTooltipHovered(false);
    hideTooltipWithDelay();
  }, [hideTooltipWithDelay]);

  if (!hoveredBlock || !blockPosition || !virtualElement) {
    return null;
  }

  return (
    <div
      ref={refs.setFloating}
      style={{
        ...floatingStyles,
        backgroundColor: "white",
        border: "1px solid #e1e4e8",
        borderRadius: "8px",
        padding: "12px",
        boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
        zIndex: 1000,
        maxWidth: "300px",
        fontSize: "14px",
      }}
      onMouseEnter={handleTooltipMouseEnter}
      onMouseLeave={handleTooltipMouseLeave}
    >
      <FloatingArrow ref={arrowRef} context={context} fill="white" stroke="#e1e4e8" strokeWidth={1} />
      {renderContent(hoveredBlock)}
    </div>
  );
};

/**
 * Компонент для отображения тултипов при наведении на блоки
 */
function BlockTooltip({ renderContent }: Pick<BlockTooltipProps, "renderContent">) {
  return (
    <GraphPortal className="block-tooltip-layer" zIndex={1000} transformByCameraPosition={false}>
      {(layer, graph) => {
        return <BlockTooltipComponent graph={graph} renderContent={renderContent} />;
      }}
    </GraphPortal>
  );
}

function BlockTooltipExample() {
  const { graph } = useGraph({
    settings: {
      canDragCamera: true,
      canZoomCamera: true,
      canChangeBlockGeometry: ECanChangeBlockGeometry.ALL,
      canCreateNewConnections: false,
    },
  });

  useEffect(() => {
    if (graph) {
      graph.setEntities({
        blocks: sampleBlocks,
        connections: [],
      });
      graph.start();
    }
  }, [graph]);

  const renderTooltipContent = (block: ExtendedBlock) => (
    <Flex direction="column" gap={4}>
      <Text variant="header-1">{block.name}</Text>
      <Text variant="body-1">{block.meta?.type || "Unknown"}</Text>
      <Text variant="body-1">{block.meta?.description || "No description available"}</Text>
      {block.meta?.version && <Text variant="body-1">{block.meta.version}</Text>}
    </Flex>
  );

  const renderBlock = useCallback((graph: Graph, block: TBlock) => {
    const extendedBlock = block as ExtendedBlock;
    return (
      <GraphBlock graph={graph} block={extendedBlock}>
        <div
          style={{
            fontSize: "14px",
            fontWeight: "600",
            color: "#24292e",
            textAlign: "center",
            lineHeight: "1.2",
          }}
        >
          {extendedBlock.name}
        </div>
        <div
          style={{
            fontSize: "11px",
            color: "#6a737d",
            marginTop: "4px",
            textTransform: "uppercase",
            letterSpacing: "0.5px",
          }}
        >
          {extendedBlock.meta?.type || "Service"}
        </div>
      </GraphBlock>
    );
  }, []);

  return (
    <ThemeProvider theme="light">
      <div style={{ height: "100vh", width: "100vw", backgroundColor: "#f6f8fa" }}>
        <div
          style={{
            position: "absolute",
            top: 20,
            left: 20,
            zIndex: 100,
            backgroundColor: "white",
            padding: "12px 16px",
            borderRadius: "6px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
            fontSize: "14px",
            color: "#24292e",
          }}
        >
          💡 Hover over blocks to see tooltips with detailed information
        </div>

        <GraphCanvas graph={graph} renderBlock={renderBlock}>
          <BlockTooltip renderContent={renderTooltipContent} />
        </GraphCanvas>
      </div>
    </ThemeProvider>
  );
}

export const BlockTooltipStory: Story = {
  render: () => <BlockTooltipExample />,
  parameters: {
    docs: {
      description: {
        story: `
### Block Tooltip with GraphPortal

Этот пример демонстрирует создание интерактивных тултипов для блоков графа с помощью GraphPortal.

#### Основные возможности:
- **Автоматическое позиционирование:** Тултип следует за курсором мыши
- **Богатый контент:** Настраиваемое содержимое тултипа через render prop
- **События графа:** Использует встроенные события \`mouseenter\`, \`mouseleave\`
- **Производительность:** Минимальное влияние на производительность графа
- **Типизация:** Полная поддержка TypeScript с расширенными типами блоков

#### Расширенный тип блока:
\`\`\`tsx
type ExtendedBlock = TBlock<{
  type: string;
  description: string;
  version: string;
}>;
\`\`\`

#### Компонент BlockTooltip:
\`\`\`tsx
function BlockTooltip({ renderContent }: BlockTooltipProps) {
  return (
    <GraphPortal zIndex={1000}>
      {(layer, graph) => {
        // Подписка на события блоков
        useEffect(() => {
          graph.on("mouseenter", handleMouseEnter);
          graph.on("mouseleave", handleMouseLeave);
          
          return () => {
            // Очистка подписок
          };
        }, [graph]);

        return (
          <Tooltip content={renderContent(hoveredBlock)}>
            <div style={{ position: "fixed", ... }} />
          </Tooltip>
        );
      }}
    </GraphPortal>
  );
}
\`\`\`

#### Использование:
\`\`\`tsx
<GraphCanvas graph={graph} renderBlock={renderBlock}>
  <BlockTooltip 
    renderContent={(block) => (
      <div>
        <h4>{block.name}</h4>
        <p>{block.meta?.description}</p>
      </div>
    )} 
  />
</GraphCanvas>
\`\`\`

Наведите курсор на любой блок для просмотра детальной информации!
        `,
      },
    },
  },
};
