<!-- e0d0680b-c5a5-42ae-9fa2-7acea6955c43 7dc7524b-d772-45df-a080-01bd7209bb51 -->
# Monorepo Migration Plan

## 1. Создание структуры монорепозитория

### 1.1 Создать packages директорию и настроить workspaces

Создать корневую структуру:

```
packages/
├── graph/         # @gravity-ui/graph (основная библиотека: primitives, core, devtools, minimap)
├── react/         # @gravity-ui/graph-react (React компоненты)
└── stories/       # @gravity-ui/graph-stories (внутренний пакет для Storybook)
```

Обновить корневой `package.json`:

- Добавить `"workspaces": ["packages/*"]`
- Сделать пакет приватным: `"private": true`
- Перенести все devDependencies в корень (кроме тех, что специфичны для отдельных пакетов)
- Оставить скрипты для запуска build, test, storybook

### 1.2 Создать package.json для каждого пакета

**@gravity-ui/graph** (`packages/graph/package.json`):

- Версия: 1.4.0
- Dependencies: `@preact/signals-core`, `intersects`, `lodash`, `rbush`
- Exports:
  ```json
  {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    },
    "./devtools": {
      "types": "./dist/plugins/devtools/index.d.ts",
      "default": "./dist/plugins/devtools/index.js"
    },
    "./minimap": {
      "types": "./dist/plugins/minimap/index.d.ts",
      "default": "./dist/plugins/minimap/index.js"
    }
  }
  ```

- Files: `["dist"]`

**@gravity-ui/graph-react** (`packages/react/package.json`):

- Версия: 1.4.0
- Dependencies: `@gravity-ui/graph`
- PeerDependencies: `react@^18.0.0`, `react-dom@^18.0.0`
- Exports:
  ```json
  {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    }
  }
  ```

- Files: `["dist"]`

**@gravity-ui/graph-stories** (`packages/stories/package.json`):

- Private: true
- Dependencies: `@gravity-ui/graph`, `@gravity-ui/graph-react`, и все UI библиотеки для stories

## 2. Миграция кода с сохранением git истории

### 2.1 Создать структуру директорий

Создать директории:

- `packages/graph/src/`
- `packages/react/src/`
- `packages/stories/src/`

### 2.2 Миграция @gravity-ui/graph

Использовать `git mv` для перемещения в `packages/graph/src/`:

**Основные файлы:**

- `src/graph.ts` → `packages/graph/src/graph.ts`
- `src/graphConfig.ts` → `packages/graph/src/graphConfig.ts`
- `src/graphEvents.ts` → `packages/graph/src/graphEvents.ts`
- `src/index.ts` → `packages/graph/src/index.ts`

**Директории:**

- `src/api/` → `packages/graph/src/api/`
- `src/components/` → `packages/graph/src/components/`
- `src/lib/` → `packages/graph/src/lib/`
- `src/plugins/` → `packages/graph/src/plugins/`
- `src/services/` → `packages/graph/src/services/`
- `src/store/` → `packages/graph/src/store/`
- `src/utils/` → `packages/graph/src/utils/`

**Тестовые файлы:**

- `src/graph.test.ts` → `packages/graph/src/graph.test.ts`
- Все остальные `*.test.ts` файлы вместе со своими модулями

### 2.3 Миграция @gravity-ui/graph-react

Использовать `git mv` для перемещения:

- `src/react-components/` → `packages/react/src/`

Содержимое `packages/react/src/` будет включать все файлы из `react-components`:

- GraphCanvas.tsx, GraphLayer.tsx, GraphPortal.tsx
- Block.tsx, Anchor.tsx, BlocksList.tsx
- GraphContext.tsx
- hooks/, elk/, layer/, utils/
- events.ts
- Все CSS файлы

Создать `packages/react/src/index.ts` для реэкспорта всех публичных API.

### 2.4 Миграция stories

Использовать `git mv`:

- `src/stories/` → `packages/stories/src/`

Обновить все импорты в stories на:

- `@gravity-ui/graph` вместо относительных путей к core
- `@gravity-ui/graph-react` вместо относительных путей к react-components

