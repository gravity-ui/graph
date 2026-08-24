# Installed Playwright consumer contract

This check validates the package boundary that repository-local E2E tests cannot cover. It builds and packs
`@gravity-ui/graph`, installs the tarball into a temporary project, bundles a minimal vanilla Graph page, and runs
Playwright through the public `@gravity-ui/graph/playwright` entry point.

The v1 TypeScript build emits extensionless ESM imports intended for bundlers, while Playwright loads this entry
directly in Node.js. `build:playwright-runtime` therefore rewrites only `build/playwright/index.js` as a standalone
CommonJS bundle; this test guards that installed-package boundary.

Run it from the repository root:

```sh
npm run test:package-contract
```

The fixture type-checks exact `Graph`, `TBlock`, and `TConnection` usage, then exercises `waitForReady`, typed
`evaluate`, block click and drag, connection selection, and camera zoom. The temporary project is deleted after the
run and does not add another lockfile to the repository. Set `KEEP_PACKAGE_CONTRACT_TMP=1` to preserve it for
debugging a failure.
