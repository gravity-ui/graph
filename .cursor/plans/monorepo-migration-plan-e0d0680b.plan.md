<!-- e0d0680b-c5a5-42ae-9fa2-7acea6955c43 15400bd4-546b-41d1-a398-71e9e1b7f7d3 -->
# CDN Bundle Support Plan

**Предварительное условие:** Этот план выполняется ПОСЛЕ завершения основной монорепо миграции.

## 1. Обновить Rollup конфигурацию

### 1.1 Установить дополнительные зависимости

```bash
npm install -D @rollup/plugin-terser
```

### 1.2 Добавить UMD бандлы в rollup.config.mjs

Дополнить существующую конфигурацию:

```js
import terser from '@rollup/plugin-terser';

// ... существующие ESM конфиги ...

// UMD бандлы для @gravity-ui/graph (для использования через CDN)
const graphBundleConfigs = [
  // Обычный бандл
  {
    input: 'packages/graph/src/index.ts',
    output: {
      file: 'packages/graph/dist/graph.js',
      format: 'umd',
      name: 'GravityGraph',
      sourcemap: true,
      globals: {
        'lodash': '_',
        '@preact/signals-core': 'preactSignals',
        'intersects': 'intersects',
        'rbush': 'rbush'
      }
    },
    external: ['lodash', '@preact/signals-core', 'intersects', 'rbush'],
    plugins: [
      resolve(),
      commonjs(),
      typescript({
        tsconfig: 'packages/graph/tsconfig.json',
        declaration: false
      }),
      postcss({
        extract: 'graph.css',
        minimize: false
      })
    ]
  },
  // Минифицированный бандл
  {
    input: 'packages/graph/src/index.ts',
    output: {
      file: 'packages/graph/dist/graph.min.js',
      format: 'umd',
      name: 'GravityGraph',
      sourcemap: true,
      globals: {
        'lodash': '_',
        '@preact/signals-core': 'preactSignals',
        'intersects': 'intersects',
        'rbush': 'rbush'
      }
    },
    external: ['lodash', '@preact/signals-core', 'intersects', 'rbush'],
    plugins: [
      resolve(),
      commonjs(),
      typescript({
        tsconfig: 'packages/graph/tsconfig.json',
        declaration: false
      }),
      postcss({
        extract: 'graph.min.css',
        minimize: true
      }),
      terser({
        compress: {
          drop_console: false, // Оставить console для debugging
          drop_debugger: true
        },
        format: {
          comments: /^!/  // Сохранить лицензионные комментарии
        }
      })
    ]
  }
];

export default [...esmConfigs, ...graphBundleConfigs];
```

## 2. Обновить package.json для @gravity-ui/graph

### 2.1 Добавить CDN поля

В `packages/graph/package.json`:

```json
{
  "name": "@gravity-ui/graph",
  "version": "1.4.0",
  "main": "./dist/index.js",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "unpkg": "./dist/graph.min.js",
  "jsdelivr": "./dist/graph.min.js",
  "exports": {
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
  },
  "files": [
    "dist",
    "!dist/**/*.test.*"
  ]
}
```

### 2.2 Обновить build скрипты

В корневом `package.json` обновить build команду:

```json
{
  "scripts": {
    "build": "npm run build:graph && npm run build:react",
    "build:graph": "rollup -c",
    "build:graph:esm": "rollup -c --config-esm",
    "build:graph:bundles": "rollup -c --config-bundles"
  }
}
```

## 3. Добавить лицензионный комментарий

### 3.1 Создать banner для UMD бандлов

В `rollup.config.mjs` добавить banner:

```js
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, 'packages/graph/package.json'), 'utf-8'));

const banner = `/*!
 * @gravity-ui/graph v${pkg.version}
 * ${pkg.homepage}
 * 
 * Copyright (c) ${new Date().getFullYear()} Yandex LLC
 * Licensed under ${pkg.license}
 */`;

// Добавить в output каждого UMD бандла:
output: {
  // ... existing options
  banner
}
```

## 4. Документация для CDN использования

### 4.1 Обновить README.md

Добавить секцию о CDN использовании:

```markdown
## CDN Usage

You can use @gravity-ui/graph directly in the browser via CDN:

### Using unpkg

\`\`\`html
<!DOCTYPE html>
<html>
<head>
  <!-- CSS -->
  <link rel="stylesheet" href="https://unpkg.com/@gravity-ui/graph@latest/dist/graph.min.css">
</head>
<body>
  <div id="graph-container" style="width: 100%; height: 600px;"></div>

  <!-- Dependencies -->
  <script src="https://unpkg.com/lodash@4/lodash.min.js"></script>
  <script src="https://unpkg.com/@preact/signals-core@latest/dist/signals-core.min.js"></script>
  <script src="https://unpkg.com/rbush@latest/rbush.min.js"></script>
  
  <!-- @gravity-ui/graph -->
  <script src="https://unpkg.com/@gravity-ui/graph@latest/dist/graph.min.js"></script>
  
  <script>
    const { Graph } = window.GravityGraph;
    
    const container = document.getElementById('graph-container');
    const graph = new Graph(container, {
      // your config
    });
    
    // Use the graph
    graph.api.setBlocks([...]);
  </script>
</body>
</html>
\`\`\`

### Using jsDelivr

\`\`\`html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@gravity-ui/graph@latest/dist/graph.min.css">
<script src="https://cdn.jsdelivr.net/npm/@gravity-ui/graph@latest/dist/graph.min.js"></script>
\`\`\`

### Specific Version

Always specify a version for production:

\`\`\`html
<script src="https://unpkg.com/@gravity-ui/graph@1.4.0/dist/graph.min.js"></script>
\`\`\`

### Available Global

When loaded via CDN, the library is available as `window.GravityGraph` with all exports:

\`\`\`javascript
const { 
  Graph,
  ECameraScaleLevel,
  ECanChangeBlockGeometry,
  // ... all other exports
} = window.GravityGraph;
\`\`\`
```

### 4.2 Создать примеры в docs/examples/

Создать `docs/examples/cdn-basic.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>@gravity-ui/graph CDN Example</title>
  <link rel="stylesheet" href="https://unpkg.com/@gravity-ui/graph@latest/dist/graph.min.css">
  <style>
    body { margin: 0; padding: 20px; font-family: sans-serif; }
    #graph { width: 100%; height: 600px; border: 1px solid #ccc; }
  </style>
</head>
<body>
  <h1>@gravity-ui/graph CDN Example</h1>
  <div id="graph"></div>

  <!-- Dependencies -->
  <script src="https://unpkg.com/lodash@4/lodash.min.js"></script>
  <script src="https://unpkg.com/@preact/signals-core@latest/dist/signals-core.min.js"></script>
  <script src="https://unpkg.com/rbush@latest/rbush.min.js"></script>
  
  <!-- Graph Library -->
  <script src="https://unpkg.com/@gravity-ui/graph@latest/dist/graph.min.js"></script>
  
  <script>
    const { Graph } = window.GravityGraph;
    
    const graph = new Graph(document.getElementById('graph'), {
      settings: {
        canDragCamera: true,
        canZoomCamera: true
      }
    });

    // Add some blocks
    graph.api.setBlocks([
      { id: '1', x: 100, y: 100, width: 200, height: 100 },
      { id: '2', x: 400, y: 200, width: 200, height: 100 }
    ]);

    // Add connection
    graph.api.setConnections([
      { sourceBlockId: '1', targetBlockId: '2' }
    ]);

    graph.start();
  </script>
</body>
</html>
```

## 5. Тестирование CDN бандлов

### 5.1 Создать локальный тест

Создать `test-cdn.html` в корне проекта:

```html
<!DOCTYPE html>
<html>
<head>
  <link rel="stylesheet" href="packages/graph/dist/graph.min.css">
</head>
<body>
  <div id="test" style="width: 800px; height: 600px;"></div>
  
  <script src="https://unpkg.com/lodash@4/lodash.min.js"></script>
  <script src="https://unpkg.com/@preact/signals-core@latest/dist/signals-core.min.js"></script>
  <script src="https://unpkg.com/rbush@latest/rbush.min.js"></script>
  <script src="packages/graph/dist/graph.js"></script>
  
  <script>
    console.log('GravityGraph:', window.GravityGraph);
    const { Graph } = window.GravityGraph;
    const graph = new Graph(document.getElementById('test'), {});
    graph.start();
    console.log('Graph initialized successfully!');
  </script>
</body>
</html>
```

