import React, { useCallback, useEffect } from "react";

import { ThemeProvider } from "@gravity-ui/uikit";
import type { Meta, StoryObj } from "@storybook/react";

import { TBlock } from "../../../components/canvas/blocks/Block";
import { AlignmentLinesLayer } from "../../../components/canvas/layers/alignmentLayer";
import { Graph } from "../../../graph";
import { GraphBlock, GraphCanvas, useGraph, useLayer } from "../../../react-components";
import { TConnection } from "../../../store/connection/ConnectionState";
import { ECanChangeBlockGeometry } from "../../../store/settings";

import "@gravity-ui/uikit/styles/styles.css";

// Sample data for demonstration
const sampleBlocks: TBlock[] = [
  {
    is: "Block" as const,
    id: "block-1",
    x: 100,
    y: 100,
    width: 150,
    height: 80,
    selected: false,
    name: "Block 1",
    anchors: [],
  },
  {
    is: "Block" as const,
    id: "block-2",
    x: 300,
    y: 200,
    width: 150,
    height: 80,
    selected: false,
    name: "Block 2",
    anchors: [],
  },
  {
    is: "Block" as const,
    id: "block-3",
    x: 500,
    y: 100,
    width: 150,
    height: 80,
    selected: false,
    name: "Block 3",
    anchors: [],
  },
  {
    is: "Block" as const,
    id: "block-4",
    x: 200,
    y: 300,
    width: 150,
    height: 80,
    selected: false,
    name: "Block 4",
    anchors: [],
  },
];

const sampleConnections: TConnection[] = [];

interface AlignmentStoryProps {
  magnetismDistance?: number | "auto";
  snapThreshold?: number;
  allowMultipleSnap?: boolean;
  enabledBorders?: Array<"top" | "right" | "bottom" | "left">;
  snapColor?: string;
  guideColor?: string;
  lineWidth?: number;
  snapDashPattern?: number[];
  guideDashPattern?: number[];
}

const AlignmentStory = ({
  magnetismDistance = 200, // Увеличиваем для демонстрации бесконечных линий
  snapThreshold = 15, // Прилипание только при близком расстоянии
  allowMultipleSnap = true,
  enabledBorders = ["top", "right", "bottom", "left"],
  snapColor = "#007AFF",
  guideColor = "#E0E0E0",
  lineWidth = 1,
  snapDashPattern = [5, 5],
  guideDashPattern = [3, 3],
}: AlignmentStoryProps) => {
  const renderBlock = useCallback((graph: Graph, block: TBlock) => {
    return (
      <GraphBlock graph={graph} block={block} className="demo-block">
        <div
          style={{
            width: "100%",
            height: "100%",
            background: "#f5f5f5",
            border: "2px solid #ddd",
            borderRadius: "8px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "Arial, sans-serif",
            fontSize: "14px",
            fontWeight: "bold",
            cursor: "grab",
            userSelect: "none",
          }}
        >
          {block.name}
        </div>
      </GraphBlock>
    );
  }, []);

  const { graph } = useGraph({
    settings: {
      canChangeBlockGeometry: ECanChangeBlockGeometry.ALL,
      canDragCamera: true,
      canZoomCamera: true,
    },
  });

  useLayer(graph, AlignmentLinesLayer, {
    magneticBorderConfig: {
      magnetismDistance,
      snapThreshold,
      allowMultipleSnap,
      enabledBorders,
    },
    lineStyle: {
      snapColor,
      guideColor,
      width: lineWidth,
      snapDashPattern,
      guideDashPattern,
    },
  });

  useEffect(() => {
    if (graph) {
      graph.setEntities({
        blocks: sampleBlocks,
        connections: sampleConnections,
      });
      graph.start();
    }
  }, [graph]);

  return (
    <div style={{ width: "100%", height: "600px" }}>
      <div
        style={{
          marginBottom: "16px",
          padding: "12px",
          background: "#f9f9f9",
          borderRadius: "6px",
          fontSize: "14px",
        }}
      >
        <strong>💡 Инструкция:</strong> Перетащите блок любой границей к линии. Прилипание работает для всех границ
        блока (верх, низ, лево, право)
      </div>
      <GraphCanvas graph={graph} renderBlock={renderBlock} />
    </div>
  );
};

const GraphApp = (props: AlignmentStoryProps) => {
  return (
    <ThemeProvider theme={"light"}>
      <AlignmentStory {...props} />
    </ThemeProvider>
  );
};