### 2.5 Обновить импорты в коде

**В @gravity-ui/graph:**

- Заменить все импорты с `@/` на относительные пути (например, `@/lib/Component` → `../lib/Component`)
- Убрать path alias `@/*` из tsconfig

**В @gravity-ui/graph-react:**

- Обновить все импорты на `@gravity-ui/graph` для core зависимостей
- Использовать относительные пути для внутренних импортов

## 3. Настройка TypeScript

### 3.1 Создать tsconfig.base.json в корне

Базовая конфигурация с общими настройками:

```json
{
  "compilerOptions": {
    "target": "es2020",
    "module": "esnext",
    "moduleResolution": "node",
    "esModuleInterop": true,
    "experimentalDecorators": true,
    "skipLibCheck": true,
    "jsx": "react",
    "strict": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```

### 3.2 Создать tsconfig.json для каждого пакета

**packages/graph/tsconfig.json:**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "composite": true,
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "exclude": ["src/**/*.test.ts", "src/**/*.spec.ts"]
}
```

**packages/react/tsconfig.json:**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "composite": true,
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "exclude": ["src/**/*.test.ts", "src/**/*.spec.ts"],
  "references": [
    { "path": "../graph" }
  ]
}
```

**packages/stories/tsconfig.json:**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "noEmit": true
  },
  "include": ["src/**/*"],
  "references": [
    { "path": "../graph" },
    { "path": "../react" }
  ]
}
```

### 3.3 Обновить корневой tsconfig.json

```json
{
  "files": [],
  "references": [
    { "path": "./packages/graph" },
    { "path": "./packages/react" },
    { "path": "./packages/stories" }
  ]
}
```

## 4. Настройка сборки с Rollup

### 4.1 Установить необходимые пакеты

Добавить в корневые devDependencies:

```bash
npm install -D rollup @rollup/plugin-typescript @rollup/plugin-node-resolve @rollup/plugin-commonjs rollup-plugin-copy rollup-plugin-postcss
```

### 4.2 Создать rollup.config.mjs

Конфигурация для сборки в ESM формат с поставкой исходников:

```js
import typescript from '@rollup/plugin-typescript';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import copy from 'rollup-plugin-copy';
import postcss from 'rollup-plugin-postcss';

const packageConfigs = [
  {
    name: 'graph',
    input: 'packages/graph/src/index.ts',
    external: ['@preact/signals-core', 'intersects', 'lodash', 'rbush']
  },
  {
    name: 'react',
    input: 'packages/react/src/index.ts',
    external: ['@gravity-ui/graph', 'react', 'react-dom', 'react/jsx-runtime']
  }
];

export default packageConfigs.map(({ name, input, external }) => ({
  input,
  output: {
    dir: `packages/${name}/dist`,
    format: 'esm',
    preserveModules: true,
    preserveModulesRoot: `packages/${name}/src`,
    sourcemap: true
  },
  external: [...external, /node_modules/],
  plugins: [
    resolve(),
    commonjs(),
    typescript({
      tsconfig: `packages/${name}/tsconfig.json`,
      declaration: true,
      declarationDir: `packages/${name}/dist`,
      outDir: `packages/${name}/dist`
    }),
    postcss({
      extract: false,
      modules: false,
      use: ['sass']
    }),
    copy({
      targets: [
        { src: `packages/${name}/src/**/*.css`, dest: `packages/${name}/dist` }
      ],
      flatten: false
    })
  ]
}));
```

### 4.3 Обновить build скрипты в корневом package.json

```json
{
  "scripts": {
    "build": "rollup -c",
    "build:graph": "rollup -c --config-graph",
    "build:react": "rollup -c --config-react",
    "typecheck": "tsc -b",
    "clean": "rm -rf packages/*/dist"
  }
}
```

## 5. Настройка Storybook

### 5.1 Обновить .storybook/main.ts

```ts
import type { StorybookConfig } from "@storybook/react-webpack5";
import type { Options } from "@swc/core";
import path from "path";

