# Published package contract

This suite validates `@gravity-ui/graph` as consumers receive it from npm. Repository source tests cannot detect
missing packed files, incorrect `exports`, broken generated declarations, ESM/CommonJS resolution differences,
incorrect optional-peer metadata, eager React coupling, or runtime duplication of shared dependencies.

> When a public entrypoint, output file, declaration, peer dependency, stylesheet contract, or consumer scenario
> changes, update the corresponding check or fixture and this README in the same change.

## Run

From the repository root:

```sh
pnpm run typecheck
pnpm run test:package-contract
```

Install Chromium once if it is not already available:

```sh
pnpm --filter @gravity-ui/graph exec playwright install chromium
```

Do not run the package-contract suite concurrently with another Graph build or typecheck: the suite deliberately
rebuilds `packages/graph/build`.

To preserve the temporary consumers for inspection, whether the run passes or fails:

```sh
KEEP_PACKAGE_CONTRACT_TMP=1 pnpm run test:package-contract
```

The runner prints the preserved directory. On a CI failure, Playwright reports and test results are copied to
`packages/graph/playwright-report/package-contract/` and `packages/graph/test-results/package-contract/`.

## Structure

```text
tests/package-contract/
├── README.md
├── run.mjs
├── utils.mjs
├── checks/
│   ├── artifact.mjs
│   ├── types.mjs
│   ├── runtime.mjs
│   └── browser.mjs
└── fixtures/
    ├── shared/
    ├── apps/
    │   ├── vanilla/
    │   └── react/
    └── types/
        ├── playwright-bundler/
        ├── node-esm/
        └── node-cjs-playwright/
```

`run.mjs` owns orchestration. It must:

1. build the package exactly once;
2. create exactly one tarball, using the same `pnpm pack --out ... --json` call for both its file list and archive;
3. create isolated vanilla and React consumers from that tarball;
4. install each consumer exactly once;
5. pass the same tarball and consumer directories to every check;
6. derive generated consumers' `packageManager` from the workspace manifest;
7. clean temporary files, or preserve them when requested.

Checks must not build, pack, or install independently. Splitting checks by goal must not turn the suite into several
package pipelines.

`checks/` contains package policy and executable assertions. `fixtures/` contains only source files that represent
external consumers: TypeScript inputs, tsconfigs, application code, HTML, CSS, Playwright scenarios, and their server
configuration. Fixtures must import only documented package specifiers such as `@gravity-ui/graph`,
`@gravity-ui/graph/react`, `@gravity-ui/graph/playwright`, and `@gravity-ui/graph/styles.css`; they must never reach into
repository source or `build/` directly.

The entire fixture tree is copied into each temporary consumer to keep shared relative paths stable. The runner executes
these purpose-specific fixtures:

- vanilla: `apps/vanilla`, `types/playwright-bundler`, and `types/node-cjs-playwright`;
- React: `apps/react` and `types/node-esm`;
- both applications reuse `shared` browser and TypeScript configuration.

The vanilla consumer intentionally contains neither React nor React types.

## Responsibility boundary

This suite answers one question: **can an external project install the packed package and use every documented public
entrypoint in its supported module and browser environments?**

It is not a second functional E2E suite:

- package contract owns tarball contents, package metadata, dependency isolation, declaration resolution, native module
  loading, browser bundling, and one installed-package smoke scenario per browser-facing integration;
- `apps/e2e` owns graph and Playwright page-object behavior such as selection, clicks, drag and drop, connections, camera
  controls, error states, and interaction edge cases;
- Storybook owns representative component examples and compatibility with the repository's React/Webpack development
  environment.

Add a browser assertion here only when the failure could be caused specifically by packing, installing, resolving, or
bundling the public package. If the same assertion would be equally useful against repository code, it normally belongs
in `apps/e2e` instead.

## What is checked

### Artifact

`checks/artifact.mjs` protects the published archive:

- a stale sentinel placed in `build/` is removed by the production build;
- the production build rejects accidentally bundled npm dependencies;
- the packed file list stays within a bounded public allowlist and excludes sources, tests, stories, configs, and
  lockfiles;
- required root, ESM, CommonJS, declaration, stylesheet, and documentation files are present;
- the installed manifest has the expected package entrypoints, `files`, `exports`, `typesVersions`, and optional peer
  metadata;
- the private scheduler remains a build-only workspace dependency, its implementation is inlined into generated
  JavaScript, its package specifier is absent from JavaScript and declarations, and it is neither exposed as a runtime
  dependency nor installed in isolated consumers;
