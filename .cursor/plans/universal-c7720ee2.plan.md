<!-- c7720ee2-c963-4f34-8eb7-586b336bbb1a a4b677c8-7383-4671-b8a0-122d4ea314f7 -->
## План: Universal Highlight System (ссылка на требования)

Опираемся на требования из задачи “Highlight System for Graph Components” ([github.com/gravity-ui/graph/issues/118](https://github.com/gravity-ui/graph/issues/118)). Визуальные стили оставляем на стороне компонентов (ваш пункт 1.a), библиотека предоставляет только режимы и изменение состояния.

## Изменения по коду

1) Новый сервис подсветки

- Файл: `src/services/highlight/HighlightService.ts`
- Суть:
  - enum `HighlightVisualMode { Highlight = 20, Lowlight = 10 }`
  - Тип `THighlightServiceMode = "highlight" | "focus"` и `THighlightState` с полями: `active: boolean`, `mode?: THighlightServiceMode`, `entities: Set<string>`
  - Методы: `highlight(targets: Record<string, string[]>)`, `focus(targets: Record<string, string[]>)`, `clear()`, `getEntityHighlightMode(id: string): HighlightVisualMode | undefined`
  - Внутренний нормализатор целей: превращаем `{prefix: [id1,id2]}` → массив строк `${prefix}:${id}` (поддержка любых префиксов, ваш пункт 2)
  - Эмиссия события через Graph Emitter (см. ниже)

2) Публичный Graph API

- Файл: `src/graph.ts`
- Добавить методы:
  - `highlight(targets: Partial<Record<string, string[]>>): void`
  - `focus(targets: Partial<Record<string, string[]>>): void`
  - `clearHighlight(): void`
- Делегирование на `HighlightService` и эмиссия события `highlight-changed` через общий emitter Graph

3) События

- Файл: `src/graphEvents.ts`
- Добавить тип события `"highlight-changed"` c payload:
  - `{ mode: "highlight" | "focus" | undefined; entities: string[]; previous?: { mode?: ..., entities: string[] } }`

4) Базовый контракт компонентов

- Файл: `src/components/canvas/GraphComponent/index.tsx`
- Добавить по умолчанию метод `getHighlightId(): string` в базовый `GraphComponent` (ваш пункт 3). Реализация по умолчанию возвращает `String(this.getEntityId())` — без навязывания префикса, чтобы поддержать расширяемые схемы ID. Конкретные компоненты (Block/Connection/Anchor/плагины) могут переопределить и добавить префикс.
- Расширить `TComponentState` полем `highlightMode?: HighlightVisualMode` (ваш пункт 4)
- В инициализации `GraphComponent` подписаться на состояние `HighlightService` (через сигнал/Emitter) и вызывать `this.setState({ highlightMode })` для собственного `getHighlightId()`

5) Переопределения для основных Canvas-компонентов

- Файлы: 
  - `src/components/canvas/blocks/Block.ts` → `getHighlightId(): string { return "block:" + this.state.id; }`
  - `src/components/canvas/connections/Connection.ts` → `getHighlightId(): string { return "connection:" + this.state.id; }`
  - (Если есть базовый Anchor-компонент в Canvas) → `getHighlightId(): string { return "anchor:" + compositeId; }`
- Визуальная реакция остаётся в компонентах (1.a), мы лишь гарантируем `state.highlightMode`

6) Экспорт типов/сервиса

- Файл: `src/index.ts` и/или `src/api/PublicGraphApi.ts`
- Экспортировать `HighlightVisualMode`, публичные методы Graph

## Тестирование

Unit

- `src/services/highlight/HighlightService.spec.ts`
  - `getEntityHighlightMode()` в режимах `highlight`/`focus`
  - Переключение режимов и `clear()` с сохранением/сбросом состояния
  - Нормализация целей с произвольными префиксами
- `src/graph.test.ts` (расширение существующего):
  - Делегирование API к сервису, корректная эмиссия `highlight-changed` и `previous`

Integration

- Новый тест: `src/react-components/Highlight.integration.test.tsx`
  - Смонтировать маленький граф (2–3 узла, ребро)
  - Вызвать `graph.highlight({ block: [...] })` → проверить, что соответствующие `Block` получили `state.highlightMode === HighlightVisualMode.Highlight`, остальные `undefined`
  - Вызвать `graph.focus({ block: [...] })` → цели с `Highlight`, остальные с `Lowlight`

## Story (демо)

- Файл: `src/stories/examples/highlight/HighlightModes.stories.tsx`
- Демо-контролы: выбор целей по узлам/ребрам, кнопки `Highlight`, `Focus`, `Clear`
- Показать разницу режимов (одна сцена с переключателем режима)

## Примечания по совместимости/перформансу

- `focus()` — потенциально O(N) по всем сущностям; минимизируем инвалидации: подписка компонентов через общее состояние сервиса, без индивидуальных подписок на каждый ID
- По умолчанию компоненты без `getHighlightId()` останутся с `highlightMode === undefined`

## Короткие фрагменты (схема)

```ts
// src/services/highlight/HighlightService.ts
export enum HighlightVisualMode { Highlight = 20, Lowlight = 10 }
export type THighlightServiceMode = "highlight" | "focus";
export class HighlightService { /* highlight, focus, clear, getEntityHighlightMode */ }
```



```ts
// src/graph.ts (фрагмент)
public highlight(targets: Partial<Record<string, string[]>>): void { /* delegate */ }
public focus(targets: Partial<Record<string, string[]>>): void { /* delegate */ }
public clearHighlight(): void { /* delegate */ }
```



```ts
// src/lib/Component.ts (фрагмент)
public getHighlightId(): string { return String(this.state?.id ?? ""); }
// state: add highlightMode?: HighlightVisualMode
```

### To-dos

- [ ] Создать HighlightService с режимами и нормализацией целей
- [ ] Добавить методы highlight/focus/clearHighlight в Graph и событие
- [ ] Добавить getHighlightId() и state.highlightMode в базовый компонент
- [ ] Переопределить getHighlightId в Block/Connection/Anchor
- [ ] Написать unit-тесты для HighlightService и Graph API
- [ ] Интеграционные тесты: состояние highlightMode у компонентов
- [ ] Сделать Story с управлением Highlight/Focus/Clear
- [ ] Экспортировать типы и публичные методы в index/api