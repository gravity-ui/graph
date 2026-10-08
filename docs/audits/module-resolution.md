# Source module resolution and native compatibility

Issue: https://github.com/gravity-ui/graph/issues/355. Base: merged #354 (`078d936e8022ba375fec6b9722a77779bc6ed162`).

All six esbuild source projects use `bundler` resolution, explicit Node/DOM environments and checked side-effect imports. Graph and React source configs explicitly include Jest; publish configs exclude Jest. React explicitly selects its React type environment. E2E no longer uses `baseUrl`. Publish configs keep `rootDir: ./src`; packed NodeNext/CJS consumers keep their own resolution modes.

`strict: false` is explicit for unfinished source projects so the native compiler's default does not enable strict ahead of the migration issues. The TypeScript 6.0.3 debt gate still checks all six projects with a strict overlay and protects Scheduler at zero. Each completed project's follow-up will set permanent strict to true.

Run `pnpm run typecheck:ts7`. It rebuilds packages and runs the pinned native TypeScript 7.0.2 CLI through `scripts/tsc-projects.mjs --compiler=native` (which prints the selected compiler and version) over all six source configs with no emit, all four publish configs with declaration emit into a temporary directory, and every `tests/types` consumer fixture. The compiler is isolated in `tools/typescript-native` (pnpm catalog `typescript7`) so it cannot replace the TypeScript 6.0.3 CLI/API used by builds, ESLint and the debt gate. CI runs it as the separate "TypeScript 7 compatibility" job.

Ambient `*.css` declarations cover source side-effect imports. The bundlers resolve CSS imports and reject missing files in their input graphs. A regression test invokes the real package build to confirm this for static and dynamic imports, including the JavaScript bundle’s empty CSS loader. `scripts/css-assets.mjs` only checks the public stylesheet contract: package builds require the public `./styles.css` export to match the built stylesheet; minimap cannot advertise a stylesheet it does not build. Existing packed artifact and browser checks validate the distributed files and styles. Consumer fixtures explicitly include a CSS declaration and check side-effect imports.

## Dependency declaration repair

Resolving style-observer 0.1.1's own published types exposes invalid inheritance in `MultiWeakMap.d.ts`: runtime `has` supports one or two arguments, and runtime `delete` returns void instead of WeakMap's boolean. A pnpm patch models the inherited base with `has`/`delete` omitted and supplies the accurate custom methods. Only this declaration is patched; runtime code is unchanged. No library checks are disabled. Native publish checks run with the existing `skipLibCheck: false`, and a test verifies these methods against the dependency's real JS implementation. Remove the patch when an upstream release fixes these types.

## Reviewed strict debt change

Re-resolving the real style-observer types removes TS7016 for the module and both TS7006 diagnostics for the inferred records and record callbacks. It exposes one TS2345 at `CSSVariablesLayer.createStyleObserver`: the targets array can contain the nullable container. That lifecycle boundary belongs to #358 (Layer lifecycle/resources); the caller currently guards it in `startObserving`, but the separate protected factory cannot rely on that narrowing. This source debt is explicitly tracked pending #358, rather than asserting the target or changing the protected API in this configuration PR.

The baseline update is explicit and must be reviewed alongside the above exact identity changes. Remaining counts and unchanged identities are verified by the full strict gate; Scheduler remains at zero. E2E test-root expansion remains #367.

Run `pnpm run test:type-configs` for CSS and compiler-runner failure regressions, the dependency runtime check and the `tests/types` fixtures with TypeScript 6.0.3.