const meta: Meta<typeof GraphApp> = {
  title: "Examples/Alignment Layer",
  component: GraphApp,
  parameters: {
    layout: "fullscreen",
  },
  argTypes: {
    magnetismDistance: {
      control: { type: "select" },
      options: ["auto", 100, 200, 300, 500],
      description: "Радиус поиска блоков для создания бесконечных линий",
    },
    snapThreshold: {
      control: { type: "range", min: 5, max: 50, step: 5 },
      description: "Расстояние до линии для срабатывания прилипания",
    },
    allowMultipleSnap: {
      control: { type: "boolean" },
      description: "Разрешить прилипание к нескольким линиям одновременно",
    },
    enabledBorders: {
      control: { type: "check" },
      options: ["top", "right", "bottom", "left"],
      description: "Включенные границы для выравнивания",
    },
    snapColor: {
      control: { type: "color" },
      description: "Цвет линий прилипания (активное выравнивание)",
    },
    guideColor: {
      control: { type: "color" },
      description: "Цвет вспомогательных линий (потенциальное выравнивание)",
    },
    lineWidth: {
      control: { type: "range", min: 1, max: 5, step: 1 },
      description: "Толщина линий в пикселях",
    },
    snapDashPattern: {
      control: { type: "object" },
      description: "Паттерн пунктира для линий прилипания",
    },
    guideDashPattern: {
      control: { type: "object" },
      description: "Паттерн пунктира для вспомогательных линий",
    },
  },
};

export default meta;

type Story = StoryObj<typeof GraphApp>;

/**
 * Демонстрирует бесконечные линии выравнивания с прилипанием по расстоянию до линии.
 * Серые линии видны всегда, синие появляются при приближении к линии.
 */
export const DefaultAlignmentLines: Story = {
  args: {
    magnetismDistance: 200, // Большое расстояние для показа бесконечных линий
    snapThreshold: 15, // Прилипание только при близком расстоянии к линии
    allowMultipleSnap: true,
    enabledBorders: ["top", "right", "bottom", "left"],
    snapColor: "#007AFF",
    guideColor: "#E0E0E0",
    lineWidth: 1,
    snapDashPattern: [5, 5],
    guideDashPattern: [3, 3],
  },
  parameters: {
    docs: {
      description: {
        story: `
Система бесконечных линий выравнивания с прилипанием любой границы блока.

**Ключевые особенности:**
1. **Бесконечные линии выравнивания**:
   - Серые линии показывают все возможные направления выравнивания
   - Линии видны для всех блоков в радиусе magnetismDistance (200px)
   - Линии продолжаются бесконечно, не ограничиваются размерами блоков
   
2. **Прилипание всех границ блока**:
   - Прилипание работает для любой границы: верх, низ, лево, право
   - Система автоматически определяет ближайшую границу блока к линии
   - Прилипание происходит при приближении любой границы на snapThreshold (15px)
   
3. **Множественное прилипание**:
   - Одновременное прилипание к горизонтальной и вертикальной линиям
   - Позволяет точно выравнивать блоки по углам используя разные границы

**Как использовать:**
1. Перетащите блок - увидите серые бесконечные линии от всех блоков поблизости
2. Приблизьте ЛЮБУЮ границу блока к серой линии - она станет синей и сработает прилипание
3. Попробуйте выровнять правую границу одного блока с левой границей другого
4. Попробуйте выровнять нижнюю границу с верхней границей другого блока

**Преимущества:**
- Интуитивное поведение: любая граница блока может прилипнуть к линии  
- Точное управление: блок позиционируется правильно в зависимости от прилипающей границы
- Универсальность: работает для всех сценариев выравнивания блоков
        `,
      },
    },
  },
};

/**
 * Демонстрирует плавное управление с разными порогами прилипания
 */
export const SmoothSnapControl: Story = {
  args: {
    magnetismDistance: 80,
    snapThreshold: 10,
    allowMultipleSnap: true,
    enabledBorders: ["top", "right", "bottom", "left"],
    snapColor: "#FF3B30",
    guideColor: "#FFE5E5",
    lineWidth: 2,
    snapDashPattern: [8, 4],
    guideDashPattern: [2, 2],
  },
  parameters: {
    docs: {
      description: {
        story: `
Пример с плавным управлением:
- Большое расстояние обнаружения (80px) - рано показывает вспомогательные линии
- Малый порог прилипания (10px) - требует точного позиционирования
- Красные линии прилипания на розовом фоне вспомогательных линий
- Идеально для точного позиционирования элементов
        `,
      },
    },
  },
};

