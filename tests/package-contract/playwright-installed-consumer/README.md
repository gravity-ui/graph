# Installed consumer contract

This check validates the package boundary that repository-local E2E tests cannot cover. It builds and packs
`@gravity-ui/graph`, installs the same tarball into isolated temporary vanilla and React projects, bundles one Graph
page in each project, and runs Playwright through the public `@gravity-ui/graph/playwright` entry point.

The v1 TypeScript build emits extensionless ESM imports intended for bundlers, while Playwright loads this entry
directly in Node.js. `build:playwright-runtime` therefore rewrites only `build/playwright/index.js` as a standalone
CommonJS bundle; this test guards that installed-package boundary.

Run it from the repository root:

```sh
pnpm run test:package-contract
```

The fixture type-checks exact `Graph`, `TBlock`, and `TConnection` usage, exercises `waitForReady`, typed `evaluate`,
block click and drag, connection selection, and camera zoom, then smoke-tests the installed React entry point. The
vanilla project uses only the framework-free API, while still installing the package's currently required React
peers. Both temporary projects are deleted after the run and do not add another lockfile to the repository. Set
`KEEP_PACKAGE_CONTRACT_TMP=1` to preserve them for debugging a failure.