const config: StorybookConfig = {
  stories: ["../packages/stories/src/**/*.stories.@(js|jsx|ts|tsx)"],
  
  addons: [
    "@storybook/addon-styling-webpack",
    "@storybook/addon-webpack5-compiler-swc",
    "@storybook/addon-docs"
  ],
  
  framework: {
    name: "@storybook/react-webpack5",
    options: {},
  },
  
  webpackFinal: async (config) => {
    // Aliases для dev-режима (используем исходники)
    config.resolve.alias = {
      ...config.resolve.alias,
      '@gravity-ui/graph': path.resolve(__dirname, '../packages/graph/src'),
      '@gravity-ui/graph-react': path.resolve(__dirname, '../packages/react/src')
    };
    return config;
  },
  
  swc: (config: Options): Options => {
    return { ...config };
  },
  
  docs: {},
  
  core: {
    disableTelemetry: true,
    disableWhatsNewNotifications: true,
  },
  
  typescript: {
    reactDocgen: "react-docgen-typescript",
  },
};

export default config;
```

### 5.2 Для production build Storybook

Production build будет использовать настоящие зависимости из node_modules после сборки пакетов.

## 6. Настройка тестирования

### 6.1 Обновить jest.config.ts

```ts
import type { Config } from 'jest';

const jestConfig: Config = {
  testEnvironment: "jsdom",
  setupFiles: ["<rootDir>/setupJest.js", "jest-canvas-mock"],
  transformIgnorePatterns: [],
  moduleNameMapper: {
    '^@gravity-ui/graph$': '<rootDir>/packages/graph/src',
    '^@gravity-ui/graph-react$': '<rootDir>/packages/react/src',
    '\\.(css|less)$': '<rootDir>/__mocks__/styleMock.js',
  },
  transform: {
    "^.+\\.(t|j)sx?$": "@swc/jest",
  },
};

export default jestConfig;
```

### 6.2 Обновить test скрипты

В корневом package.json:

```json
{
  "scripts": {
    "test": "cross-env NODE_OPTIONS=--experimental-vm-modules jest --passWithNoTests",
    "test:watch": "npm run test -- --watch"
  }
}
```

## 7. Настройка release-please

### 7.1 Создать .github/workflows/release-please.yml

```yaml
name: release-please

on:
  push:
    branches:
      - main

permissions:
  contents: write
  pull-requests: write

jobs:
  release-please:
    runs-on: ubuntu-latest
    steps:
      - uses: googleapis/release-please-action@v4
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          config-file: release-please-config.json
          manifest-file: .release-please-manifest.json
```

### 7.2 Создать release-please-config.json

```json
{
  "packages": {
    "packages/graph": {
      "package-name": "@gravity-ui/graph",
      "release-type": "node",
      "changelog-path": "CHANGELOG.md"
    },
    "packages/react": {
      "package-name": "@gravity-ui/graph-react",
      "release-type": "node",
      "changelog-path": "CHANGELOG.md"
    }
  },
  "release-type": "node",
  "bump-minor-pre-major": true,
  "bump-patch-for-minor-pre-major": false
}
```

### 7.3 Создать .release-please-manifest.json

```json
{
  "packages/graph": "1.4.0",
  "packages/react": "1.4.0"
}
```

### 7.4 Создать .github/workflows/publish.yml

Workflow для публикации пакетов в npm после создания релиза:

```yaml
name: Publish to NPM

on:
  release:
    types: [published]

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - uses: actions/setup-node@v4
        with:
          node-version: '18'
          registry-url: 'https://registry.npmjs.org'
      
      - run: npm ci
      
      - run: npm run build
      
      - name: Publish @gravity-ui/graph
        run: npm publish --access public
        working-directory: packages/graph
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
      
      - name: Publish @gravity-ui/graph-react
        run: npm publish --access public
        working-directory: packages/react
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

## 8. Обновление корневого package.json

Обновить основные поля:

- Добавить `"workspaces": ["packages/*"]`
- `"private": true`
- Обновить scripts для работы с монорепо
- Переместить все devDependencies в корень

Основные scripts:

