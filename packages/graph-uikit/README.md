# @gravity-ui/graph-uikit

Kit for building `@gravity-ui/graph` graphs inside `@gravity-ui/uikit` applications: theme-aware colors, uikit typography on canvas, uikit-styled blocks and connections on every zoom level, tooltips and a context menu.

This package is being developed on the unpublished v2 branch. Use it with the matching v2 core build.

Render the graph inside uikit `ThemeProvider` (global or `scoped`) and import the uikit styles: the kit reads colors and typography from uikit CSS variables. Without them it warns once and leaves the graph colors unchanged.

```sh
npm install @gravity-ui/graph @gravity-ui/graph-react @gravity-ui/graph-connection-editing @gravity-ui/graph-uikit @gravity-ui/uikit
```

```tsx
import { GraphContextMenu, GraphTooltip, UikitGraphCanvas, useUikitGraph } from "@gravity-ui/graph-uikit";
import { ThemeProvider } from "@gravity-ui/uikit";

import "@gravity-ui/uikit/styles/styles.css";
import "@gravity-ui/graph/styles.css";
import "@gravity-ui/graph-react/styles.css";
import "@gravity-ui/graph-uikit/styles.css";

function App() {
  const { graph, setEntities, start } = useUikitGraph({ mode: "view" }); // or "edit"
  // setEntities({ blocks, connections }); start();
  return (
    <ThemeProvider theme="light">
      <UikitGraphCanvas graph={graph}>
        <GraphTooltip content={(entity) => (entity.kind === "block" ? entity.id : null)} />
        <GraphContextMenu items={(entity) => [{ text: "Inspect", action: () => console.log(entity) }]} />
      </UikitGraphCanvas>
    </ThemeProvider>
  );
}
```

## What you get

- **Theme.** Graph colors follow the active uikit theme, including a scoped `ThemeProvider`. The mapping is `UIKIT_GRAPH_TOKENS` (see [Theme tokens](#theme-tokens)). Pass `colors` to `useUikitGraph` to override single values, or `tokens` to read other uikit variables.
- **Blocks.** `UikitBlock` (canvas) and `UikitGraphBlock` (React, uikit `Box`) share one look: radius, borders, hover, selection and statuses through `block.meta.theme` (`info`, `success`, `warning`, `danger`, `utility`). `block.meta.description` is shown under the name.
- **Custom blocks.** Extend `UikitBlock` and override `renderContent(ctx, rect, level)`. Register the class with `useUikitGraph({ blockComponents })`. Pass React content as `UikitGraphBlock` children. `useUikitGraph` registers `UikitBlock` as `Block` only: a block whose `is` is not registered falls back to core's `Block`, not to `UikitBlock`, so register every custom `is`.
- **Canvas text.** `renderUikitText(ctx, graph, text, rect, { variant, color, ellipsis, ellipsisLines })` mirrors uikit `<Text>`.
- **Connections.** `UikitConnection` uses uikit line colors, screen-pixel widths and a uikit label.
- **Interactions.**
  - `GraphTooltip` and `GraphContextMenu` work on every zoom level.
  - `useHoveredEntity(graph)` returns the entity under the pointer.
  - In `edit` mode users drag blocks and create connections through `@gravity-ui/graph-connection-editing`: Shift+drag from one block to another connects the blocks; with `settings: { useBlocksAnchors: true }` and anchors on the blocks, drag from one anchor to another.

## Theme tokens

`UIKIT_GRAPH_TOKENS` maps graph colors and the kit palette to uikit CSS variables. The main pairs:

| Graph color                     | uikit token                         |
| ------------------------------- | ----------------------------------- |
| `canvas.layerBackground`        | `--g-color-base-background`         |
| `canvas.belowLayerBackground`   | `--g-color-base-generic-ultralight` |
| `canvas.dots`, `canvas.border`  | `--g-color-line-generic`            |
| `block.background`              | `--g-color-base-float`              |
| `block.border`                  | `--g-color-line-generic`            |
| `block.selectedBorder`          | `--g-color-line-brand`              |
| `block.text`                    | `--g-color-text-primary`            |
| `anchor.background`             | `--g-color-line-generic-solid`      |
| `anchor.selectedBorder`         | `--g-color-line-brand`              |
| `connection.background`         | `--g-color-line-generic-accent`     |
| `connection.selectedBackground` | `--g-color-line-brand`              |
| `connectionLabel.background`    | `--g-color-base-float`              |
| `selection.background`          | `--g-color-base-selection`          |
| `selection.border`              | `--g-color-line-brand`              |

The kit palette adds the block hover border (`--g-color-line-generic-hover`), the connection hover color (`--g-color-line-generic-accent-hover`), canvas text colors (`--g-color-text-<color>`) and block statuses (`--g-color-base-<status>-light` background, `--g-color-line-<status>` border; `success` uses `positive`).

To read other variables, pass a full table as `tokens`. Spread the defaults: they are frozen.

```tsx
import { UIKIT_GRAPH_TOKENS, useUikitGraph } from "@gravity-ui/graph-uikit";
import type { TUikitGraphTokens } from "@gravity-ui/graph-uikit";

// A module constant: the hook re-reads the theme when the table identity changes.
const TOKENS: TUikitGraphTokens = {
  ...UIKIT_GRAPH_TOKENS,
  colors: {
    ...UIKIT_GRAPH_TOKENS.colors,
    canvas: { ...UIKIT_GRAPH_TOKENS.colors.canvas, layerBackground: "--g-color-base-generic" },
  },
};

const { graph } = useUikitGraph({ tokens: TOKENS });
```

`tokens` changes which variables are read and still follows theme switches; `colors` sets fixed values on top of the resolved theme.

## Known limitations

- Canvas text: `wordBreak: "break-all"` behaves like `"break-word"` — a word is broken only when it does not fit a line.
- `@gravity-ui/uikit` declarations import `react-beautiful-dnd` types, but uikit does not depend on a type package for them. An application that type-checks with `skipLibCheck: false` needs them:

  - Preferred: install the type package, `npm install --save-dev @types/react-beautiful-dnd`.
  - Otherwise declare the module in an ambient `.d.ts` file that has no top-level `import` or `export` (with one, the file is a module and `declare module` becomes an augmentation, which fails for a package without types). Do not combine this shim with the type package.

    ```ts
    // react-beautiful-dnd.d.ts
    declare module "react-beautiful-dnd" {
      export type DraggableProvided = unknown;
      export type DroppableProvided = unknown;
    }
    ```

  With `skipLibCheck: true` nothing is needed.

## Core candidates

Code that should move to `@gravity-ui/graph` is tagged in the sources:

```sh
grep -rn "TODO(graph-core)" packages/graph-uikit/src
```
