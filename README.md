# Graph Workspace

Это workspace для библиотеки @gravity-ui/graph, организованный с использованием npm workspaces.

## Структура

```
graph-workspace/
├── packages/
│   ├── graph/          # Основная библиотека @gravity-ui/graph
│   └── storybook/      # Storybook для разработки и демонстрации
├── package.json         # Корневой package.json с настройкой workspaces
└── README.md           # Этот файл
```

## Установка и запуск

### Установка зависимостей

```bash
npm install
```

### Запуск Storybook

```bash
npm run storybook
```

### Сборка всех пакетов

```bash
npm run build
```

### Запуск тестов

```bash
npm run test
```

### Линтинг

```bash
npm run lint
```

## Пакеты

### @gravity-ui/graph

Основная библиотека для создания интерактивных графов с поддержкой Canvas и React рендеринга.

**Команды:**
- `npm run build` - сборка библиотеки
- `npm run test` - запуск тестов
- `npm run lint` - линтинг кода

### @gravity-ui/graph-storybook

Storybook для разработки и демонстрации возможностей библиотеки.

**Команды:**
- `npm run storybook` - запуск Storybook
- `npm run storybook:build` - сборка Storybook

## Разработка

Workspace позволяет:
- Разделять зависимости между пакетами
- Использовать общие инструменты разработки
- Упрощать управление версиями
- Оптимизировать установку зависимостей

## История

Этот workspace был создан из монолитной структуры библиотеки для улучшения организации кода и подготовки к возможному разделению на отдельные пакеты в будущем.
