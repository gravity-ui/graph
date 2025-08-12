# Graph Workspace

Это workspace для библиотеки @gravity-ui/graph, организованный с использованием npm workspaces.

## Структура

```
graph-workspace/
├── packages/
│   ├── graph/          # Основная библиотека @gravity-ui/graph (Canvas логика)
│   ├── graph-react/    # React компоненты @gravity-ui/graph-react
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

Основная библиотека для создания интерактивных графов с поддержкой Canvas рендеринга. Содержит всю логику управления графом, слоями, блоками и соединениями.

**Команды:**
- `npm run build` - сборка библиотеки
- `npm run test` - запуск тестов
- `npm run lint` - линтинг кода

### @gravity-ui/graph-react

React компоненты и хуки для интеграции с @gravity-ui/graph. Предоставляет удобный интерфейс для работы с графом в React приложениях.

**Команды:**
- `npm run build` - сборка React компонентов
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

Этот workspace был создан из монолитной структуры библиотеки для улучшения организации кода. В процессе рефакторинга React компоненты были вынесены в отдельный пакет `@gravity-ui/graph-react`, что позволило:

- Разделить Canvas логику и React компоненты
- Избежать циклических зависимостей
- Упростить поддержку и развитие каждого пакета
- Сделать архитектуру более модульной

## Архитектура

### Разделение ответственности

- **@gravity-ui/graph** - содержит всю Canvas логику, управление состоянием графа, рендеринг слоев
- **@gravity-ui/graph-react** - содержит React компоненты, хуки и интеграцию с основным пакетом
- **@gravity-ui/graph-storybook** - демонстрация возможностей и разработка компонентов

### Зависимости

```
@gravity-ui/graph-react → @gravity-ui/graph
@gravity-ui/graph-storybook → @gravity-ui/graph + @gravity-ui/graph-react
```

Такая архитектура исключает циклические зависимости и позволяет каждому пакету развиваться независимо.
