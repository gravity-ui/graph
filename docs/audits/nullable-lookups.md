# Nullable lookup contracts

Issue: https://github.com/gravity-ui/graph/issues/357. Base: merged #356,
`f9b9f222642882fe62cf10af6a618e354cd994a5`.

Public block/connection state lookups, block data, anchors, and block view hooks
explicitly return undefined for absence, preserving the union under transitional
non-strict declaration emit. Connection lists filter out missing IDs. Updating a
missing connection is a no-op, matching block updates.

React anchor lookup reads the block map and the current anchor signal in one
computation, tracking deletion/recreation without retaining a detached anchor.
The synchronous hook reads once; the reactive block hook subscribes to the map.

The selector's unchecked `BlockState<T>` assertion is removed. Lookup hooks do
not accept arbitrary subtype arguments. CanvasBlock no longer promises a custom
state or props shape from an ID. Its required binding checks state existence;
Anchor does likewise. Custom metadata consumers check their actual fields.
The settings types consequently drop the former block type parameter. All
public changes are recorded in the cumulative migration guide.

## Strict debt

| Project | Before | After |
| --- | ---: | ---: |
| graph | 297 | 290 |
| graph-react | 31 | 31 |
| graph-minimap | 2 | 2 |
| graph-devtools | 21 | 21 |
| Storybook | 188 | 143 |
| E2E configured roots | 0 | 0 |

The exact project/file/code/message/count comparison contains only removed
identities and reduced counts. No new errors or message identities are admitted.
Existing zero-error configuration boundaries and Scheduler remain enforced.
The two selector files and two lookup hook files now also require zero errors,
including during baseline writes. Broader entity, component and React strict
work remains in #360, #362 and #363; E2E test root coverage remains in #367.

## Validation

Runtime tests cover absent, added, removed and recreated block/anchor IDs,
connection removal and list filtering, and updates to missing connections.
The same strict positive/negative consumer fixtures run against source
entrypoints and installed packed declarations. Their unguarded lookup accesses
must fail, guarded results must work, and arbitrary generic calls are rejected.
The source fixture test checks consumer diagnostics; production source debt is
independently checked by the full strict gate. Build, workspace typecheck/lint,
all ten native configs, package tests, installed browser contracts and all 187
E2E tests pass. Independent read-only review found no actionable issues.
