# Gravity Graph monorepo

This repository contains the Gravity UI Graph packages and their development tooling.

## Packages

- [`@gravity-ui/graph`](packages/graph) — the framework-independent graph editor, layouts, plugins, and public Playwright page objects.
- [`@gravity-ui/graph-react`](packages/graph-react) — React components, hooks, and their styles, depending on the core public API.
- [`@gravity-ui/graph-minimap`](packages/graph-minimap) — optional Canvas minimap with navigation, depending on the core public API.
- [`@gravity-ui/graph-scheduler`](packages/scheduler) — private scheduling implementation inlined into the core build.

Shared build tooling lives in `scripts/`; `tests/package-contract` installs the public tarballs into isolated vanilla, React, and minimap projects.

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
