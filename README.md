# Gravity Graph monorepo

This repository contains the Gravity UI Graph packages and their development tooling.

## Packages

- [`@gravity-ui/graph`](packages/graph) — the graph editor library, React integration, Playwright page objects,
  documentation, Storybook, and tests.

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
