# Public package contract

This suite validates the exact `@gravity-ui/graph`, `@gravity-ui/graph-react`, `@gravity-ui/graph-minimap`, and `@gravity-ui/graph-devtools` tarballs that an external application
installs. It owns package metadata, generated declarations, dependency isolation, native imports, and browser bundling.
Detailed graph behavior remains in `apps/e2e`.

## Run

From the repository root:

```sh
pnpm run test:package-contract
```

Install Chromium once with `pnpm exec playwright install chromium`. Do not run the suite concurrently with another
package build or typecheck: it deliberately cleans and rebuilds all four packages. Set `KEEP_PACKAGE_CONTRACT_TMP=1` to retain
the isolated consumers. With `CI=1`, failed browser reports are copied to the root `playwright-report/package-contract`
and `test-results/package-contract` directories.

## Structure and ownership

`run.mjs` builds and packs each public package once, then installs separate vanilla, React, minimap, and DevTools consumers. Every
check uses those same artifacts. It resolves workspace tool versions for the generated manifests so the test does not
silently select a newer React, TypeScript, or Playwright release.

- `checks/artifact.mjs` verifies clean output, exact package names and versions, metadata, bounded file lists, styles, and
  private scheduler isolation. `publint --strict` checks all tarballs.
- `checks/types.mjs` checks all ESM roots with ATTW and the core Playwright entrypoint with the Node16 profile. External
  TypeScript fixtures use Bundler, Node16 ESM, and Node16 CommonJS resolution with `strict: true` and `skipLibCheck: false`.
- `checks/runtime.mjs` imports each package with native Node ESM and requires the Playwright subpath with CommonJS. It
  confirms that React's connection class and the minimap and DevTools base layers share the application's core runtime and that core signals
  interoperate with the consumer's signals runtime.
- `checks/browser.mjs` bundles the installed artifacts and runs vanilla, React, minimap, and DevTools browser scenarios. The React
  fixture uses the public components and both stylesheets; its `useGraph` result must be an instance of the consumer's
  `Graph` class. The portal's render callback verifies that its layer inherits the consumer's `Layer` and receives the
  same graph through context.
  The minimap fixture checks shared layer and graph identity, rendering, dimensions, and click-driven camera navigation.
  The DevTools fixture checks its styles, ruler drawing under pan/zoom, appearance and visibility updates, pointer-driven
  crosshair rendering, and repeated layer removal/addition. Canvas pixels provide evidence of drawing, beyond DOM presence.

The vanilla consumer contains neither React, React DOM, ELK, nor `@gravity-ui/graph-react`. The core manifest and emitted
JavaScript/declarations must not depend on React. The removed `@gravity-ui/graph/react` subpath must fail resolution.
The React package declares core and React as required peers; core has no dependency on the React package. The shared
production builder rejects bundled external dependencies and source imports outside the owning package, except for the
explicitly inlined private scheduler in core.

Core styles own canvas layers; React styles own `.graph-wrapper`, `.graph-block-container`, and `.graph-block-anchor`.
DevTools styles own `.devtools-ruler-bg` and its horizontal/vertical variants. Each stylesheet excludes the other packages' selectors.
Minimap retains its injected styles and has no stylesheet export. Its isolated consumer cannot resolve React, React DOM,
ELK, or the React package. Core must not export `MiniMapLayer`, ship its declarations, or depend on the minimap package.
DevTools also has core as its only required peer and no runtime dependencies. Its isolated consumer must not resolve
React. Core must not export DevTools symbols, ship its code/declarations/styles, or depend on the DevTools package.

## Fixtures

`fixtures/apps/vanilla`, `fixtures/apps/react`, `fixtures/apps/minimap`, and `fixtures/apps/devtools` represent external applications and import only documented package
entrypoints. `fixtures/types/playwright-bundler` is also reused by core's fast declaration check during `pnpm run typecheck`.
`fixtures/types/node-esm` checks core and React together; `fixtures/types/node-cjs-playwright` checks the CommonJS contract.
`fixtures/types/minimap-node-esm` checks minimap's public options, context, and compatibility with core's layer API.
`fixtures/types/devtools-node-esm` checks DevTools defaults, props, and compatibility with core's layer API.
The shared fixture tree is copied into each consumer so relative paths remain stable.

## Preserving a validated artifact

`PACKAGE_CONTRACT_TARBALL_PATH` is an output path for the package whose command is invoked:

```sh
PACKAGE_CONTRACT_TARBALL_PATH=/absolute/path/graph.tgz pnpm --filter @gravity-ui/graph run test:package-contract
PACKAGE_CONTRACT_TARBALL_PATH=/absolute/path/graph-react.tgz pnpm --filter @gravity-ui/graph-react run test:package-contract
PACKAGE_CONTRACT_TARBALL_PATH=/absolute/path/graph-minimap.tgz pnpm --filter @gravity-ui/graph-minimap run test:package-contract
PACKAGE_CONTRACT_TARBALL_PATH=/absolute/path/graph-devtools.tgz pnpm --filter @gravity-ui/graph-devtools run test:package-contract
```

All commands validate the four packages. The requested tarball remains after temporary consumers are removed. The
release process must publish that validated file. When a dependency tarball is supplied through
`PACKAGE_CONTRACT_WORKSPACE_TARBALLS` as `@gravity-ui/graph`, the suite installs that same core artifact instead of repacking it.

When changing an entrypoint, dependency, declaration, stylesheet, or packed file, update its assertions and the relevant
consumer fixture together. Do not broaden an allowlist merely to make an unexpected artifact pass.
