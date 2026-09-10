# Public package contract

This suite validates the exact `@gravity-ui/graph` and `@gravity-ui/graph-react` tarballs that an external application
installs. It owns package metadata, generated declarations, dependency isolation, native imports, and browser bundling.
Detailed graph behavior remains in `apps/e2e`.

## Run

From the repository root:

```sh
pnpm run test:package-contract
```

Install Chromium once with `pnpm exec playwright install chromium`. Do not run the suite concurrently with another
package build or typecheck: it deliberately cleans and rebuilds both packages. Set `KEEP_PACKAGE_CONTRACT_TMP=1` to retain
the isolated consumers. With `CI=1`, failed browser reports are copied to the root `playwright-report/package-contract`
and `test-results/package-contract` directories.

## Structure and ownership

`run.mjs` builds and packs each public package once, then installs one vanilla consumer and one React consumer. Every
check uses those same artifacts. It resolves workspace tool versions for the generated manifests so the test does not
silently select a newer React, TypeScript, or Playwright release.

- `checks/artifact.mjs` verifies clean output, exact package names and versions, metadata, bounded file lists, styles, and
  private scheduler isolation. `publint --strict` checks both tarballs.
- `checks/types.mjs` checks both ESM roots with ATTW and the core Playwright entrypoint with the Node16 profile. External
  TypeScript fixtures use Bundler, Node16 ESM, and Node16 CommonJS resolution with `strict: true` and `skipLibCheck: false`.
- `checks/runtime.mjs` imports each package with native Node ESM and requires the Playwright subpath with CommonJS. It
  confirms that React's connection class shares the application's core runtime and that core signals
  interoperate with the consumer's signals runtime.
- `checks/browser.mjs` bundles the installed artifacts and runs one vanilla and one React smoke scenario. The React
  fixture uses the public components and both stylesheets; its `useGraph` result must be an instance of the consumer's
  `Graph` class. The portal's render callback verifies that its layer inherits the consumer's `Layer` and receives the
  same graph through context.

The vanilla consumer contains neither React, React DOM, ELK, nor `@gravity-ui/graph-react`. The core manifest and emitted
JavaScript/declarations must not depend on React. The removed `@gravity-ui/graph/react` subpath must fail resolution.
The React package declares core and React as required peers; core has no dependency on the React package. The shared
production builder rejects bundled external dependencies and source imports outside the owning package, except for the
explicitly inlined private scheduler in core.

Core styles own canvas layers and devtools; React styles own `.graph-wrapper`, `.graph-block-container`, and
`.graph-block-anchor`. Each package's tarball must contain its own stylesheet and exclude the other's selectors.

## Fixtures

`fixtures/apps/vanilla` and `fixtures/apps/react` represent external applications and import only documented package
entrypoints. `fixtures/types/playwright-bundler` is also reused by core's fast declaration check during `pnpm run typecheck`.
`fixtures/types/node-esm` checks core and React together; `fixtures/types/node-cjs-playwright` checks the CommonJS contract.
The shared fixture tree is copied into each consumer so relative paths remain stable.

## Preserving a validated artifact

`PACKAGE_CONTRACT_TARBALL_PATH` is an output path for the package whose command is invoked:

```sh
PACKAGE_CONTRACT_TARBALL_PATH=/absolute/path/graph.tgz pnpm --filter @gravity-ui/graph run test:package-contract
PACKAGE_CONTRACT_TARBALL_PATH=/absolute/path/graph-react.tgz pnpm --filter @gravity-ui/graph-react run test:package-contract
```

Both commands validate the package pair. The requested tarball remains after temporary consumers are removed. The
release process must publish that validated file. When a dependency tarball is supplied through
`PACKAGE_CONTRACT_WORKSPACE_TARBALLS`, the suite installs that same artifact instead of repacking the dependency.

When changing an entrypoint, dependency, declaration, stylesheet, or packed file, update its assertions and the relevant
consumer fixture together. Do not broaden an allowlist merely to make an unexpected artifact pass.
