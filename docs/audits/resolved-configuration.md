# Resolved configuration boundary

Issue: https://github.com/gravity-ui/graph/issues/356. Base: merged #355
(`beb73d3faccf6bad0ccec315a2e0318e61cb79e7`).

The public input types `TGraphColorsPatch`, `TGraphConstantsPatch` and
`TGraphSettingsPatch` describe partial patches. Runtime signals, rendering
contexts, getters and color/constant events use `TGraphColors`,
`TGraphConstants` and `TGraphSettingsConfig`. Component overrides without a default are required keys with an explicit
undefined value; defaulted booleans, numbers,
colors and callbacks are always present.

Normalization copies input/default objects and skips undefined fields. Nested
objects merge by field, including component registrations and connection label
constants; arrays/tuples replace atomically. Settings resets are explicit through
`Graph.resetSettings(keys)` and `Graph.resetSettings()`, restoring an independent
snapshot of the normalized constructor settings rather than library defaults.
Subsequent configuration updates do not change that snapshot. The deprecated geometry
setting/enum is removed in favor of `canDrag`. Single-setting updates publish a
new signal value. Empty selectable entity lists disable rectangle selection.

The Graph component constructor type reuses the existing `Constructor` type;
selection treats it as an instance filter and does not construct instances.
The React hook has a public return type and applies the passed view configuration
rather than captured props. All consumer changes are described with examples in
[the application migration guide](../../packages/graph/docs/migration-guides/v1-to-v2.md).

## Strict debt review

| Project | Before | After |
| --- | ---: | ---: |
| graph | 354 | 297 |
| graph-react | 49 | 31 |
| graph-minimap | 4 | 2 |
| graph-devtools | 21 | 21 |
| Storybook | 206 | 188 |
| E2E configured roots | 0 | 0 |

The update removes resolved diagnostics and reduces occurrence counts. The
remaining React generic event-handler error (TS2345 in `useGraphEvents.ts`)
keeps its original complete configuration type name and its count of one;
fixing that generic event adapter belongs to #363. The four existing dynamic-key accesses in the Storybook theme example (TS7053)
now name `TGraphColorsPatch` in their message; their count is unchanged. No new
diagnostics or occurrence increases are admitted.

The baseline update was measured and compared by full project/file/code/message
identity. Scheduler remains at zero. `graphConfig.ts`, `store/settings.ts`,
`graphEvents.ts` and the normalization helper are now protected at zero for all
six project checks, including baseline writes. Configured E2E test-root expansion
remains #367.

Verification includes configuration runtime tests, a real React hook test, strict
packed-consumer positive/negative type cases, downstream declaration rebuilds,
installed package contracts and the rectangle-selection browser regression.