```json
{
  "scripts": {
    "build": "rollup -c",
    "typecheck": "tsc -b",
    "lint": "eslint \"packages/*/src/**/*.{js,jsx,ts,tsx}\"",
    "test": "cross-env NODE_OPTIONS=--experimental-vm-modules jest --passWithNoTests",
    "storybook": "storybook dev -p 6006",
    "build-storybook": "storybook build",
    "clean": "rm -rf packages/*/dist"
  }
}
```

## 9. Обновление документации

### 9.1 Создать docs/migration-guides/monorepo-migration.md

Документ с инструкциями по миграции для пользователей библиотеки:

- Как обновить импорты
- Новая структура пакетов
- Breaking changes (если есть)

### 9.2 Обновить README.md

Добавить секцию о пакетах:

````markdown
## Packages

This repository is a monorepo containing the following packages:

- `@gravity-ui/graph` - Core graph library with Canvas rendering, state management, and plugins (devtools, minimap)
- `@gravity-ui/graph-react` - React components and hooks for graph integration

### Installation

```bash
# Core library
npm install @gravity-ui/graph

# React integration
npm install @gravity-ui/graph @gravity-ui/graph-react react react-dom
````

### Usage

```tsx
import { Graph } from '@gravity-ui/graph';
import { GraphCanvas } from '@gravity-ui/graph-react';

// DevTools and MiniMap plugins
import { DevToolsLayer } from '@gravity-ui/graph/devtools';
import { MiniMapLayer } from '@gravity-ui/graph/minimap';
```



```

### 9.3 Обновить package.json метаданные

В обоих пакетах обновить:

- `repository.url`
- `repository.directory` (для react: `"packages/react"`)
- `keywords`
- `homepage`
- `bugs.url`

## 10. Обновление конфигурационных файлов

### 10.1 Обновить .gitignore

Добавить:

```

packages/*/dist

packages/*/build

.tsbuildinfo

````

### 10.2 Обновить .eslintrc или eslint.config

Обновить пути для линтинга:

```json
{
  "ignorePatterns": ["packages/*/dist", "packages/*/build", "node_modules"]
}
````

### 10.3 Переместить общие конфиги в корень

- Prettier config остается в корне
- ESLint config остается в корне
- TypeScript configs создаются на уровне пакетов

## 11. Финальные шаги

### 11.1 Установить зависимости

```bash
npm install
```

### 11.2 Тестирование

Последовательно выполнить:

```bash
# Проверка TypeScript
npm run typecheck

# Сборка всех пакетов
npm run build

# Запуск тестов
npm test

# Запуск Storybook
npm run storybook
```

### 11.3 Проверка exports

Создать тестовый проект и проверить все exports:

```ts
// Основной пакет
import { Graph } from '@gravity-ui/graph';
import { DevToolsLayer } from '@gravity-ui/graph/devtools';
import { MiniMapLayer } from '@gravity-ui/graph/minimap';

// React пакет
import { GraphCanvas, useGraph } from '@gravity-ui/graph-react';
```

### 11.4 Коммит изменений

```bash
git add .
git commit -m "feat: migrate to monorepo structure with @gravity-ui/graph and @gravity-ui/graph-react packages"
```

### To-dos

- [ ] Создать структуру packages/ и настроить npm workspaces
- [ ] Создать package.json для всех 7 пакетов с правильными dependencies и exports
- [ ] Переместить код в @gravity-ui/graph-primitives используя git mv
- [ ] Переместить код в @gravity-ui/graph-core используя git mv
- [ ] Переместить код в @gravity-ui/graph-react используя git mv
- [ ] Переместить код в @gravity-ui/graph-devtools используя git mv
- [ ] Переместить код в @gravity-ui/graph-minimap используя git mv
- [ ] Переместить stories в @gravity-ui/graph-stories используя git mv
- [ ] Настроить TypeScript composite projects для всех пакетов
- [ ] Обновить все импорты в коде на новые пути пакетов
- [ ] Настроить Rollup конфигурацию для ESM сборки
- [ ] Настроить Storybook с webpack aliases для dev-режима
- [ ] Обновить Jest конфигурацию для монорепо
- [ ] Настроить release-please GitHub Action и конфигурацию
- [ ] Протестировать полную сборку всех пакетов
- [ ] Создать MIGRATION.md и обновить README.md