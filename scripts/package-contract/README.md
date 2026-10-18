# Packed package contract

Validates the exact tarballs that an external application installs: package metadata, packed files, generated
declarations, dependency isolation, native imports and browser bundling. Detailed graph behavior stays in `apps/e2e`.

Each public package owns its contract in `packages/<name>/contract`; this directory holds the shared runner.

## Run

```sh
pnpm run test:package-contract                                  # every package with a contract
pnpm --filter @gravity-ui/graph-react run test:package-contract  # one package
```

Install Chromium once with `pnpm exec playwright install chromium`. Do not run the suite concurrently with another
package build or typecheck: it deliberately cleans and rebuilds the packages it packs. Set `KEEP_PACKAGE_CONTRACT_TMP=1`
to retain the isolated consumers. With `CI=1`, failed browser reports are copied to the root
`playwright-report/package-contract` and `test-results/package-contract` directories.

## How it works

For every tested package, `run.mjs` builds and packs core, the package and its `workspaceDependencies` once, then
creates an isolated consumer that installs those tarballs:

- `checks/artifact.mjs` — clean build output, packed file allowlist, `publint --strict`, installed manifest (name,
  version, entry fields, `exports`, `typesVersions`, core peer), retired private scheduler references, no deep imports
  into core from other packages.
- `checks/types.mjs` — ATTW on the tarball and `tsc` over the package's consumer fixtures.
- `checks/runtime.mjs` — specifiers the consumer must not resolve, then Node ESM/CommonJS probes.
- `checks/browser.mjs` — bundles `contract/app` with esbuild and runs its `*.pw.ts` scenarios in Chromium.
- `shared/` — base tsconfig, styles, asset declarations, Playwright config and static server, copied into every
  consumer next to the package's `contract/` directory.

## Package contract layout

```
packages/<name>/contract/
  contract.config.mjs   # what the runner checks for this package
  app/                  # browser consumer: index.html, app.ts(x), *.pw.ts, tsconfig.json, tsconfig.non-strict.json
  types/<fixture>/      # optional type-only consumers (e.g. Node16 resolution)
```

Each consumer mirrors the repository layout (`scripts/package-contract/shared` and `packages/<name>/contract`), so
the same relative paths work in the repository and in the consumer: `app/` references
`../../../../scripts/package-contract/shared/`, `types/<fixture>/` one level more. Fixtures import only documented
package entrypoints. `typecheckConfigs` and `entryPoint` are relative to the package's `contract/` directory.

`contract.config.mjs` exports an object with:

| Field                             | Meaning                                                                                       |
| --------------------------------- | --------------------------------------------------------------------------------------------- |
| `exports`, `typesVersions`        | Expected installed manifest fields                                                            |
| `styles`                          | `false` for a package without `build/styles.css` (default: the stylesheet is required)        |
| `packedFiles`                     | Extra `runtimeFiles`, `allowedPatterns`, `forbiddenPatterns`, `requiredFiles` for the tarball |
| `attw`                            | `[{ entrypoint, profile }]`, default `[{ entrypoint: ".", profile: "esm-only" }]`             |
| `workspaceDependencies`           | Other package directories to pack and install (core is always installed)                      |
| `dependencies`, `devDependencies` | External packages for the consumer; versions come from the workspace                          |
| `mustNotResolve`                  | Specifiers the isolated consumer must not resolve                                             |
| `probes`                          | `[{ label, type?: "module" \| "commonjs", source }]` evaluated with Node in the consumer      |
| `typecheckConfigs`                | Consumer-relative tsconfig paths compiled with `tsc --noEmit`                                 |
| `entryPoint`                      | Browser bundle entry, e.g. `contract/app/app.ts`                                              |
| `checkArtifact(context)`          | Package-specific assertions on the installed package                                          |

A new public package adds its own `contract/` directory and a `test:package-contract` script
(`node ../../scripts/package-contract/run.mjs <directory>`); the runner discovers it automatically. Core's script runs
without arguments, so a core release also checks every other package against the new core tarball.

## Preserving a validated artifact

`PACKAGE_CONTRACT_TARBALL_PATH` is the output path for the requested package (core when none is given; at most one package may be requested):

```sh
PACKAGE_CONTRACT_TARBALL_PATH=/absolute/path/graph.tgz pnpm --filter @gravity-ui/graph run test:package-contract
PACKAGE_CONTRACT_TARBALL_PATH=/absolute/path/graph-react.tgz pnpm --filter @gravity-ui/graph-react run test:package-contract
```

The requested tarball remains after temporary consumers are removed; the release process must publish that validated
file. `PACKAGE_CONTRACT_WORKSPACE_TARBALLS` maps other package names to prebuilt tarballs, which consumers install
instead of repacked ones.

When changing an entrypoint, dependency, declaration, stylesheet, or packed file, update the package's
`contract.config.mjs` and fixtures together. Do not broaden an allowlist merely to make an unexpected artifact pass.