/**
 * Пример с жестким прилипанием (как в старой версии)
 */
export const StrictSnapping: Story = {
  args: {
    magnetismDistance: 30,
    snapThreshold: 30, // Равно magnetismDistance - прилипание сразу
    allowMultipleSnap: false,
    enabledBorders: ["top", "bottom"],
    snapColor: "#34C759",
    guideColor: "#34C759", // Тот же цвет - нет разделения
    lineWidth: 2,
    snapDashPattern: [10, 5],
    guideDashPattern: [10, 5],
  },
  parameters: {
    docs: {
      description: {
        story: `
Эмуляция старого поведения (без плавного управления):
- snapThreshold = magnetismDistance (30px) - прилипание сразу при обнаружении
- allowMultipleSnap = false - только одна линия
- Только горизонтальное выравнивание
- Одинаковый стиль для всех линий
        `,
      },
    },
  },
};

/**
 * Демонстрирует прилипание всех границ блока к линиям
 */
export const AllBordersSnappingDemo: Story = {
  args: {
    magnetismDistance: 300,
    snapThreshold: 20, // Немного больший порог для удобства демонстрации
    allowMultipleSnap: true,
    enabledBorders: ["top", "right", "bottom", "left"],
    snapColor: "#34C759",
    guideColor: "#D1D1D6",
    lineWidth: 2,
    snapDashPattern: [6, 4],
    guideDashPattern: [2, 2],
  },
  parameters: {
    docs: {
      description: {
        story: `
Демонстрация прилипания всех границ блока:

**Эксперименты:**
1. **Левая граница**: Перетащите блок так, чтобы его левая сторона приблизилась к вертикальной линии
2. **Правая граница**: Перетащите блок так, чтобы его правая сторона приблизилась к вертикальной линии  
3. **Верхняя граница**: Перетащите блок так, чтобы его верх приблизился к горизонтальной линии
4. **Нижняя граница**: Перетащите блок так, чтобы его низ приблизился к горизонтальной линии
5. **Углы**: Попробуйте выровнять углы блоков - сработает двойное прилипание

**Обратите внимание:**
- Блок правильно позиционируется в зависимости от того, какая граница прилипает
- snapThreshold = 20px для удобства демонстрации
- Зеленые линии четко показывают момент срабатывания прилипания
        `,
      },
    },
  },
};

/**
 * Демонстрирует разницу между бесконечными линиями и прилипанием по расстоянию
 */
export const InfiniteLinesDemo: Story = {
  args: {
    magnetismDistance: 400, // Очень большой радиус для демонстрации
    snapThreshold: 10, // Малое расстояние прилипания
    allowMultipleSnap: true,
    enabledBorders: ["top", "right", "bottom", "left"],
    snapColor: "#FF3B30",
    guideColor: "#C7C7CC",
    lineWidth: 1,
    snapDashPattern: [8, 4],
    guideDashPattern: [2, 2],
  },
  parameters: {
    docs: {
      description: {
        story: `
Демонстрация концепции бесконечных линий:
- magnetismDistance = 400px - показывает линии от всех блоков на экране
- snapThreshold = 10px - очень точное прилипание только вблизи линий
- Серые пунктирные линии показывают все возможности выравнивания
- Красные линии появляются только при точном наведении на линию
- Попробуйте двигать блок по всему экрану - увидите все линии выравнивания
        `,
      },
    },
  },
};

/**
 * Демонстрирует множественное прилипание к углу
 */
export const MultipleSnapDemo: Story = {
  args: {
    magnetismDistance: 60,
    snapThreshold: 20,
    allowMultipleSnap: true,
    enabledBorders: ["top", "right", "bottom", "left"],
    snapColor: "#AF52DE",
    guideColor: "#F5E5FF",
    lineWidth: 1,
    snapDashPattern: [6, 3],
    guideDashPattern: [2, 2],
  },
  parameters: {
    docs: {
      description: {
        story: `
Пример множественного прилипания:
- Попробуйте выровнять блок по углу другого блока
- Увидите одновременно горизонтальную и вертикальную линии прилипания
- Фиолетовые линии на светло-фиолетовом фоне
- Идеально для точного позиционирования в сетке
        `,
      },
    },
  },
};
