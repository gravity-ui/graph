# @gravity-ui/graph &middot; [![npm package](https://img.shields.io/npm/v/@gravity-ui/graph)](https://www.npmjs.com/package/@gravity-ui/graph) [![Release](https://img.shields.io/github/actions/workflow/status/gravity-ui/graph/release.yml?branch=main&label=Release)](https://github.com/gravity-ui/graph/actions/workflows/release.yml?query=branch:main) [![storybook](https://img.shields.io/badge/Storybook-deployed-ff4685)](https://preview.gravity-ui.com/graph/)

> [Migration Guide from 0.x to 1.x →](docs/migration-guides/v0-to-v1.md)

Библиотека для визуализации графов, объединяющая преимущества двух подходов:
- Canvas для быстрой отрисовки всего графа
- HTML/React для удобного взаимодействия при приближении

Больше не нужно выбирать между производительностью и интерактивностью. Идеально подходит для больших графов, блок-схем и редакторов на основе узлов.

## Мотивация

Современные веб-приложения часто требуют сложной визуализации и интерактивности, но существующие решения обычно используют только одну технологию отрисовки:

- **Canvas** обеспечивает высокую производительность для сложной графики, но ограничен в работе с текстом и взаимодействием с пользователем.
- **HTML DOM** удобен для интерфейсов, но теряет производительность при сложной графике или большом количестве элементов.

@gravity-ui/graph решает эту проблему, автоматически переключаясь между Canvas и HTML в зависимости от масштаба:
- **При отдалении**: Использует Canvas для быстрой отрисовки всего графа
- **Среднее приближение**: Показывает упрощенное представление с базовым взаимодействием
- **При приближении**: Переключается на HTML/React компоненты для полноценного взаимодействия

## Как это работает

Библиотека использует умную систему отрисовки, которая автоматически управляет переключением между Canvas и React компонентами:

1. На низких уровнях масштаба всё отрисовывается на Canvas для производительности
2. При приближении к детальному виду, компонент `BlocksList`:
   - Следит за изменениями области просмотра и масштаба
   - Определяет видимые блоки в текущей области (с запасом для плавного скролла)
   - Создает React компоненты только для видимых блоков
   - Обновляет список при скролле или изменении масштаба
   - Удаляет React компоненты при отдалении

```typescript
// Пример использования React компонентов
const MyGraph = () => {
  return (
    <GraphCanvas
      graph={graph}
      renderBlock={(graph, block) => (
        <MyCustomBlockComponent 
          graph={graph} 
          block={block}
        />
      )}
    />
  );
};
```

[Storybook](https://preview.gravity-ui.com/graph/)

## Установка

```bash
npm install @gravity-ui/graph
```

## Примеры

### Пример на React

[Подробная документация по React компонентам](docs/react/usage.md)

```typescript
import { Graph } from "@gravity-ui/graph";
import { GraphCanvas, GraphState, GraphBlock, useGraph } from "@gravity-ui/graph/react";
import React from "react";

const config = {};

export function GraphEditor() {
  const { graph, setEntities, start } = useGraph(config);

  useEffect(() => {
    setEntities({
      blocks: [
        {
          is: "block-action",
          id: "action_1",
          x: -100,
          y: -450,
          width: 126,
          height: 126,
          selected: true,
          name: "Блок #1",
          anchors: [],
        },
        {
          id: "action_2",
          is: "block-action",
          x: 253,
          y: 176,
          width: 126,
          height: 126,
          selected: false,
          name: "Блок #2",
          anchors: [],
        }
      ],
      connections: [
        {
          sourceBlockId: "action_1",
          targetBlockId: "action_2",
        }
      ]
    });
  }, [setEntities]);

  const renderBlockFn = (graph, block) => {
    return <GraphBlock graph={graph} block={block}>{block.id}</GraphBlock>;
  };

  return (
    <GraphCanvas
      graph={graph}
      renderBlock={renderBlockFn}
      onStateChanged={({ state }) => {
        if (state === GraphState.ATTACHED) {
          start();
          graph.zoomTo("center", { padding: 300 });
        }
      }}
    />
  );
}
```

### Пример на JavaScript

```javascript
import { Graph } from "@gravity-ui/graph";

// Создаем контейнер
const container = document.createElement('div');
container.style.width = '100vw';
container.style.height = '100vh';
container.style.overflow = 'hidden';
document.body.appendChild(container);

// Инициализируем граф с конфигурацией
const graph = new Graph({
    configurationName: "example",
    blocks: [],
    connections: [],
    settings: {
        canDragCamera: true,
        canZoomCamera: true,
        useBezierConnections: true,
        showConnectionArrows: true
    }
}, container);

// Добавляем блоки и связи
graph.setEntities({
    blocks: [
        {
            is: "block-action",
            id: "block1",
            x: 100,
            y: 100,
            width: 120,
            height: 120,
            name: "Блок #1"
        },
        {
            is: "block-action",
            id: "block2",
            x: 300,
            y: 300,
            width: 120,
            height: 120,
            name: "Блок #2"
        }
    ],
    connections: [
        {
            sourceBlockId: "block1",
            targetBlockId: "block2"
        }
    ]
});

// Запускаем отрисовку
graph.start();

// Центрируем вид
graph.zoomTo("center", { padding: 100 });
```

## Демо

- [Базовый пример](https://preview.gravity-ui.com/graph/?path=/story/stories-main-grapheditor--hundred-blocks)
- [Пример с большим количеством элементов](https://preview.gravity-ui.com/graph/?path=/story/stories-main-grapheditor--five-thousands-blocks)
- [Кастомизация блоков](https://preview.gravity-ui.com/graph/?path=/story/stories-main-grapheditor--custom-schematic-block)
- [Кривые Безье](https://preview.gravity-ui.com/graph/?path=/story/stories-main-grapheditor--one-bezier-connection)
- [Настройка связей](https://preview.gravity-ui.com/graph/?path=/story/api-updateconnection--default)

## Документация

### Основные концепции

| Раздел | Описание | Документация |
|--------|-----------|--------------|
| Жизненный цикл компонентов | Инициализация, обновление, отрисовка и удаление компонентов | [Подробнее](docs/system/component-lifecycle.md) |
| Механизм отрисовки | Процесс отрисовки и оптимизации | [Подробнее](docs/rendering/rendering-mechanism.md) |
| Система событий | Обработка и распространение событий | [Подробнее](docs/system/events.md) |

### Основные компоненты

| Компонент | Описание | Документация |
|-----------|-----------|--------------|
| Canvas Graph | Основа для визуальных элементов с системой обнаружения | [Подробнее](docs/components/canvas-graph-component.md) |
| Block Component | Базовые блоки для узлов графа | [Подробнее](docs/components/block-component.md) |
| Connections | Создание и стилизация связей | [Подробнее](docs/connections/canvas-connection-system.md) |

### Дополнительные возможности

| Возможность | Описание | Документация |
|-------------|-----------|--------------|
| Система слоев | Управление z-index и отрисовка по слоям | [Подробнее](docs/rendering/layers.md) |
| Группы блоков | Автоматическая и ручная группировка | [Подробнее](docs/blocks/groups.md) |
| Планировщик | Управление кадрами и приоритетами обновлений | [Подробнее](docs/system/scheduler-system.md) |

### Конфигурация

| Тема | Описание | Документация |
|------|-----------|--------------|
| Настройки графа | Параметры конфигурации | [Подробнее](docs/system/graph-settings.md) |
| API | Методы для управления графом | [Подробнее](docs/system/public_api.md) |
