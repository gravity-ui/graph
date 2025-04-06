# @gravity-ui/graph &middot; [![npm package](https://img.shields.io/npm/v/@gravity-ui/graph)](https://www.npmjs.com/package/@gravity-ui/graph) [![Release](https://img.shields.io/github/actions/workflow/status/gravity-ui/graph/release.yml?branch=main&label=Release)](https://github.com/gravity-ui/graph/actions/workflows/release.yml?query=branch:main) [![storybook](https://img.shields.io/badge/Storybook-deployed-ff4685)](https://preview.gravity-ui.com/graph/)

Мощная и гибкая библиотека для создания интерактивных графовых визуализаций на canvas с блоками, соединениями и расширенными возможностями рендеринга.

> **Примечание:** Это основная документация библиотеки визуализации графов. Для получения информации по конкретным темам обратитесь к соответствующим разделам ниже.

[Storybook](https://preview.gravity-ui.com/graph/)

## Установка и настройка

```bash
npm install @gravity-ui/graph
```

## Обзор

Эта библиотека предоставляет комплексную систему для рендеринга и взаимодействия с графовыми визуализациями. Она включает в себя компонентную архитектуру с эффективными механизмами рендеринга, пространственной осведомленностью и богатым набором интерактивных возможностей.

## Ключевые особенности

| Особенность | Описание |
|-------------|-----------|
| Компонентная архитектура | Создание сложных визуализаций с использованием переиспользуемых компонентов |
| Эффективный рендеринг | Оптимизированный рендеринг на canvas с поддержкой слоев и пакетной обработки |
| Пространственная осведомленность | Система HitBox для эффективного взаимодействия и определения коллизий |
| Система соединений | Гибкая система создания и стилизации соединений между блоками |
| Управление блоками | Создание, настройка и организация блоков с поддержкой группировки |
| Обработка событий | Комплексная система событий для пользовательских взаимодействий |
| Управление жизненным циклом | Четко определенный жизненный цикл компонентов для предсказуемого поведения |

## Быстрый старт

```typescript
import { GraphCanvas, GraphState, GraphBlock, useGraph } from "@gravity-ui/graph";
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

## Примеры

- [Базовый пример](https://preview.gravity-ui.com/graph/?path=/story/stories-main-grapheditor--hundred-blocks)
- [Пример с большим масштабом](https://preview.gravity-ui.com/graph/?path=/story/stories-main-grapheditor--five-thousands-blocks)
- [Пользовательский вид блоков](https://preview.gravity-ui.com/graph/?path=/story/stories-main-grapheditor--custom-schematic-block)
- [Соединение по кривой Безье](https://preview.gravity-ui.com/graph/?path=/story/stories-main-grapheditor--one-bezier-connection)
- [Настройка соединений](https://preview.gravity-ui.com/graph/?path=/story/api-updateconnection--default)

## Документация

### Основные концепции

| Раздел | Описание | Документация |
|--------|-----------|--------------|
| Жизненный цикл компонентов | Инициализация, обновление, рендеринг и удаление компонентов | [Подробнее](docs/system/component-lifecycle.md) |
| Механизм рендеринга | Конвейер рендеринга и техники оптимизации | [Подробнее](docs/rendering/rendering-mechanism.md) |
| Система событий | Обработка событий, распространение и пользовательские события | [Подробнее](docs/system/events.md) |

### Основные компоненты

| Компонент | Описание | Документация |
|-----------|-----------|--------------|
| Canvas Graph | Основа для визуальных элементов с системой HitBox | [Подробнее](docs/components/canvas-graph-component.md) |
| Block Component | Строительные блоки для узлов графа | [Подробнее](docs/components/block-component.md) |
| Connections | Система создания и стилизации соединений | [Подробнее](docs/connections/canvas-connection-system.md) |

### Расширенные возможности

| Возможность | Описание | Документация |
|-------------|-----------|--------------|
| Система слоев | Управление z-index и рендеринг по слоям | [Подробнее](docs/rendering/layers.md) |
| Группы блоков | Автоматическая и ручная группировка блоков | [Подробнее](docs/blocks/groups.md) |
| Система планировщика | Планирование кадров и приоритизация обновлений | [Подробнее](docs/system/scheduler-system.md) |

### Конфигурация

| Тема | Описание | Документация |
|------|-----------|--------------|
| Настройки графа | Параметры конфигурации | [Подробнее](docs/system/graph-settings.md) |
| Публичный API | Методы для управления графом | [Подробнее](docs/system/public_api.md) |

> **Примечание:** Все примеры кода в документации используют TypeScript для лучшей типизации и удобства разработки.
