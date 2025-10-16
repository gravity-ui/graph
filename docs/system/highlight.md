# Highlight Service

Документ описывает универсальную систему подсветки элементов графа.

## Обзор

`HighlightService` управляет режимами подсветки для любых сущностей графа по их строковым идентификаторам (с префиксами). Он предоставляет два режима:

- highlight: подсвечиваются только целевые сущности, остальные остаются без изменений
- focus: целевые подсвечены, все прочие получают состояние lowlight

Сервис генерирует событие `highlight-changed` при каждом обновлении состояния.

## API

```ts
graph.highlight({ block: ["A", "B"], connection: ["X"] });
graph.focus({ block: ["A"] });
graph.clearHighlight();
```

```ts
// Получение визуального режима для id
graph.highlightService.getEntityHighlightMode("block:A");
```

### Поддержка префиксов

Сервис поддерживает произвольные префиксы: `block:`, `connection:`, `anchor:`, а также пользовательские `plugin:`, `myApp:` и т.п. Если id передан без двоеточия, он будет составлен как `${prefix}:${id}`.

## Интеграция с компонентами

- В базовом `GraphComponent` определён `getHighlightId()` (по умолчанию возвращает `String(getEntityId())`)
- Конкретные компоненты переопределяют метод, добавляя префикс:
  - `Block` → `block:{id}`
  - `Connection` → `connection:{id}`
  - `Anchor` → `anchor:{blockId}:{id}`
- `GraphComponent` подписывается на `$state` сервиса и обновляет `state.highlightMode` при изменениях

## События

`highlight-changed`: содержит текущий режим и список целевых сущностей, а также предыдущее состояние.

```ts
graph.on("highlight-changed", (event) => {
  const { mode, entities, previous } = event.detail;
});
```

## Производительность

- `highlight()` меняет состояние только целей — масштабируется по числу целей
- `focus()` потенциально затрагивает все сущности логически (визуально) — используйте осторожно на больших графах

## Демонстрация

Story: `src/stories/examples/highlight/HighlightModes.stories.tsx` — кнопки для включения `highlight`, `focus` и очистки.

## Ссылки

- Требования: https://github.com/gravity-ui/graph/issues/118