- published CSS contains the vanilla canvas, React canvas, block, anchor, and devtools selectors;
- `publint --strict` accepts the exact tarball installed by the consumers.

This catches stale output, missing release artifacts, repository-only files leaking into npm, broken export targets, and
unreviewed package metadata changes.

### Types

`checks/types.mjs` checks declarations from the packed or installed package with `strict: true`, `skipLibCheck: false`,
and `noEmit: true`:

- ATTW checks `.` and `./react` with the `esm-only` profile;
- ATTW checks `./playwright` with the `node16` profile for both ESM and CommonJS;
- the vanilla and React applications type-check with Bundler resolution;
- `types/playwright-bundler` verifies that `GraphPO.evaluate` receives the public `Graph`, block and connection state
  methods return public types rather than `any`, and `GraphPoint` and `clickAt` remain usable;
- `types/node-esm` imports `Graph`, the public scheduler contracts, `GraphCanvas`, and `useElk` through Node16 ESM
  resolution;
- `types/node-cjs-playwright` imports `GraphPO` and `GraphCameraState` through Node16 CommonJS resolution.

“Node16” names TypeScript's module-resolution semantics here; it does not mean the suite executes on Node.js 16.

The Playwright Bundler fixture is deliberately reused by `scripts/check-playwright-consumer-types.mjs` during
`pnpm run typecheck`, where it checks local generated declarations before the slower installed-consumer suite. Keep both
callers pointed at the same fixture.

### Runtime

`checks/runtime.mjs` runs Node against the installed package:

- ESM imports expose `Graph`, `ESchedulerPriority`, `schedule`, `debounce`, `throttle`, `GraphCanvas`, and `GraphPO` from
  their documented entrypoints;
- CommonJS `require("@gravity-ui/graph/playwright")` exposes `GraphPO`;
- the vanilla consumer cannot resolve React, proving the core and Playwright entrypoints do not require it eagerly;
- a consumer-side `@preact/signals-core` effect observes a Graph signal update exactly once after its initial run.

These probes catch invalid conditional exports, ESM/CJS loader failures, accidental React coupling, and a bundled or
otherwise disconnected signals runtime.

### Browser

`checks/browser.mjs` bundles the installed vanilla and React applications with esbuild, including the public stylesheet,
then runs a deliberately small Chromium smoke test against each one. Detailed interaction behavior remains in
`apps/e2e`.

The vanilla scenario covers:

- bundling and loading the installed `.` and `./playwright` entrypoints;
- `GraphPO.waitForReady` against an application-owned wrapper;
- rendering the canvas with the public stylesheet applied.

The React scenario covers:

- bundling and loading the installed `.` and `./react` entrypoints;
- ready-state propagation through `GraphCanvas`, `useGraph`, and `useGraphEvent`;
- rendered `GraphBlock` content and the React canvas stylesheet;
- use of the installed `./playwright` entrypoint with the React application.

## Maintenance map

| Change                                                   | Required updates                                                                                                                                                                                       |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Add, remove, or rename a public subpath                  | Update the build, manifest, artifact export/file contract, ATTW entrypoints, native import probe, and at least one relevant type fixture. Add a browser fixture when the entrypoint is browser-facing. |
| Change emitted files, chunks, declarations, docs, or CSS | Update the artifact allowlist and required-file set deliberately. Do not broaden patterns merely to make an unexpected file pass.                                                                      |
| Change public TypeScript APIs                            | Update the narrow fixture that represents that consumer. Preserve `skipLibCheck: false` and exact anti-`any` assertions.                                                                               |
| Change ESM/CJS conditions or module support              | Update ATTW profiles, the `.mts` or `.cts` fixture, and the matching native `import` or `require` probe.                                                                                               |
| Change dependencies or optional peers                    | Update manifest assertions and generated consumer manifests. Add or update an absence/interoperability probe when a dependency must remain optional or singleton-like.                                 |
| Change public styles or required selectors               | Update the CSS artifact assertions, the consuming application, and its browser assertion together.                                                                                                     |
| Change Playwright page-object types or behavior          | Update `types/playwright-bundler` for the public type contract and `apps/e2e` for behavior. Change the package browser smoke only when the installed-package integration itself changes.               |
| Move or rename fixtures                                  | Update their check registration, consumer paths, server/config paths, and `scripts/check-playwright-consumer-types.mjs` when the shared Playwright type fixture moves.                                 |
| Add a new goal                                           | Add a focused check and the smallest representative fixture, but continue using the existing build, tarball, and installed consumers whenever possible.                                                |

Do not commit generated consumer manifests, lockfiles, `node_modules`, bundles, reports, or temporary projects.
