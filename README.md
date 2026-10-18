# Gravity Graph monorepo

This repository contains the Gravity UI Graph packages and their development tooling.

## Packages

- [`@gravity-ui/graph`](packages/graph) — the framework-independent graph editor, layouts, and plugins.
- [`@gravity-ui/graph-react`](packages/graph-react) — React components, hooks, and their styles, depending on the core public API.
- [`@gravity-ui/graph-minimap`](packages/graph-minimap) — optional Canvas minimap with navigation, depending on the core public API.
- [`@gravity-ui/graph-devtools`](packages/graph-devtools) — optional rulers, cursor crosshair, and their styles, depending on the core public API.
- [`@gravity-ui/graph-duplicate-block`](packages/graph-duplicate-block) — optional Alt+drag block duplication layer, depending on the core public API.
- [`@gravity-ui/graph-playwright`](packages/graph-playwright) — Playwright page objects for testing graph applications, using core types only.

Shared build tooling lives in `scripts/`. Each public package keeps its packed-package contract in `packages/<name>/contract`; `scripts/package-contract` installs the tarballs into an isolated consumer per package.

## Applications

- [`@gravity-ui/graph-storybook`](apps/storybook) — private Storybook consumer of the published package entrypoints.
- [`@gravity-ui/graph-e2e`](apps/e2e) — private Playwright suite and repository-only test fixtures.

## Development

Install dependencies from the repository root:

```sh
pnpm install --frozen-lockfile
```

The existing root commands remain the primary developer interface and delegate to the relevant workspace package:

```sh
pnpm run lint
pnpm run typecheck
pnpm run test
pnpm run build-storybook
pnpm run test:e2e
pnpm run test:package-contract
```

See the [v1 to v2 transition guide](packages/graph/docs/v1-v2-transition.md) for the temporary branch and release
setup.

Application upgrades are documented in the [v1 to v2 migration guide](packages/graph/docs/migration-guides/v1-to-v2.md).