### 5.2 Запустить локальный сервер для проверки

```bash
# После сборки
npm run build

# Запустить простой HTTP сервер
npx serve .
# или
python3 -m http.server 8000
```

Открыть `http://localhost:8000/test-cdn.html`

## 6. Обновить size-limit конфигурацию

В корневом `package.json` добавить проверку размера UMD бандлов:

```json
{
  "size-limit": [
    {
      "path": "packages/graph/dist/index.js",
      "import": "{ Graph }",
      "limit": "150 KB",
      "gzip": true
    },
    {
      "path": "packages/graph/dist/graph.min.js",
      "limit": "200 KB",
      "gzip": true
    },
    {
      "path": "packages/react/dist/index.js",
      "import": "{ GraphCanvas }",
      "limit": "50 KB",
      "gzip": true
    }
  ]
}
```

## 7. CI/CD проверки

### 7.1 Добавить проверку наличия бандлов

В `.github/workflows/publish.yml` добавить перед публикацией:

```yaml
- name: Verify bundles exist
  run: |
    test -f packages/graph/dist/graph.js || (echo "graph.js not found" && exit 1)
    test -f packages/graph/dist/graph.min.js || (echo "graph.min.js not found" && exit 1)
    test -f packages/graph/dist/graph.css || (echo "graph.css not found" && exit 1)
    test -f packages/graph/dist/graph.min.css || (echo "graph.min.css not found" && exit 1)
```

## 8. Проверочный список

После реализации проверить:

- [ ] UMD бандлы собираются без ошибок
- [ ] Размер минифицированного бандла приемлемый (< 200KB gzipped)
- [ ] CSS правильно экстрагируется в отдельные файлы
- [ ] Source maps генерируются
- [ ] Лицензионные комментарии присутствуют
- [ ] `window.GravityGraph` доступен в браузере
- [ ] Все публичные API доступны через global объект
- [ ] Dependencies правильно externalized
- [ ] Локальный test-cdn.html работает
- [ ] unpkg и jsdelivr поля добавлены в package.json
- [ ] Документация обновлена
- [ ] Примеры созданы и работают

### To-dos

- [ ] Создать структуру packages/ (graph, react, stories) и настроить npm workspaces в корневом package.json
- [ ] Создать package.json для 3 пакетов с правильными dependencies, peerDependencies и exports
- [ ] Создать index файлы для плагинов (devtools/index.ts, minimap/index.ts) и обновить plugins/index.ts
- [ ] Переместить основной код (api, components, lib, plugins, services, store, utils) в packages/graph/src/ используя git mv
- [ ] Переместить react-components в packages/react/src/ используя git mv
- [ ] Переместить stories в packages/stories/src/ используя git mv
- [ ] Создать tsconfig.base.json и tsconfig.json для каждого пакета с composite projects
- [ ] Обновить импорты в react пакете на @gravity-ui/graph
- [ ] Обновить импорты в stories на @gravity-ui/graph и @gravity-ui/graph-react
- [ ] Установить Rollup зависимости и создать rollup.config.mjs для ESM сборки с preserveModules
- [ ] Обновить .storybook/main.ts с webpack aliases для dev-режима
- [ ] Обновить jest.config.ts с moduleNameMapper для пакетов
- [ ] Создать GitHub workflows и конфигурацию release-please
- [ ] Обновить корневой package.json: добавить scripts (dev, build, typecheck, watch)
- [ ] Создать DEVELOPMENT.md с полным dev workflow guide
- [ ] Обновить README.md с информацией о монорепо структуре
- [ ] Обновить .gitignore для packages/*/dist
- [ ] Протестировать: typecheck, build, test, storybook
- [ ] Проверить exports в тестовом проекте